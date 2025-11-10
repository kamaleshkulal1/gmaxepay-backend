const aepsService = require('../../../services/aepsService');
const dbService = require('../../../utils/dbService');
const model = require('../../../models');

const aepsOnboarding = async (req, res) => {
    try {
        const {  } = req.body;
        const existingUser = await dbService.findOne(model.user, { id: req.user.id})
        if(!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const outletDetails = await dbService.findOne(model.outlet, { refId: existingUser.id});
        if(!outletDetails) {
            return res.failure({ message: 'Outlet not found' });
        }
        const customerBankDetails = await dbService.findOne(model.customerBank, { refId: existingUser.id});
        if(!customerBankDetails) {
            return res.failure({ message: 'Customer bank not found' });
        }
        return res.success({ message: 'Aeps onboarding successful', data: aepsOnboardingDetails });
    } catch (error) {
        console.error(error);
        return res.failure({ message: error.message });
    }
}

module.exports = { aepsOnboarding };