const dbService = require('../../../utils/dbService');
const model = require('../../../models/index');
const { Op } = require('sequelize');
const imageService = require('../../../services/imageService');

/**
 * Get AEPS Transaction Reports
 * Only accessible by userRole 1 (Super Admin)
 * Can see all companies' AEPS reports
 */
const getAepsReports = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            isActive: true
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        const userRole = existingUser.userRole;

        // Only userRole 1 (Super Admin) can access this endpoint
        if (userRole !== 1) {
            return res.failure({ message: 'Access denied. Only Super Admin can access AEPS reports.' });
        }

        const dataToFind = req.body || {};
        let options = {};
        let query = {}; // No companyId filter - can see all companies

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

        // Add include for company to get companyName and companyLogo
        if (!options.include) {
            options.include = [];
        }
        options.include.push({
            model: model.company,
            as: 'company',
            attributes: ['id', 'companyName', 'logo'],
            required: false // LEFT JOIN - include even if company not found
        });

        // Use paginate for consistent pagination response
        const result = await dbService.paginate(model.aepsHistory, query, options);

        // Map results to include companyName and companyLogo with CDN URL
        const mappedData = (result?.data || []).map((transaction) => {
            const transactionData = transaction.toJSON ? transaction.toJSON() : transaction;
            const companyData = transactionData.company || {};
            
            return {
                ...transactionData,
                companyName: companyData.companyName || null,
                companyLogo: companyData.logo ? imageService.getImageUrl(companyData.logo, false) : null
            };
        });

        return res.success({
            message: 'AEPS reports retrieved successfully',
            data: mappedData,
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

