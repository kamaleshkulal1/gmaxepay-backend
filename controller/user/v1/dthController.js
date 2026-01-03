const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const inspayService = require('../../../services/inspayService');

const dthPlanFetch = async (req, res) => {
    try {
        const { dth_number, opcode } = req.body;
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const operator = await dbService.findOne(model.operator, { operatorCode: opcode });
        if (!operator) {
            return res.failure({ message: 'Operator not found' });
        }
        const response = await inspayService.DTHPlanFetch(dth_number, opcode);

        if (response.status === 'Success') {
            return res.success({ message: 'DTH plan fetched successfully', data: response });
        } else {
            return res.failure({ message: response.message || 'Failed to fetch DTH plan' });
        }
    } catch (error) {
        console.log(error);
        return res.failure({ message: 'Failed to fetch DTH plan' });
    }
};

module.exports = {
    dthPlanFetch
};