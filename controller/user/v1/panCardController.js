const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const ekycHub = require('../../../services/eKycHub');
const { generateTransactionID } = require('../../../utils/transactionID');

const panCardActions = async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.companyId;
    const { mobile_number, action} = req.body;

    const mobileNumber = mobile_number;
    if (!mobileNumber) {
      return res.failure({ message: 'Mobile number is required' });
    }

    if (!action || (action !== 'new' && action !== 'correction')) {
      return res.failure({ message: 'Invalid action. Action must be either "new" or "correction"' });
    }

    const [user, existingCompany] = await Promise.all([
      dbService.findOne(model.user, { id: userId }),
      dbService.findOne(model.company, { id: companyId })
    ]);

    if (!user) {
      return res.failure({ message: 'User not found' });
    }

    const transactionId = generateTransactionID(existingCompany?.companyName);
    const mode = 'EKYC';
    
    const eKycHubPromise = action === 'correction' 
      ? ekycHub.panCardCorrection(mobileNumber, mode)
      : ekycHub.panCardNew(mobileNumber, mode);
    
    const response = await eKycHubPromise;
    console.log("response", response);

    const panCardRequestData = {
      refId: userId,
      companyId: companyId,
      orderid: response.orderid,
      transactionId: transactionId,
      mobile_number: mobileNumber,
      redirect_url: response?.redirect_url || response?.url || null,
      status: response.status || 'Failed',
      action: action,
      request: JSON.stringify({
        mobile_number: mobileNumber,
        orderid: response.orderid
      }),
      response: JSON.stringify(response),
      addedBy: userId,
      updatedBy: userId
    };

    await dbService.createOne(model.panCardCrud, panCardRequestData);

    if (response.status === 'Success' || response.status.toLowerCase() === 'success') {
      return res.success({
        message: response.message || 'PAN redirection URL created successfully',
        data: response
      });
    } else {
      return res.failure({
        message: response.message || 'Failed to create PAN redirection URL',
        data: response
      });
    }
  } catch (error) {
    console.error('PAN redirection error:', error);
    return res.internalServerError({ message: error.message });
  }
};

module.exports = {
  panCardActions
};

