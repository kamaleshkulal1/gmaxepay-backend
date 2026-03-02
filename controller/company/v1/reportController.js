const dbService = require('../../../utils/dbService');
const model = require('../../../models/index');
const { Op, Sequelize } = require('sequelize');

const getAeps1Reports = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId,
            isActive: true
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        const userRole = existingUser.userRole;
        const companyId = existingUser.companyId;

        // Only userRole 2 (Company Admin) can access this endpoint
        if (userRole !== 2) {
            return res.failure({ message: 'Access denied. Only Company Admin can access AEPS reports.' });
        }

        const dataToFind = req.body || {};
        let options = {};
        let query = { companyId: companyId }; // Only their company's transactions

        // Build query from request body
        if (dataToFind && dataToFind.query) {
            query = { ...query, ...dataToFind.query };
        }

        // Handle options (pagination, sorting)
        if (dataToFind && dataToFind.options !== undefined) {
            options = { ...dataToFind.options };
        }

        // Handle customSearch (iLike search on multiple fields)
        if (dataToFind?.customSearch && typeof dataToFind.customSearch === 'object') {
            const keys = Object.keys(dataToFind.customSearch);
            const orConditions = [];

            keys.forEach((key) => {
                const value = dataToFind.customSearch[key];
                if (value === undefined || value === null || String(value).trim() === '') return;

                orConditions.push({
                    [key]: {
                        [Op.iLike]: `%${String(value).trim()}%`
                    }
                });
            });

            if (orConditions.length > 0) {
                query = {
                    ...query,
                    [Op.or]: orConditions
                };
            }
        }

        // Use paginate for consistent pagination response
        const result = await dbService.paginate(model.aepsHistory, query, options);

        return res.success({
            message: 'AEPS reports retrieved successfully',
            data: result?.data || [],
            total: result?.total || 0,
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
            companyId: req.user.companyId,
            isActive: true
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        const userRole = existingUser.userRole;
        const companyId = existingUser.companyId;

        if (userRole !== 2) {
            return res.failure({
                message:
                    'Access denied. Only Company Admin can access AEPS2 reports.'
            });
        }

        const dataToFind = req.body || {};
        let options = {};
        let query = { companyId: companyId };

        if (dataToFind && dataToFind.query) {
            query = { ...query, ...dataToFind.query };
        }

        if (dataToFind && dataToFind.options !== undefined) {
            options = { ...dataToFind.options };
        }

        if (dataToFind?.customSearch && typeof dataToFind.customSearch === 'object') {
            const keys = Object.keys(dataToFind.customSearch);
            const orConditions = [];

            keys.forEach((key) => {
                const value = dataToFind.customSearch[key];
                if (value === undefined || value === null || String(value).trim() === '') return;

                orConditions.push({
                    [key]: {
                        [Op.iLike]: `%${String(value).trim()}%`
                    }
                });
            });

            if (orConditions.length > 0) {
                query = {
                    ...query,
                    [Op.or]: orConditions
                };
            }
        }

        const result = await dbService.paginate(model.practomindAepsHistory, query, options);

        return res.success({
            message: 'AEPS2 reports retrieved successfully',
            data: result?.data || [],
            total: result?.total || 0,
            paginator: result?.paginator
        });
    } catch (error) {
        console.error('AEPS2 reports error', error);
        return res.failure({
            message: error.message || 'Unable to retrieve AEPS2 reports'
        });
    }
};

const getRecharge1Reports = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId,
            isActive: true
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        const userRole = existingUser.userRole;
        const companyId = existingUser.companyId;

        if (userRole !== 2) {
            return res.failure({ message: 'Access denied. Only Company Admin can access Recharge reports.' });
        }

        const dataToFind = req.body || {};
        let options = {};
        let query = {
            companyId: companyId
        };

        if (dataToFind && dataToFind.query) {
            Object.keys(dataToFind.query).forEach(key => {
                if (key !== 'companyId') {
                    query[key] = dataToFind.query[key];
                }
            });
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

            if (customSearch.mobileNumber) {
                const searchValue = String(customSearch.mobileNumber).trim();
                if (searchValue) {
                    searchConditions.push({
                        mobileNumber: {
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
                    companyId: companyId,
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

const getRecharge2Reports = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId,
            isActive: true
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        const userRole = existingUser.userRole;
        const companyId = existingUser.companyId;

        if (userRole !== 2) {
            return res.failure({ message: 'Access denied. Only Company Admin can access Recharge reports.' });
        }

        const dataToFind = req.body || {};
        let options = {};
        let query = {
            companyId: companyId
        };

        if (dataToFind && dataToFind.query) {
            Object.keys(dataToFind.query).forEach(key => {
                if (key !== 'companyId') {
                    query[key] = dataToFind.query[key];
                }
            });
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

            if (customSearch.mobileNumber) {
                const searchValue = String(customSearch.mobileNumber).trim();
                if (searchValue) {
                    searchConditions.push({
                        mobileNumber: {
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
                    companyId: companyId,
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

            if (searchConditions.length > 0) {
                query = {
                    ...query,
                    [Op.and]: [
                        { [Op.or]: searchConditions }
                    ]
                };
            }
        }

        options.include = [
            {
                model: model.user,
                as: 'user',
                attributes: ['id', 'name', 'userId', 'mobileNo'],
                required: false
            }
        ];

        const result = await dbService.paginate(model.service1Transaction, query, options);

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
}

const getBbpReports = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId,
            isActive: true
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        const userRole = existingUser.userRole;
        const companyId = existingUser.companyId;

        if (userRole !== 2) {
            return res.failure({ message: 'Access denied. Only Company Admin can access BBP reports.' });
        }

        const dataToFind = req.body || {};
        let options = {};
        let query = {
            companyId: companyId
        };

        if (dataToFind && dataToFind.query) {
            Object.keys(dataToFind.query).forEach(key => {
                if (key !== 'companyId') {
                    query[key] = dataToFind.query[key];
                }
            });
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

            if (customSearch.mobileNumber) {
                const searchValue = String(customSearch.mobileNumber).trim();
                if (searchValue) {
                    searchConditions.push({
                        mobileNumber: {
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
                    companyId: companyId,
                    [Op.or]: userSearchFields,
                    isDeleted: false
                }, {
                    attributes: ['id']
                });

                const matchingUserIds = matchingUsers.map(u => u.id);
                if (matchingUserIds.length > 0) {
                    searchConditions.push({
                        userId: { [Op.in]: matchingUserIds }
                    });
                } else {
                    return res.status(200).send({
                        status: 'SUCCESS',
                        message: 'BBP reports retrieved successfully',
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

            if (searchConditions.length > 0) {
                query = {
                    ...query,
                    [Op.and]: [
                        { [Op.or]: searchConditions }
                    ]
                };
            }
        }

        options.include = [
            {
                model: model.user,
                as: 'user',
                attributes: ['id', 'name', 'userId', 'mobileNo'],
                required: false
            }
        ];

        const result = await dbService.paginate(model.billPaymentHistory, query, options);

        if (!result || !result.data || result.data.length === 0) {
            return res.status(200).send({
                status: 'SUCCESS',
                message: 'No BBP reports found',
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
            message: 'BBP reports retrieved successfully',
            data: result.data,
            total: result.total || 0,
            paginator: result.paginator
        });
    } catch (error) {
        console.error('BBP reports error', error);
        return res.failure({ message: error.message || 'Unable to retrieve BBP reports' });
    }
};


module.exports = {
    getAeps1Reports,
    getRecharge1Reports,
    getRecharge2Reports,
    getAeps2Reports,
    getBbpReports
};

