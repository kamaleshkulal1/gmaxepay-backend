const model = require('../../../models')
const dbService = require('../../../utils/dbService')
const asl = require('../../../services/asl')
const inspayService = require('../../../services/inspayService')
const bbpsService = require('../../../services/bbps')
const { Op } = require('sequelize')

const alsWallet = async (req, res) => {
    try {
        if (req.user.userRole !== 1) {
            return res.failure({ message: 'Unauthorized access' });
        }
        const response = await asl.alsWallet();

        if (response?.status === 'true' || response?.status === true) {
            return res.success({ message: 'Wallet fetched successfully', data: response });
        }

        return res.failure({ message: response?.message || 'Unable to fetch wallet balance' });
    } catch (error) {
        console.error('Error in alsWallet', error);
        return res.failure({ message: error.message || 'Unable to fetch wallet balance' });
    }
}

const walletBalance = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId,
            isActive: true
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        if (existingUser.userRole !== 1) {
            return res.failure({ message: 'Unauthorized access' });
        }

        // Fetch admin wallet and sum all aeps1Wallet and aeps2Wallet amounts in parallel for better performance
        const [wallet, totalAeps1Wallet, totalAeps2Wallet] = await Promise.all([
            dbService.findOne(model.wallet, {
                refId: existingUser.id,
                companyId: existingUser.companyId
            }),
            model.wallet.sum('apes1Wallet', {
                where: {
                    isDelete: false
                }
            }),
            model.wallet.sum('apes2Wallet', {
                where: {
                    isDelete: false
                }
            })
        ]);

        if (!wallet) {
            return res.failure({ message: 'Wallet not found' });
        }

        const response = {
            mainWallet: wallet?.mainWallet ? parseFloat(wallet.mainWallet).toFixed(2) : '0.00',
            apes1Wallet: (totalAeps1Wallet || 0).toFixed(2),
            apes2Wallet: (totalAeps2Wallet || 0).toFixed(2)
        }

        return res.success({ message: 'Wallet balance fetched successfully', data: response });
    } catch (error) {
        console.error('Error in walletBalance', error);
        return res.failure({ message: error.message });
    }
}

const inspayWallet = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId,
            isActive: true
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        if (existingUser.userRole !== 1) {
            return res.failure({ message: 'Unauthorized access' });
        }
        const response = await inspayService.checkBalance();
        return res.success({ message: 'Balance fetched successfully', data: response });
    } catch (error) {
        console.error('Error in inspayWallet', error);
        return res.failure({ message: error.message });
    }
};

const bbpsWallet = async (req, res) => {
    try {
        if (req.user.userRole !== 1) {
            return res.failure({ message: 'Unauthorized access' });
        }

        const result = await bbpsService.checkBalance();
        console.log('result', result);

        if (result?.data?.responseCode !== '000') {
            const errorMessage = result?.data?.errorInfo?.[0]?.error?.errorMessage ||
                'Unable to fetch BBPS balance. Please try again later.';

            if (result?.data?.errorInfo && result.data.errorInfo.length > 0) {
                result.data.errorInfo.forEach((errorItem, index) => {
                    const error = errorItem.error;
                    console.error(`BBPS Error ${index + 1}: Code: ${error.errorCode}, Message: ${error.errorMessage}`);
                });
            }

            return res.failure({
                message: errorMessage,
                data: result.data,
                requestId: result.requestId
            });
        }

        return res.success({
            message: 'BBPS balance fetched successfully',
            data: result.data,
            requestId: result.requestId
        });
    } catch (error) {
        console.error('Error in bbpWallet', error);
        return res.internalServerError({ message: error.message || 'Unable to fetch BBPS balance' });
    }
}

const walletHistory = async (req, res) => {
    try {
        const dataToFind = req.body;

        let query = {};

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
            if (dataToFind.customSearch.companyId) {
                query.companyId = dataToFind.customSearch.companyId;
            }
            if (dataToFind.customSearch.userId) {
                query.refId = dataToFind.customSearch.userId;
            }
            if (dataToFind.customSearch.transactionId) {
                query.transactionId = {
                    [Op.iLike]: `%${dataToFind.customSearch.transactionId}%`
                };
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
                    attributes: ['name', 'mobileNo']
                },
                {
                    model: model.company,
                    as: 'company',
                    attributes: ['companyName']
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
    alsWallet,
    walletBalance,
    inspayWallet,
    bbpsWallet,
    walletHistory
};