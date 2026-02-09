const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const ekycHub = require('../../../services/eKycHub');
const razorpayApi = require('../../../services/razorpayApi');
const { doubleEncrypt, decrypt } = require('../../../utils/doubleCheckUp');
const { generateTransactionID } = require('../../../utils/transactionID');
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
        
        if(![3,4,5].includes(req.user.userRole)){
            return res.failure({ message: 'You are not authorized to add bank details' });
        }
        let masterDistributor;
        let whitelabelUser;
        let superAdmin;
        let companySlabComm;
        let SuperAdminSlabComm;
        let masterDistributorWallet;
        let whitelabelUserWallet;
        let superAdminWallet;

        if(req.user.userRole === 3){
            [
                masterDistributor,
                whitelabelUser,
                superAdmin
            ] = await Promise.all([
                dbService.findOne(model.user, {
                    id: req.user.id,
                    companyId: req.user.companyId,
                    isActive: true
                }),
                dbService.findOne(model.user, {
                    companyId: req.user.companyId,
                    userRole: 2,
                    isActive: true
                }),
                dbService.findOne(model.user, {
                    id: 1,
                    companyId: 1,
                    userRole: 1,
                    isActive: true
                })
            ])
            if(!masterDistributor || !whitelabelUser || !superAdmin){
                return res.failure({ message: 'Master distributor, whitelabel user or super admin not found' });
            }
            [
                companySlabComm,
                SuperAdminSlabComm
            ] = await Promise.all([
                dbService.findAll(
                    model.commSlab,
                    {
                        companyId: req.user.companyId,
                        addedBy: whitelabelUser.id,
                        operatorType: 'BANK VERIFICATION'
                    },
                    { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }
                ),
                dbService.findAll(
                    model.commSlab,
                    {
                        companyId: 1,
                        addedBy: superAdmin.id,
                        operatorType: 'BANK VERIFICATION'
                    },
                    { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }
                )
            ]);
            [
                masterDistributorWallet,
                whitelabelUserWallet,
                superAdminWallet
            ] = await Promise.all([
                dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: req.user.companyId }),
                dbService.findOne(model.wallet, { refId: whitelabelUser.id, companyId: req.user.companyId }),
                dbService.findOne(model.wallet, { refId: 1, companyId: 1 })
            ]);
            if(!masterDistributorWallet || !whitelabelUserWallet || !superAdminWallet){
                return res.failure({ message: 'Master distributor, whitelabel user or super admin wallet not found' });
            }
        }else if(req.user.userRole === 4){
            
        } else if(req.user.userRole === 5){

        }

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

        // Pre-calculate duplicate and count, but do NOT return yet.
        // We always want to perform bank verification and MD debit (if applicable),
        // even when the bank is already stored or max-bank limit is reached.
        const duplicateBank = existingBanks.find(
            bank => bank.accountNumber === account_number && bank.ifsc === ifsc
        );

        const MAX_BANKS = 5;

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

        // Wallet commission & surcharge logic for Master Distributor (userRole === 3)
        if (req.user.userRole === 3) {

            const mdSlab = companySlabComm?.find(
                (c) => c.roleType === 3 || c.roleName === 'MD'
            );
            const adminSlab = SuperAdminSlabComm?.find(
                (c) => c.roleType === 1 || c.roleName === 'AD'
            );
            const companySlab = companySlabComm?.find(
                (c) => c.roleType === 2 || c.roleName === 'WU'
            );
            console.log('mdSlab', mdSlab);
            console.log('adminSlab', adminSlab);
            console.log('companySlab', companySlab);
            const mdSurchargeAmt = parseFloat(mdSlab?.commAmt || 0);
            const adminSurchargeAmt = parseFloat(adminSlab?.commAmt || 0);
            const companySurchargeAmt = parseFloat(companySlab?.commAmt || 0);

            console.log('Admin surcharge (AD):', adminSurchargeAmt);
            console.log('Company surcharge (WU):', companySurchargeAmt);
            console.log('Master distributor surcharge (MD):', mdSurchargeAmt);

            if (mdSurchargeAmt <= 0 || adminSurchargeAmt < 0 || companySurchargeAmt < 0) {
                return res.failure({ message: 'Invalid surcharge configuration for bank verification' });
            }

            const mdOpeningBalance = parseFloat(masterDistributorWallet.mainWallet || 0);
            const companyOpeningBalance = parseFloat(whitelabelUserWallet.mainWallet || 0);
            const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

            const totalDebitFromMD = mdSurchargeAmt;

            if (mdOpeningBalance < totalDebitFromMD) {
                return res.failure({
                    message: `Insufficient wallet balance. Required: ${totalDebitFromMD}, Available: ${mdOpeningBalance}`
                });
            }

            const mdClosingBalance = parseFloat((mdOpeningBalance - totalDebitFromMD).toFixed(2));
            const companyClosingBalance = parseFloat((companyOpeningBalance + companySurchargeAmt).toFixed(2));
            const adminClosingBalance = parseFloat((adminOpeningBalance + adminSurchargeAmt).toFixed(2));

            const companyDetails = await dbService.findOne(model.company, { id: req.user.companyId });
            const transactionId = generateTransactionID(companyDetails?.companyName || 'BANK_VERIFY');

            const operatorName = 'Bank Verification';
            const remarkText = 'Bank verification charge';

            // Update wallets
            await dbService.update(
                model.wallet,
                { id: masterDistributorWallet.id },
                { mainWallet: mdClosingBalance, updatedBy: masterDistributor.id }
            );

            await dbService.update(
                model.wallet,
                { id: whitelabelUserWallet.id },
                { mainWallet: companyClosingBalance, updatedBy: whitelabelUser.id }
            );

            await dbService.update(
                model.wallet,
                { id: superAdminWallet.id },
                { mainWallet: adminClosingBalance, updatedBy: superAdmin.id }
            );

            // Wallet history for MD (debit)
            await dbService.createOne(model.walletHistory, {
                refId: masterDistributor.id,
                companyId: req.user.companyId,
                walletType: 'mainWallet',
                operator: operatorName,
                remark: remarkText,
                amount: totalDebitFromMD,
                comm: 0,
                surcharge: totalDebitFromMD,
                openingAmt: mdOpeningBalance,
                closingAmt: mdClosingBalance,
                credit: 0,
                debit: totalDebitFromMD,
                transactionId,
                paymentStatus: 'SUCCESS',
                beneficiaryName:
                    bankVerification.nameAtBank ||
                    bankVerification.beneficiary_name ||
                    bankVerification.beneficiaryName ||
                    bankVerification['nameAtBank'] ||
                    null,
                beneficiaryAccountNumber: account_number,
                beneficiaryBankName:
                    (razorpayBankData?.BANK) ||
                    bankVerification.bank_name ||
                    bankVerification.bankName ||
                    null,
                beneficiaryIfsc: ifsc,
                paymentMode: 'WALLET',
                addedBy: masterDistributor.id,
                updatedBy: masterDistributor.id
            });

            // Wallet history for Company Admin / Whitelabel (credit)
            await dbService.createOne(model.walletHistory, {
                refId: whitelabelUser.id,
                companyId: req.user.companyId,
                walletType: 'mainWallet',
                operator: operatorName,
                remark: `${remarkText} - company commission`,
                amount: companySurchargeAmt,
                comm: companySurchargeAmt,
                surcharge: 0,
                openingAmt: companyOpeningBalance,
                closingAmt: companyClosingBalance,
                credit: companySurchargeAmt,
                debit: 0,
                transactionId,
                paymentStatus: 'SUCCESS',
                beneficiaryName: whitelabelUser.name || null,
                beneficiaryAccountNumber: null,
                beneficiaryBankName: null,
                beneficiaryIfsc: null,
                paymentMode: 'WALLET',
                addedBy: whitelabelUser.id,
                updatedBy: whitelabelUser.id
            });

            // Wallet history for Super Admin (credit)
            await dbService.createOne(model.walletHistory, {
                refId: superAdmin.id,
                companyId: 1,
                walletType: 'mainWallet',
                operator: operatorName,
                remark: `${remarkText} - admin commission`,
                amount: adminSurchargeAmt,
                comm: adminSurchargeAmt,
                surcharge: 0,
                openingAmt: adminOpeningBalance,
                closingAmt: adminClosingBalance,
                credit: adminSurchargeAmt,
                debit: 0,
                transactionId,
                paymentStatus: 'SUCCESS',
                beneficiaryName: superAdmin.name || null,
                beneficiaryAccountNumber: null,
                beneficiaryBankName: null,
                beneficiaryIfsc: null,
                paymentMode: 'WALLET',
                addedBy: superAdmin.id,
                updatedBy: superAdmin.id
            });
        }

        // After successful verification and (if applicable) MD debit, now decide
        // whether we can add/update the customer's bank record.
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

        // Check maximum banks limit (applied after verification & debit)
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

const deleteCustomerBank = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const customerBank = await dbService.deleteOne(model.customerBank, {
            id: id,
            refId: user.id,
            companyId: user.companyId
        });
        if (!customerBank) {
            return res.notFound({ message: 'Customer bank not found' });
        }
        if (customerBank.isPrimary) {
            return res.failure({ message: 'Primary bank account cannot be deleted' });
        }
        const updatedBank = {
            isActive: false
        }
        await dbService.update(model.customerBank, {
            id: id,
            refId: user.id,
            companyId: user.companyId
        }, updatedBank
       );
        if (!updatedBank) {
            return res.failure({ message: 'Failed to delete bank details' });
        }
        return res.success({ message: 'Bank details deleted successfully', data: updatedBank });
    }
    catch (error) {
        console.log('Delete customer bank error:', error);
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

module.exports = {
    getAllCustomerBanks,
    getPrimaryCustomerBank,
    getCustomerBankById,
    addCustomerBank,
    deleteCustomerBank
};

