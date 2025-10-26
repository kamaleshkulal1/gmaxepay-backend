const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const ekycHub = require('../../../services/eKycHub');
const { doubleEncrypt, decrypt } = require('../../../utils/doubleCheckUp');
const key = Buffer.from(process.env.AES_KEY, 'hex');
const iv = Buffer.from(process.env.AES_IV, 'hex');

const ekycHubBalanceEnquiry = async (req, res) => {
    try{
        const user = await dbService.findOne(model.user, {
            id: req.user.id
        });
        if(!user || user.userRole !== 1){
            return res.failure({ message: 'User not found' });
        }
        const balance = await ekycHub.balanceEnquiry();
        return res.success({ message: 'Balance enquiry successful', data: balance });

    }catch(error){
        console.error(error);
        return res.failure({ message: error.message });
    }
}

const ekycHubPanVerification = async (req, res) => {
    try{
        const { pan } = req.body;
        if(!pan){
            return res.failure({ message: 'PAN is required' });
        }
        const user = await dbService.findOne(model.user, {
            id: req.user.id
        });
        if(!user || user.userRole !== 1){
            return res.failure({ message: 'User not found' });
        }
        
        // Encrypt the request data
        const encryptionKey = Buffer.from(process.env.AES_KEY, 'hex');
        const requestData = { pan };
        const encryptedRequest = doubleEncrypt(JSON.stringify(requestData), encryptionKey);
        
        // Check if PAN already exists in our database
        const existingPan = await dbService.findOne(model.ekycHub, {
            identityNumber1: pan,
        });

        let panVerification;

        if(existingPan){
            // Decrypt the cached response
            try {
                const encryptedData = JSON.parse(existingPan.response);
                if (encryptedData && encryptedData.encrypted) {
                    const decryptedResponse = decrypt(encryptedData, Buffer.from(process.env.AES_KEY, 'hex'));
                    if (decryptedResponse) {
                        panVerification = JSON.parse(decryptedResponse);
                    } else {
                        panVerification = encryptedData;
                    }
                } else {
                    panVerification = JSON.parse(existingPan.response);
                }
            } catch (e) {
                // If not encrypted or not JSON, return as is
                panVerification = existingPan.response;
            }
        } else {
            panVerification = await ekycHub.panVerification(pan);
            console.log("panVerification",panVerification);

            // Only save if verification is successful
            if(panVerification  && panVerification.status === 'Success'){
                // Encrypt the response before saving
                const encryptedResponse = doubleEncrypt(JSON.stringify(panVerification), encryptionKey);

                await dbService.createOne(model.ekycHub, {
                    identityNumber1: pan,
                    identityNumber2: null,
                    request: JSON.stringify(encryptedRequest),
                    response: JSON.stringify(encryptedResponse),
                    identityType: 'PAN',
                    companyId: user.companyId || null,
                    addedBy: user.id
                });
            }
        }

        return res.success({ 
            message: 'PAN verification successful', 
            data: panVerification
        });

    }catch(error){
        console.error(error);
        return res.failure({ message: error.message });
    }
}


const ekycHubBankVerification = async (req, res) => {
    try{
        const { account_number, ifsc } = req.body;
        if(!account_number){
            return res.failure({ message: 'Account number is required' });
        }
        if(!ifsc){
            return res.failure({ message: 'IFSC is required' });
        }
        const user = await dbService.findOne(model.user, {
            id: req.user.id
        });
        if(!user || user.userRole !== 1){
            return res.failure({ message: 'User not found' });
        }
        
        // Encrypt the request data
        const encryptionKey = Buffer.from(process.env.AES_KEY, 'hex');
        const requestData = { account_number, ifsc };
        const encryptedRequest = doubleEncrypt(JSON.stringify(requestData), encryptionKey);
        
        // Check if bank details already exist in our database
        const existingBank = await dbService.findOne(model.ekycHub, {
            identityNumber1: account_number,
            identityNumber2: ifsc,
            identityType: 'BANK'
        });

        let bankVerification;

        if(existingBank){
            // Decrypt the cached response
            try {
                const encryptedData = JSON.parse(existingBank.response);
                if (encryptedData && encryptedData.encrypted) {
                    const decryptedResponse = decrypt(encryptedData, Buffer.from(process.env.AES_KEY, 'hex'));
                    if (decryptedResponse) {
                        bankVerification = JSON.parse(decryptedResponse);
                    } else {
                        bankVerification = encryptedData;
                    }
                } else {
                    bankVerification = JSON.parse(existingBank.response);
                }
            } catch (e) {
                // If not encrypted or not JSON, return as is
                bankVerification = existingBank.response;
            }
        } else {
            bankVerification = await ekycHub.bankVerification(account_number, ifsc);

            // Only save if verification is successful
            if(bankVerification  && bankVerification.status === 'Success'){
                // Encrypt the response before saving
                const encryptedResponse = doubleEncrypt(JSON.stringify(bankVerification), encryptionKey);

                await dbService.createOne(model.ekycHub, {
                    identityNumber1: account_number,
                    identityNumber2: ifsc,
                    request: JSON.stringify(encryptedRequest),
                    response: JSON.stringify(encryptedResponse),
                    identityType: 'BANK',
                    companyId: user.companyId || null,
                    addedBy: user.id
                });
            }
        }

        return res.success({ 
            message: 'Bank verification successful', 
            data: bankVerification
        });

    }catch(error){
        console.error(error);
        return res.failure({ message: error.message });
    }
}


module.exports = {
    ekycHubBalanceEnquiry,
    ekycHubPanVerification,
    // ekycHubAadharVerification,
    ekycHubBankVerification
}