const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const { Op } = require('sequelize');

const getAllPayoutHistory = async (req, res) => {
    try {

        if (![1].includes(req.user.userRole)) {
            return res.failure({ message: 'You are not authorized to get all payout history' });
        }
        const dataToFind = req.body || {};
        let options = {};
        let query = {};

        if (dataToFind && dataToFind.query) {
            const { startDate, endDate, type, walletType, aepsType, ...restQuery } = dataToFind.query;

            query = { ...query, ...restQuery };

            if (startDate) {
                query.startDate = startDate;
            }
            if (endDate) {
                query.endDate = endDate;
            }

            if (type && typeof type === 'string' && type.toLowerCase() !== 'all') {
                query.type = type.toLowerCase();
            }

            if (dataToFind.query.payoutType) {
                query.payoutType = dataToFind.query.payoutType;
            }

            if (walletType && typeof walletType === 'string') {
                const normalizedWalletType = walletType.toUpperCase();
                if (normalizedWalletType === 'AEPS1') {
                    query.walletType = 'apes1Wallet';
                } else if (normalizedWalletType === 'AEPS2') {
                    query.walletType = 'apes2Wallet';
                } else {
                    query.walletType = walletType;
                }
            } else if (aepsType && typeof aepsType === 'string') {
                const normalizedAepsType = aepsType.toUpperCase();
                if (normalizedAepsType === 'AEPS1') {
                    query.walletType = 'apes1Wallet';
                } else if (normalizedAepsType === 'AEPS2') {
                    query.walletType = 'apes2Wallet';
                }
            }
        }

        if (dataToFind && dataToFind.options !== undefined) {
            options = { ...dataToFind.options };
        }

        if (dataToFind && dataToFind.customSearch) {
            const searchConditions = [];
            const customSearch = dataToFind.customSearch;

            if (customSearch.transactionID || customSearch.transactionId) {
                const searchValue = String(customSearch.transactionID || customSearch.transactionId).trim();
                if (searchValue) {
                    searchConditions.push({
                        transactionID: {
                            [Op.iLike]: `%${searchValue}%`
                        }
                    });
                }
            }

            if (customSearch.beneficiaryName) {
                const searchValue = String(customSearch.beneficiaryName).trim();
                if (searchValue) {
                    searchConditions.push({
                        beneficiaryName: {
                            [Op.iLike]: `%${searchValue}%`
                        }
                    });
                }
            }

            if (customSearch.payoutType) {
                const searchValue = String(customSearch.payoutType).trim();
                if (searchValue) {
                    searchConditions.push({
                        payoutType: {
                            [Op.iLike]: `%${searchValue}%`
                        }
                    });
                }
            }

            if (searchConditions.length > 0) {
                query = {
                    ...query,
                    [Op.and]: [{ [Op.or]: searchConditions }]
                };
            }
        }

        const result = await dbService.paginate(model.payoutHistory, query, options);

        return res.success({
            message: 'Payout history retrieved successfully',
            data: result?.data || [],
            total: result?.total || 0,
            paginator: result?.paginator
        });
    }
    catch (error) {
        console.log('Get all payout history error:', error);
        return res.failure({ message: error.message || 'Internal server error' });
    }
}

const getPayoutList = async (req, res) => {
    try {
        if (![1].includes(req.user.userRole)) {
            return res.failure({ message: 'You are not authorized to get payout list' });
        }
        const query = req.body || {};
        const result = await dbService.findAll(model.payoutList, query);

        return res.success({
            message: 'Payout list retrieved successfully',
            data: result || []
        });
    } catch (error) {
        console.log('Get payout list error:', error);
        return res.failure({ message: error.message || 'Internal server error' });
    }
}

const createPayoutList = async (req, res) => {
    try {
        if (![1].includes(req.user.userRole)) {
            return res.failure({ message: 'You are not authorized to create payout list' });
        }
        const { name, isActive } = req.body;
        if (!name) {
            return res.failure({ message: 'Name is required' });
        }

        if (isActive) {
            // Deactivate all other payout services globally if this one is active
            await dbService.update(model.payoutList,
                {},
                { isActive: false }
            );
        }

        const dataToCreate = {
            name,
            isActive: isActive || false
        };

        const result = await dbService.createOne(model.payoutList, dataToCreate);

        return res.success({
            message: 'Payout list entry created successfully',
            data: result
        });
    } catch (error) {
        console.log('Create payout list error:', error);
        return res.failure({ message: error.message || 'Internal server error' });
    }
}

const switchPayoutStatus = async (req, res) => {
    try {
        if (![1].includes(req.user.userRole)) {
            return res.failure({ message: 'You are not authorized to switch payout status' });
        }

        const { id } = req.body;
        if (!id) {
            return res.failure({ message: 'Payout ID is required' });
        }

        // Deactivate all payout services globally
        await dbService.update(model.payoutList,
            {
                id: { [Op.ne]: id }
            },
            { isActive: false }
        );

        // Activate the selected payout service
        await dbService.update(model.payoutList,
            { id: id },
            { isActive: true }
        );

        return res.success({
            message: 'Payout service switched successfully'
        });
    } catch (error) {
        console.log('Switch payout status error:', error);
        return res.failure({ message: error.message || 'Internal server error' });
    }
}

module.exports = {
    getAllPayoutHistory,
    getPayoutList,
    switchPayoutStatus,
    createPayoutList
};