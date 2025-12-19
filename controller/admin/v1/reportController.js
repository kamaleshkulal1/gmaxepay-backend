const dbService = require('../../../utils/dbService');
const model = require('../../../models/index');
const { Op } = require('sequelize');
const imageService = require('../../../services/imageService');


const getAepsReports = async (req, res) => {
    try {
        // Use userRole directly from req.user (set by authentication middleware)
        if (req.user?.userRole !== 1) {
            return res.failure({ message: 'Admin access required' });
        }

        const { query: queryFilter = {}, options: paginationOptions = {}, customSearch = {} } = req.body || {};
        
        // Build base query
        const query = { ...queryFilter };

        // Handle customSearch (iLike search on multiple fields)
        if (customSearch && typeof customSearch === 'object') {
            const orConditions = Object.entries(customSearch)
                .filter(([_, value]) => value !== undefined && value !== null && String(value).trim() !== '')
                .map(([key, value]) => ({
                    [key]: { [Op.iLike]: `%${String(value).trim()}%` }
                }));

            if (orConditions.length > 0) {
                query[Op.or] = orConditions;
            }
        }

        // Prepare options with company include
        const options = {
            ...paginationOptions,
            include: [{
                model: model.company,
                as: 'company',
                attributes: ['id', 'companyName', 'logo'],
                required: false
            }]
        };

        // Fetch paginated results
        const result = await dbService.paginate(model.aepsHistory, query, options);

        // Map results to include companyName and companyLogo with CDN URL
        const mappedData = result?.data?.map((transaction) => {
            const transactionData = transaction.toJSON ? transaction.toJSON() : transaction;
            const { company, ...restData } = transactionData;
            const companyData = company || {};
            
            return {
                ...restData,
                companyName: companyData.companyName || null,
                companyLogo: companyData.logo ? imageService.getImageUrl(companyData.logo, false) : null
            };
        }) || [];

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

