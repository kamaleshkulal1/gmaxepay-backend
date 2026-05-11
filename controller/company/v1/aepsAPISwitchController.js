const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const { Op } = require('sequelize');

const getActiveAepsAPI = async (req, res) => {
    try {
        const companyId = req.user.companyId;

        let activeSwitch = await dbService.findOne(model.aepsAPISwitch, {
            companyId: companyId,
            isActive: true
        });

        if (!activeSwitch) {
            activeSwitch = await dbService.findOne(model.aepsAPISwitch, {
                companyId: null,
                isActive: true
            });
        }

        return res.success({
            message: 'Active AEPS API retrieved successfully',
            data: activeSwitch || null
        });
    } catch (error) {
        console.log('Get active AEPS API error:', error);
        return res.failure({ message: error.message || 'Internal server error' });
    }
}


module.exports = {
    getActiveAepsAPI
};
