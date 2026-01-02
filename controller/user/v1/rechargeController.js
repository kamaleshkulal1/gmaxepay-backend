const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const inspayService = require('../../../services/inspayService');

const recharge = async (req, res) => {
    try {
        const { amount } = req.body;
    } catch (error) {
        console.log(error);
        return res.internalServerError({ message: error.message });
    }
};

const findMobileNumberOperator = async (req, res) => {
    try {
        const { mobileNumber } = req.body;
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const response = await inspayService.operatorFetch(mobileNumber);
        if (response.status === 'Success') {
            return res.success({ message: 'Operator retrieved successfully', data: response });
        } else {
            return res.failure({ message: response.message || 'Failed to fetch operator' });
        }
    } catch (error) {
        console.log(error);
        return res.failure({ message: error.message });
    }
};

const  findAllRechargePlanFetch = async (req, res) => {
    try {
        const { mobileNumber,opCode,circle } = req.body;
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const operator = await dbService.findOne(model.operator,{operatorCode:opCode});
        if (!operator) {
            return res.failure({ message: 'Operator not found' });
        }
        const response = await inspayService.rechargePlanFetch(mobileNumber,opCode,circle);
        console.log('response', response);
        if (response.status === 'Success') {
            return res.success({ message: 'Recharge plan retrieved successfully', data: response });
        } else {
            return res.failure({ message: response.message || 'Failed to fetch recharge plan' });
        }
    } catch (error) {
        console.log(error);
        return res.failure({ message: error.message });
    }
};

const getRechargeHistory = async (req, res) => {
    try {
        const { userId } = req.user;
        const existingUser = await dbService.findOne(model.user, { id: userId, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const rechargeHistory = await dbService.findAll(model.rechargeHistory, { userId: userId, companyId: req.user.companyId });
        if (!rechargeHistory) {
            return res.failure({ message: 'Recharge history not found' });
        }
        return res.success({ message: 'Recharge history retrieved successfully', data: rechargeHistory });
        } catch (error) {
        console.log(error);
        return res.internalServerError({ message: error.message });
    }
};

module.exports = {
    recharge,
    findMobileNumberOperator,
    getRechargeHistory,
    findAllRechargePlanFetch
};