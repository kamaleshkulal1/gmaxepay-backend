const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const cmsService = require('../../../services/cmsService');
const { generateTransactionID } = require('../../../utils/transactionID');

const initiateCms = async (req, res) => {
    try {

        const [existingUser, companyDetails] = await Promise.all([
            dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId }),
            dbService.findOne(model.company, { id: req.user.companyId })
        ]);
        if (!existingUser) return res.failure({ message: 'User not found' });
        if (!companyDetails) return res.failure({ message: 'Company not found' });

        const referenceId = generateTransactionID(companyDetails.companyName || 'GMAXEPAY');
        await dbService.createOne(model.cmsHistory, {
            refId: req.user.id,
            companyId: req.user.companyId,
            referenceId,
            mobileNo,
            status: 'PENDING',
            addedBy: req.user.id,
            updatedBy: req.user.id
        });

        const externalRes = await cmsService.initiateAirtelCms(referenceId);

        if (externalRes.status) {
            return res.success({
                message: externalRes.message,
                data: externalRes.data
            });
        } else {
            await dbService.update(model.cmsHistory, { referenceId }, {
                status: 'FAILED',
                errorMsg: externalRes.message,
                responsePayload: externalRes.data
            });

            return res.failure({
                message: externalRes.message,
                data: externalRes.data
            });
        }

    } catch (err) {
        console.error('Initiate CMS error:', err);
        return res.failure({ message: err.message || 'Internal Server Error' });
    }
};
module.exports = {
    initiateCms
};

