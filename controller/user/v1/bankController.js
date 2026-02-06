const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const ekycHub = require('../../../services/eKycHub');
const razorpayApi = require('../../../services/razorpayApi');

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
        if (!account_number) {
            return res.validationError({ message: 'Account number is required' });
        }
        if (!ifsc) {
            return res.validationError({ message: 'IFSC is required' });
        }

        const duplicateBank = await dbService.findOne(
            model.customerBank,
            {
                refId: req.user.id,
                companyId: req.user.companyId,
                accountNumber: account_number,
                ifsc: ifsc,
                isActive: true
            }
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

        // Check existing banks count
        const existingBanks = await dbService.findAll(
            model.customerBank,
            {
                refId: req.user.id,
                companyId: req.user.companyId,
                isActive: true
            }
        );

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

        let bankVerification;
        bankVerification = await ekycHub.bankVerification(account_number, ifsc);

        if (!bankVerification || bankVerification.status !== 'Success') {
            return res.failure({ message: 'Bank verification failed' });
        }
        let razorpayBankData = null;
        try {
            razorpayBankData = await razorpayApi.bankDetails(ifsc);
        } catch (error) {
            console.error('Error fetching bank details from Razorpay:', error);
        }

        const bankName = (razorpayBankData && razorpayBankData.BANK)
            ? razorpayBankData.BANK
            : (bankVerification.bank_name || bankVerification.bankName || null);

        const customerBank = await dbService.createOne(model.customerBank, {
            bankName,
            beneficiaryName: bankVerification.nameAtBank || bankVerification.beneficiary_name || bankVerification.beneficiaryName || bankVerification['nameAtBank'] || null,
            accountNumber: account_number,
            ifsc,
            city: (razorpayBankData && razorpayBankData.CITY)
                ? razorpayBankData.CITY
                : (bankVerification.city || null),
            branch: (razorpayBankData && razorpayBankData.BRANCH)
                ? razorpayBankData.BRANCH
                : (bankVerification.branch || null),
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

