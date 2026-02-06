const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const ekycHub = require('../../../services/eKycHub');
const razorpayApi = require('../../../services/razorpayApi');
const { doubleEncrypt, decrypt } = require('../../../utils/doubleCheckUp');
const key = Buffer.from(process.env.AES_KEY, 'hex');

const getAllCustomerBanks = async (req, res) => {
    try {
        const user = req.user;
        
        // Get all customer banks for the user
        const customerBanks = await dbService.findAll(
            model.customerBank,
            {
                refId: user.id,
                companyId: user.companyId,
                isActive: true
            },
            {
                order: [['isPrimary', 'DESC'], ['createdAt', 'DESC']]
            }
        );
        
        return res.success({
            message: 'Customer banks retrieved successfully',
            data: {
                banks: customerBanks,
                total: customerBanks.length,
                primaryBank: customerBanks.find(bank => bank.isPrimary === true) || null
            }
        });
        
    } catch (error) {
        console.log('Get customer banks error:', error);
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

const getPrimaryCustomerBank = async (req, res) => {
    try {
        const user = req.user;
        
        // Get primary customer bank
        const primaryBank = await dbService.findOne(
            model.customerBank,
            {
                refId: user.id,
                companyId: user.companyId,
                isActive: true,
                isPrimary: true
            }
        );
        
        if (!primaryBank) {
            return res.notFound({ message: 'Primary bank account not found' });
        }
        
        return res.success({
            message: 'Primary bank account retrieved successfully',
            data: primaryBank
        });
        
    } catch (error) {
        console.log('Get primary bank error:', error);
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

const getCustomerBankById = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        
        if (!id) {
            return res.validationError({ message: 'Bank ID is required' });
        }
        
        const customerBank = await dbService.findOne(
            model.customerBank,
            {
                id: id,
                refId: user.id,
                companyId: user.companyId,
                isActive: true
            }
        );
        
        if (!customerBank) {
            return res.notFound({ message: 'Customer bank not found' });
        }
        
        return res.success({
            message: 'Customer bank retrieved successfully',
            data: customerBank
        });
        
    } catch (error) {
        console.log('Get customer bank by ID error:', error);
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

const addCustomerBank = async (req, res) => {
    try {
        const { account_number, ifsc } = req.body;

        // Validate required fields
        if (!account_number || !ifsc) {
            return res.validationError({ 
                message: !account_number ? 'Account number is required' : 'IFSC is required' 
            });
        }

        const existingBanks = await dbService.findAll(
            model.customerBank,
            {
                refId: req.user.id,
                companyId: req.user.companyId,
                isActive: true
            }
        );

        // Check for duplicate bank
        const duplicateBank = existingBanks.find(
            bank => bank.accountNumber === account_number && bank.ifsc === ifsc
        );

        if (duplicateBank) {
            return res.failure({
                message: 'This bank account with the same account number and IFSC already exists in your account',
                data: {
                    existingBank: {
                        id: duplicateBank.id,
                        bankName: duplicateBank.bankName,
                        accountNumber: duplicateBank.accountNumber,
                        ifsc: duplicateBank.ifsc,
                        isPrimary: duplicateBank.isPrimary
                    }
                }
            });
        }

        // Check maximum banks limit
        const MAX_BANKS = 5;
        if (existingBanks && existingBanks.length >= MAX_BANKS) {
            return res.failure({
                message: `You have reached the maximum limit of ${MAX_BANKS} bank accounts. Please remove one of your existing banks before adding a new one.`,
                data: {
                    existingBanksCount: existingBanks.length,
                    maxBanks: MAX_BANKS,
                    existingBanks: existingBanks.map(bank => ({
                        id: bank.id,
                        bankName: bank.bankName,
                        accountNumber: bank.accountNumber,
                        ifsc: bank.ifsc,
                        isPrimary: bank.isPrimary
                    }))
                }
            });
        }

        // Check ekycHub cache first, then call APIs in parallel
        const [cachedVerification, razorpayBankData] = await Promise.all([
            // Check cache for bank verification
            (async () => {
                const existingBank = await dbService.findOne(model.ekycHub, {
                    identityNumber1: account_number,
                    identityNumber2: ifsc,
                    identityType: 'BANK'
                });

                if (existingBank) {
                    try {
                        const encryptedData = JSON.parse(existingBank.response);
                        if (encryptedData && encryptedData.encrypted) {
                            const decryptedResponse = decrypt(encryptedData, key);
                            return decryptedResponse ? JSON.parse(decryptedResponse) : encryptedData;
                        }
                        return JSON.parse(existingBank.response);
                    } catch (e) {
                        return existingBank.response;
                    }
                }
                return null;
            })(),
            // Fetch Razorpay bank details (non-blocking, can fail)
            razorpayApi.bankDetails(ifsc).catch(() => null)
        ]);

        // Get bank verification (from cache or API)
        let bankVerification = cachedVerification;
        if (!bankVerification) {
            bankVerification = await ekycHub.bankVerification(account_number, ifsc);
            
            // Cache successful verification
            if (bankVerification && bankVerification.status === 'Success') {
                const encryptedRequest = doubleEncrypt(JSON.stringify({ account_number, ifsc }), key);
                const encryptedResponse = doubleEncrypt(JSON.stringify(bankVerification), key);
                
                dbService.createOne(model.ekycHub, {
                    identityNumber1: account_number,
                    identityNumber2: ifsc,
                    request: JSON.stringify(encryptedRequest),
                    response: JSON.stringify(encryptedResponse),
                    identityType: 'BANK',
                    companyId: req.user.companyId || null,
                    addedBy: req.user.id
                }).catch(err => console.error('Error caching bank verification:', err));
            }
        }

        if (!bankVerification || bankVerification.status !== 'Success') {
            return res.failure({ message: 'Bank verification failed' });
        }

        // Extract bank details
        const bankName = (razorpayBankData?.BANK) || bankVerification.bank_name || bankVerification.bankName || null;
        const beneficiaryName = bankVerification.nameAtBank || bankVerification.beneficiary_name || bankVerification.beneficiaryName || bankVerification['nameAtBank'] || null;
        const city = (razorpayBankData?.CITY) || bankVerification.city || null;
        const branch = (razorpayBankData?.BRANCH) || bankVerification.branch || null;

        // Create bank account
        const customerBank = await dbService.createOne(model.customerBank, {
            bankName,
            beneficiaryName,
            accountNumber: account_number,
            ifsc,
            city,
            branch,
            companyId: req.user.companyId,
            refId: req.user.id,
            isActive: true,
            isPrimary: false
        });

        return res.success({ message: 'Bank details added successfully', data: customerBank });
    } catch (error) {
        console.log('Add bank details error:', error);
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

module.exports = {
    getAllCustomerBanks,
    getPrimaryCustomerBank,
    getCustomerBankById,
    addCustomerBank
};

