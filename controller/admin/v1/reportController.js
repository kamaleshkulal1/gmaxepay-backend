const dbService = require('../../../utils/dbService');
const model = require('../../../models/index');
const { Op, fn, col } = require('sequelize');
const imageService = require('../../../services/imageService');
const e = require('express');


const getAepsReports = async (req, res) => {
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

const getAepsTransactionDetailsById=async(req,res)=>{
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
               parentName: reportingUserDetails.name ||companyAdmin.name,
               parentRole: reportingUserDetails.userRole ||companyAdmin.userRole,
               parentUserId: reportingUserDetails.userId ||companyAdmin.userId,
            },
            transactionDetails: {
                amount: transaction.amount,
                bankName: existingbankDetails.bankName,
                aadharNumber: transaction.consumerAadhaarNumber,
                commission: transaction.credit,
            },
            transaction:transaction
        }
        return res.success({ message: 'AEPS transaction details retrieved successfully', data: data });
    } catch (error) {
        console.error('AEPS transaction details error', error);
        return res.failure({ message: error.message || 'Unable to retrieve AEPS transaction details' });
    }
}

module.exports = {
    getAepsReports,
    getAepsTransactionDetailsById
};

