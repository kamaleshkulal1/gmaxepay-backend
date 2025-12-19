const dbService = require('../../../utils/dbService');
const model = require('../../../models/index');
const { Op } = require('sequelize');

/**
 * Get AEPS Transaction Reports
 * Only accessible by userRole 2 (Company Admin)
 * Can only see their own company's AEPS reports
 */
const getAepsReports = async (req, res) => {
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

module.exports = {
    getAepsReports
};

