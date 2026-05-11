const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const { Op } = require('sequelize');

const getActiveAepsAPI = async (req, res) => {
    try {
        const { aepsType } = req.query;
        const baseQuery = { isActive: true };
        if (aepsType) {
            baseQuery.aepsType = aepsType;
        }

        let activeSwitch = await dbService.findOne(model.aepsAPISwitch, baseQuery);

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
