const dbService = require('../../../utils/dbService');
const model = require('../../../models/index');
const { Op, fn, col } = require('sequelize');
const imageService = require('../../../services/imageService');


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

        const { query: queryFilter = {}, options: paginationOptions = {}, customSearch = {}, fromDate, toDate } = req.body || {};
        
        // Build base query
        const query = { ...queryFilter };

        // Handle date range filtering (fromDate/toDate or startDate/endDate)
        if (fromDate || toDate || queryFilter.fromDate || queryFilter.toDate) {
            const startDate = fromDate || queryFilter.fromDate || queryFilter.startDate;
            const endDate = toDate || queryFilter.toDate || queryFilter.endDate;
            
            if (startDate && endDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.createdAt = { [Op.between]: [start, end] };
            } else if (startDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                query.createdAt = { [Op.gte]: start };
            } else if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.createdAt = { [Op.lte]: end };
            }
        }

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

        // Calculate total amount for filtered results
        const totalAmountResult = await model.aepsHistory.findAll({
            where: query,
            attributes: [
                [fn('SUM', col('amount')), 'totalAmount']
            ],
            raw: true
        });
        const totalAmount = parseFloat(totalAmountResult[0]?.totalAmount || 0);

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
            totalAmount: totalAmount,
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

