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

        // Prepare options with company, user, and bank includes
        const options = {
            ...paginationOptions,
            include: [
                {
                    model: model.company,
                    as: 'company',
                    attributes: ['id', 'companyName', 'logo'],
                    required: false
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
                    required: false
                }
            ]
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

