const dbService = require('../../../utils/dbService');
const model = require('../../../models/index');
const { Op, fn, col } = require('sequelize');
const imageService = require('../../../services/imageService');

const getAeps1Reports = async (req, res) => {
    try {
        // Use userRole directly from req.user (set by authentication middleware)
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            isActive: true
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        if (req.user?.userRole !== 1) {
            return res.failure({ message: 'Unauthorized access' });
        }

        const { query: queryFilter = {}, options: paginationOptions = {}, customSearch = {} } = req.body || {};

        // Build base query
        const query = { ...queryFilter };

        // Define fields that belong to related tables
        const userFields = ['name', 'userName', 'mobileNo', 'userId'];
        const companyFields = ['companyName'];
        const bankFields = ['bankName'];

        // Separate customSearch into main table fields and related table fields
        const mainTableSearch = {};
        const userSearch = {};
        const companySearch = {};
        const bankSearch = {};

        // Handle customSearch (iLike search on multiple fields)
        if (customSearch && typeof customSearch === 'object') {
            Object.entries(customSearch).forEach(([key, value]) => {
                if (value === undefined || value === null || String(value).trim() === '') {
                    return;
                }

                const trimmedValue = String(value).trim();

                if (userFields.includes(key)) {
                    userSearch[key] = { [Op.iLike]: `%${trimmedValue}%` };
                } else if (companyFields.includes(key)) {
                    companySearch[key] = { [Op.iLike]: `%${trimmedValue}%` };
                } else if (bankFields.includes(key)) {
                    bankSearch[key] = { [Op.iLike]: `%${trimmedValue}%` };
                } else {
                    // Fields that belong to aepsHistory table (transactionId, status, etc.)
                    mainTableSearch[key] = { [Op.iLike]: `%${trimmedValue}%` };
                }
            });
        }

        // If searching by user fields, use subquery to find matching user IDs
        if (Object.keys(userSearch).length > 0) {
            const userWhereConditions = Object.entries(userSearch).map(([key, value]) => ({
                [key]: value
            }));

            // Find user IDs that match the search criteria
            const matchingUsers = await model.user.findAll({
                where: {
                    [Op.or]: userWhereConditions
                },
                attributes: ['id'],
                raw: true
            });

            const userIds = matchingUsers.map(u => u.id);

            if (userIds.length > 0) {
                // Add refId filter to main query
                // If refId already exists in queryFilter, intersect with matching userIds (AND condition)
                if (query.refId) {
                    const existingRefId = query.refId;
                    // If it's a single value, check if it matches
                    if (typeof existingRefId === 'number' || (typeof existingRefId === 'string' && !isNaN(existingRefId))) {
                        const refIdNum = parseInt(existingRefId);
                        if (userIds.includes(refIdNum)) {
                            query.refId = refIdNum; // Keep the existing refId if it matches
                        } else {
                            query.id = { [Op.in]: [] }; // No match, return empty
                        }
                    } else if (existingRefId[Op.in]) {
                        // If it's already an Op.in condition, intersect
                        const existingIds = Array.isArray(existingRefId[Op.in]) ? existingRefId[Op.in] : [existingRefId[Op.in]];
                        const intersection = existingIds.filter(id => userIds.includes(parseInt(id)));
                        if (intersection.length > 0) {
                            query.refId = { [Op.in]: intersection };
                        } else {
                            query.id = { [Op.in]: [] }; // No match, return empty
                        }
                    } else {
                        query.refId = { [Op.in]: userIds };
                    }
                } else {
                    query.refId = { [Op.in]: userIds };
                }
            } else {
                // No users found matching criteria, return empty result
                query.id = { [Op.in]: [] }; // This will return no results
            }
        }

        // Add main table search conditions
        if (Object.keys(mainTableSearch).length > 0) {
            const orConditions = Object.entries(mainTableSearch).map(([key, value]) => ({
                [key]: value
            }));

            // Combine with existing OR conditions if any
            if (query[Op.or]) {
                const existingOr = Array.isArray(query[Op.or]) ? query[Op.or] : [query[Op.or]];
                query[Op.or] = [...existingOr, ...orConditions];
            } else {
                query[Op.or] = orConditions;
            }
        }

        // Prepare options with company, user, and bank includes
        const includeOptions = [
            {
                model: model.company,
                as: 'company',
                attributes: ['id', 'companyName', 'logo'],
                required: false,
                ...(Object.keys(companySearch).length > 0 && { where: companySearch })
            },
            {
                model: model.user,
                as: 'user',
                attributes: ['id', 'name', 'userRole', 'profileImage', 'mobileNo'],
                required: false
            },
            {
                model: model.aslBankList,
                as: 'bank',
                attributes: ['id', 'bankName'],
                required: false,
                ...(Object.keys(bankSearch).length > 0 && { where: bankSearch })
            }
        ];

        const options = {
            ...paginationOptions,
            include: includeOptions
        };

        // Fetch paginated results
        const result = await dbService.paginate(model.aepsHistory, query, options);

        // Map results to include companyName, companyLogo, user details, and bank name with CDN URLs
        const mappedData = result?.data?.map((transaction) => {
            const transactionData = transaction.toJSON ? transaction.toJSON() : transaction;
            const { company, user, bank, ...restData } = transactionData;
            const companyData = company || {};
            const userData = user || {};
            const bankData = bank || {};

            return {
                ...restData,
                companyName: companyData.companyName || null,
                companyLogo: companyData.logo ? imageService.getImageUrl(companyData.logo, false) : null,
                bankName: bankData.bankName || null,
                userDetails: userData.id ? {
                    name: userData.name || null,
                    userRole: userData.userRole || null,
                    profileImage: userData.profileImage ? imageService.getImageUrl(userData.profileImage, false) : null,
                    mobileNo: userData.mobileNo || null
                } : null
            };
        }) || [];

        return res.status(200).json({
            status: 'SUCCESS',
            message: 'AEPS reports retrieved successfully',
            data: mappedData,
            total: result?.total || mappedData.length || 0,
            count: mappedData.length || 0,
            paginator: result?.paginator
        });
    } catch (error) {
        console.error('AEPS reports error', error);
        return res.failure({ message: error.message || 'Unable to retrieve AEPS reports' });
    }
};

const getAeps2Reports = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            isActive: true
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        if (req.user?.userRole !== 1) {
            return res.failure({ message: 'Unauthorized access' });
        }

        const {
            query: queryFilter = {},
            options: paginationOptions = {},
            customSearch = {}
        } = req.body || {};

        // Build base query
        const query = { ...queryFilter };

        // Define fields that belong to related tables
        const userFields = ['name', 'userName', 'mobileNo', 'userId'];
        const companyFields = ['companyName'];
        const bankFields = ['bankName'];

        // Separate customSearch into main table fields and related table fields
        const mainTableSearch = {};
        const userSearch = {};
        const companySearch = {};
        const bankSearch = {};

        // Handle customSearch (iLike search on multiple fields)
        if (customSearch && typeof customSearch === 'object') {
            Object.entries(customSearch).forEach(([key, value]) => {
                if (value === undefined || value === null || String(value).trim() === '') {
                    return;
                }

                const trimmedValue = String(value).trim();

                if (userFields.includes(key)) {
                    userSearch[key] = { [Op.iLike]: `%${trimmedValue}%` };
                } else if (companyFields.includes(key)) {
                    companySearch[key] = { [Op.iLike]: `%${trimmedValue}%` };
                } else if (bankFields.includes(key)) {
                    bankSearch[key] = { [Op.iLike]: `%${trimmedValue}%` };
                } else {
                    // Fields that belong to practomindAepsHistory table (transactionId, status, etc.)
                    mainTableSearch[key] = { [Op.iLike]: `%${trimmedValue}%` };
                }
            });
        }

        // If searching by user fields, use subquery to find matching user IDs
        if (Object.keys(userSearch).length > 0) {
            const userWhereConditions = Object.entries(userSearch).map(([key, value]) => ({
                [key]: value
            }));

            const matchingUsers = await model.user.findAll({
                where: {
                    [Op.or]: userWhereConditions
                },
                attributes: ['id'],
                raw: true
            });

            const userIds = matchingUsers.map((u) => u.id);

            if (userIds.length > 0) {
                if (query.refId) {
                    const existingRefId = query.refId;
                    if (
                        typeof existingRefId === 'number' ||
                        (typeof existingRefId === 'string' && !isNaN(existingRefId))
                    ) {
                        const refIdNum = parseInt(existingRefId);
                        if (userIds.includes(refIdNum)) {
                            query.refId = refIdNum;
                        } else {
                            query.id = { [Op.in]: [] };
                        }
                    } else if (existingRefId[Op.in]) {
                        const existingIds = Array.isArray(existingRefId[Op.in])
                            ? existingRefId[Op.in]
                            : [existingRefId[Op.in]];
                        const intersection = existingIds.filter((id) =>
                            userIds.includes(parseInt(id))
                        );
                        if (intersection.length > 0) {
                            query.refId = { [Op.in]: intersection };
                        } else {
                            query.id = { [Op.in]: [] };
                        }
                    } else {
                        query.refId = { [Op.in]: userIds };
                    }
                } else {
                    query.refId = { [Op.in]: userIds };
                }
            } else {
                query.id = { [Op.in]: [] };
            }
        }

        // Add main table search conditions
        if (Object.keys(mainTableSearch).length > 0) {
            const orConditions = Object.entries(mainTableSearch).map(([key, value]) => ({
                [key]: value
            }));

            if (query[Op.or]) {
                const existingOr = Array.isArray(query[Op.or]) ? query[Op.or] : [query[Op.or]];
                query[Op.or] = [...existingOr, ...orConditions];
            } else {
                query[Op.or] = orConditions;
            }
        }

        // Prepare options with company, user, and bank includes
        const includeOptions = [
            {
                model: model.company,
                as: 'company',
                attributes: ['id', 'companyName', 'logo'],
                required: false,
                ...(Object.keys(companySearch).length > 0 && { where: companySearch })
            },
            {
                model: model.user,
                as: 'user',
                attributes: ['id', 'name', 'userRole', 'profileImage', 'mobileNo'],
                required: false
            },
            {
                model: model.practomindBankList,
                as: 'bank',
                attributes: ['id', 'bankName'],
                required: false,
                ...(Object.keys(bankSearch).length > 0 && { where: bankSearch })
            }
        ];

        const options = {
            ...paginationOptions,
            include: includeOptions
        };

        // Fetch paginated results
        const result = await dbService.paginate(model.practomindAepsHistory, query, options);

        // Map results to include companyName, companyLogo, user details, and bank name with CDN URLs
        const mappedData =
            result?.data?.map((transaction) => {
                const transactionData = transaction.toJSON ? transaction.toJSON() : transaction;
                const { company, user, bank, ...restData } = transactionData;
                const companyData = company || {};
                const userData = user || {};
                const bankData = bank || {};

                return {
                    ...restData,
                    companyName: companyData.companyName || null,
                    companyLogo: companyData.logo
                        ? imageService.getImageUrl(companyData.logo, false)
                        : null,
                    bankName: bankData.bankName || null,
                    userDetails: userData.id
                        ? {
                            name: userData.name || null,
                            userRole: userData.userRole || null,
                            profileImage: userData.profileImage
                                ? imageService.getImageUrl(userData.profileImage, false)
                                : null,
                            mobileNo: userData.mobileNo || null
                        }
                        : null
                };
            }) || [];

        return res.status(200).json({
            status: 'SUCCESS',
            message: 'AEPS2 reports retrieved successfully',
            data: mappedData,
            total: result?.total || mappedData.length || 0,
            count: mappedData.length || 0,
            paginator: result?.paginator
        });
    } catch (error) {
        console.error('AEPS2 reports error', error);
        return res.failure({ message: error.message || 'Unable to retrieve AEPS2 reports' });
    }
};

const getAepsTransactionDetailsById = async (req, res) => {
    try {
        const { id } = req.params;
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            isActive: true
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        if (req.user?.userRole !== 1) {
            return res.failure({ message: 'Unauthorized access' });
        }
        const transaction = await dbService.findOne(model.aepsHistory, { id });
        if (!transaction) {
            return res.failure({ message: 'Transaction not found' });
        }
        const existingUserDetails = await dbService.findOne(model.user, {
            id: transaction.refId,
            isActive: true
        });
        if (!existingUserDetails) {
            return res.failure({ message: 'User details not found' });
        }
        const reportingUserDetails = await dbService.findOne(model.user, {
            id: existingUserDetails.reportingTo,
            isActive: true
        });
        const companyDetails = await dbService.findOne(model.company, {
            id: existingUserDetails.companyId,
        });

        if (!companyDetails) {
            return res.failure({ message: 'Company details not found' });
        }
        const companyAdmin = await dbService.findOne(model.user, {
            companyId: companyDetails.id,
            userRole: 2
        });
        if (!companyAdmin) {
            return res.failure({ message: 'Company admin details not found' });
        }
        const existingbankDetails = await dbService.findOne(model.aslBankList, {
            bankIIN: transaction.bankiin,
        });
        if (!existingbankDetails) {
            return res.failure({ message: 'Bank details not found' });
        }
        const data = {
            userDetails: {
                name: existingUserDetails.name,
                userRole: existingUserDetails.userRole,
                userId: existingUserDetails.userId,
                mobileNo: existingUserDetails.mobileNo
            },
            reportingUserDetails: {
                companyName: companyDetails.companyName,
                parentName: reportingUserDetails?.name || companyAdmin.name,
                parentRole: reportingUserDetails?.userRole || companyAdmin.userRole,
                parentUserId: reportingUserDetails?.userId || companyAdmin.userId
            },
            transactionDetails: {
                amount: transaction.amount,
                bankName: existingbankDetails.bankName,
                aadharNumber: transaction.consumerAadhaarNumber,
                commission: transaction.credit,
            },
            transaction: transaction
        }
        return res.success({ message: 'AEPS transaction details retrieved successfully', data: data });
    } catch (error) {
        console.error('AEPS transaction details error', error);
        return res.failure({ message: error.message || 'Unable to retrieve AEPS transaction details' });
    }
}

const getAeps2TransactionDetailsById = async (req, res) => {
    try {
        const { id } = req.params;
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            isActive: true
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        if (req.user?.userRole !== 1) {
            return res.failure({ message: 'Unauthorized access' });
        }

        const transaction = await dbService.findOne(model.practomindAepsHistory, { id });
        if (!transaction) {
            return res.failure({ message: 'Transaction not found' });
        }

        const existingUserDetails = await dbService.findOne(model.user, {
            id: transaction.refId,
            isActive: true
        });
        if (!existingUserDetails) {
            return res.failure({ message: 'User details not found' });
        }

        const reportingUserDetails = await dbService.findOne(model.user, {
            id: existingUserDetails.reportingTo,
            isActive: true
        });

        const companyDetails = await dbService.findOne(model.company, {
            id: existingUserDetails.companyId
        });

        if (!companyDetails) {
            return res.failure({ message: 'Company details not found' });
        }

        const companyAdmin = await dbService.findOne(model.user, {
            companyId: companyDetails.id,
            userRole: 2
        });
        if (!companyAdmin) {
            return res.failure({ message: 'Company admin details not found' });
        }

        const existingBankDetails = await dbService.findOne(model.practomindBankList, {
            aeps_bank_id: transaction.bankIin
        });
        if (!existingBankDetails) {
            return res.failure({ message: 'Bank details not found' });
        }

        const data = {
            userDetails: {
                name: existingUserDetails.name,
                userRole: existingUserDetails.userRole,
                userId: existingUserDetails.userId,
                mobileNo: existingUserDetails.mobileNo
            },
            reportingUserDetails: {
                companyName: companyDetails.companyName,
                parentName: reportingUserDetails?.name || companyAdmin.name,
                parentRole: reportingUserDetails?.userRole || companyAdmin.userRole,
                parentUserId: reportingUserDetails?.userId || companyAdmin.userId
            },
            transactionDetails: {
                amount: transaction.transactionAmount,
                bankName: existingBankDetails.bankName,
                aadharNumber: transaction.consumerAadhaarNumber,
                commission: null
            },
            transaction: transaction
        };

        return res.success({
            message: 'AEPS2 transaction details retrieved successfully',
            data
        });
    } catch (error) {
        console.error('AEPS2 transaction details error', error);
        return res.failure({
            message: error.message || 'Unable to retrieve AEPS2 transaction details'
        });
    }
}

const getRechargeReports = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            isActive: true
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        if (req.user?.userRole !== 1) {
            return res.failure({ message: 'Unauthorized access' });
        }

        const dataToFind = req.body || {};
        let options = {};
        let query = {};

        if (dataToFind && dataToFind.query) {
            query = { ...dataToFind.query };
        }

        if (dataToFind && dataToFind.options !== undefined) {
            options = { ...dataToFind.options };

            if (dataToFind.options.sort) {
                const sortEntries = Object.entries(dataToFind.options.sort);
                options.order = sortEntries.map(([field, direction]) => {
                    return [field, direction === -1 ? 'DESC' : 'ASC'];
                });
            } else {
                options.order = [['createdAt', 'DESC']];
            }
        } else {
            options.order = [['createdAt', 'DESC']];
        }

        if (dataToFind?.customSearch && typeof dataToFind.customSearch === 'object') {
            const searchConditions = [];
            const customSearch = dataToFind.customSearch;

            if (customSearch.transactionId) {
                const searchValue = String(customSearch.transactionId).trim();
                if (searchValue) {
                    searchConditions.push({
                        transactionId: {
                            [Op.iLike]: `%${searchValue}%`
                        }
                    });
                }
            }

            const userSearchFields = [];
            if (customSearch.name) {
                const searchName = String(customSearch.name).trim();
                if (searchName) {
                    userSearchFields.push({
                        name: {
                            [Op.iLike]: `%${searchName}%`
                        }
                    });
                }
            }

            if (customSearch.mobileNo) {
                const searchMobileNo = String(customSearch.mobileNo).trim();
                if (searchMobileNo) {
                    userSearchFields.push({
                        mobileNo: {
                            [Op.iLike]: `%${searchMobileNo}%`
                        }
                    });
                }
            }

            if (userSearchFields.length > 0) {
                const matchingUsers = await dbService.findAll(model.user, {
                    [Op.or]: userSearchFields,
                    isDeleted: false
                }, {
                    attributes: ['id']
                });

                const matchingUserIds = matchingUsers.map(u => u.id);
                if (matchingUserIds.length > 0) {
                    searchConditions.push({
                        refId: { [Op.in]: matchingUserIds }
                    });
                } else {
                    // If user search found no matching users, return empty result
                    return res.status(200).send({
                        status: 'SUCCESS',
                        message: 'Recharge reports retrieved successfully',
                        data: [],
                        total: 0,
                        paginator: {
                            page: options.page || 1,
                            paginate: options.paginate || 10,
                            totalPages: 0
                        }
                    });
                }
            }

            // Only apply search conditions if there are any valid conditions
            if (searchConditions.length > 0) {
                query = {
                    ...query,
                    [Op.and]: [
                        { [Op.or]: searchConditions }
                    ]
                };
            }
            // If no search conditions found, continue with base query (will return all records)
        }

        options.include = [
            {
                model: model.user,
                as: 'user',
                attributes: ['id', 'name', 'userId', 'mobileNo'],
                required: false
            }
        ];

        const result = await dbService.paginate(model.serviceTransaction, query, options);

        if (!result || !result.data || result.data.length === 0) {
            return res.status(200).send({
                status: 'SUCCESS',
                message: 'No recharge reports found',
                data: [],
                total: result?.total || 0,
                paginator: result?.paginator || {
                    page: options.page || 1,
                    paginate: options.paginate || 10,
                    totalPages: 0
                }
            });
        }

        return res.status(200).send({
            status: 'SUCCESS',
            message: 'Recharge reports retrieved successfully',
            data: result.data,
            total: result.total || 0,
            paginator: result.paginator
        });
    } catch (error) {
        console.error('Recharge reports error', error);
        return res.failure({ message: error.message || 'Unable to retrieve Recharge reports' });
    }
};


const getSurRecReports = async (req, res) => {
    try {
        if (req.user?.userRole !== 1) {
            return res.failure({ message: 'Unauthorized access' });
        }

        const dataToFind = req.body || {};
        const { query: queryFilter = {}, options: paginationOptions = {}, customSearch = {} } = dataToFind;

        let query = {};

        // Custom Search (Transaction ID)
        if (customSearch.transactionId) {
            const trimmedValue = String(customSearch.transactionId).trim();
            if (trimmedValue) {
                query.transactionId = {
                    [Op.iLike]: `%${trimmedValue}%`
                };
            }
        }

        if (queryFilter.startDate && queryFilter.endDate) {
            query.createdAt = {
                [Op.between]: [queryFilter.startDate, queryFilter.endDate]
            };
        } else if (queryFilter.startDate) {
            query.createdAt = { [Op.gte]: queryFilter.startDate };
        } else if (queryFilter.endDate) {
            query.createdAt = { [Op.lte]: queryFilter.endDate };
        }

        const options = {
            ...paginationOptions,
            order: paginationOptions.order || [['createdAt', 'DESC']]
        };

        const result = await dbService.paginate(model.surRecords, query, options);

        return res.success({
            message: 'Surcharge reports retrieved successfully',
            data: result.data || [],
            total: result.total || 0,
            paginator: result.paginator
        });

    } catch (error) {
        console.error('SurCharge reports error', error);
        return res.failure({ message: error.message || 'Unable to retrieve SurCharge reports' });
    }
};

module.exports = {
    getAeps1Reports,
    getAepsTransactionDetailsById,
    getRechargeReports,
    getAeps2Reports,
    getAeps2TransactionDetailsById,
    getSurRecReports
};
