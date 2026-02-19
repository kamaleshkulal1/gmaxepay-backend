const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const { Op } = require('sequelize');

const walletBalance = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId,
            isActive: true,
            isDeleted: false
        });
        if (existingUser.userRole !== 2) {
            return res.failure({ message: 'Unauthorized access' });
        }
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const wallet = await dbService.findOne(model.wallet, {
            refId: existingUser.id,
            companyId: existingUser.companyId
        });
        if (!wallet) {
            return res.failure({ message: 'Wallet not found' });
        }
        const response = {
            mainWallet: wallet?.mainWallet.toFixed(2) || 0,
            apes1Wallet: wallet?.apes1Wallet.toFixed(2) || 0,
            apes2Wallet: wallet?.apes2Wallet.toFixed(2) || 0
        }
        return res.success({ message: 'Wallet balance fetched successfully', data: response });
    }
    catch (error) {
        console.error('Error in walletBalance', error);
        return res.failure({ message: error.message });
    }
}

const walletHistory = async (req, res) => {
    try {
        const dataToFind = req.body;
        const user = req.user;

        let query = {
            companyId: user.companyId
        };

        // Merge request query
        if (dataToFind.query) {
            // Handle Date Range in query
            if (dataToFind.query.startDate && dataToFind.query.endDate) {
                query.createdAt = {
                    [Op.between]: [new Date(dataToFind.query.startDate), new Date(dataToFind.query.endDate)]
                };
                delete dataToFind.query.startDate;
                delete dataToFind.query.endDate;
            } else if (dataToFind.query.startDate) {
                query.createdAt = {
                    [Op.gte]: new Date(dataToFind.query.startDate)
                };
                delete dataToFind.query.startDate;
            } else if (dataToFind.query.endDate) {
                query.createdAt = {
                    [Op.lte]: new Date(dataToFind.query.endDate)
                };
                delete dataToFind.query.endDate;
            }

            Object.assign(query, dataToFind.query);
        }

        // Handle Custom Search
        if (dataToFind.customSearch) {
            if (dataToFind.customSearch.transactionId) {
                query.transactionId = {
                    [Op.iLike]: `%${dataToFind.customSearch.transactionId}%`
                };
            }
            if (dataToFind.customSearch.userId) {
                query.refId = dataToFind.customSearch.userId;
            }
        }

        // Options (Pagination & Sorting)
        let options = {
            page: 1,
            paginate: 10,
            order: [['createdAt', 'DESC']],
            where: query,
            include: [
                {
                    model: model.user,
                    as: 'user',
                    attributes: ['name', 'mobile']
                }
            ]
        };

        if (dataToFind.options) {
            options.page = dataToFind.options.page || 1;
            options.paginate = dataToFind.options.paginate || 10;

            if (dataToFind.options.sort) {
                const sortEntries = Object.entries(dataToFind.options.sort);
                options.order = sortEntries.map(([key, value]) => [key, value === -1 ? 'DESC' : 'ASC']);
            }
        }

        const history = await model.walletHistory.paginate(options);

        return res.success({
            message: 'Wallet history fetched successfully',
            data: history
        });

    } catch (error) {
        console.error('Error in walletHistory', error);
        return res.failure({ message: error.message });
    }
}

module.exports = {
    walletBalance,
    walletHistory
}