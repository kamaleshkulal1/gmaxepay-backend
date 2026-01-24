const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const { generateTransactionID } = require('../../../utils/transactionID');
const asl = require('../../../services/asl');

const payout = async (req, res) => {
    try {
        const { 
            amount, 
            mode, 
            customerBankId, 
            bankId, 
            accountNumber, 
            ifscCode,
            paymentMode,
            latitude,
            longitude
        } = req.body;
        
        // Support bankId as alias for customerBankId
        // Convert to integer if provided as string
        let effectiveCustomerBankId = customerBankId || bankId;
        if (effectiveCustomerBankId !== null && effectiveCustomerBankId !== undefined) {
            const parsedId = parseInt(effectiveCustomerBankId, 10);
            if (isNaN(parsedId)) {
                return res.failure({ message: 'Invalid customerBankId or bankId: must be a valid number' });
            }
            effectiveCustomerBankId = parsedId;
        }
        
        const user = req.user;
        
        // Convert amount to number
        const payoutAmount = parseFloat(amount);
        
        // Validate required fields
        if (!amount || isNaN(payoutAmount) || payoutAmount <= 0) {
            return res.failure({ message: 'Amount is required and must be a valid number greater than 0' });
        }
        
        if (!mode || !['wallet', 'bank'].includes(mode)) {
            return res.failure({ message: 'Valid mode is required (wallet or bank)' });
        }
        
        // Validate location (required for both modes)
        if (!latitude || !longitude) {
            return res.failure({ message: 'Latitude and longitude are required' });
        }
        
        
        const [company, wallet] = await Promise.all([
            dbService.findOne(model.company, { id: user.companyId }),
            dbService.findOne(model.wallet, { refId: user.id, companyId: user.companyId })
        ]);
        
        if (!company) {
            return res.failure({ message: 'Company not found' });
        }
        
        if (!wallet) {
            return res.failure({ message: 'Wallet not found' });
        }
        
        // Check AEPS wallet balance (source wallet)
        const sourceWalletType = 'apesWallet';
        const currentAepsBalance = parseFloat(wallet.apesWallet || 0);
        if (currentAepsBalance < payoutAmount) {
            return res.failure({ message: 'Insufficient AEPS wallet balance' });
        }
        
        // Generate transaction ID
        const transactionID = generateTransactionID(company.companyName || company.name);
        
        // Calculate opening and closing balance for AEPS wallet (source)
        const aepsOpeningBalance = parseFloat(currentAepsBalance.toFixed(2));
        const aepsClosingBalance = parseFloat((aepsOpeningBalance - payoutAmount).toFixed(2));
        
        // Create payout history record
        const payoutHistoryData = {
            refId: user.id,
            companyId: user.companyId,
            type: mode === 'wallet' ? 'internal' : 'external',
            transactionID: transactionID,
            amount: payoutAmount,
            walletType: sourceWalletType, // Always from apesWallet
            openingBalance: aepsOpeningBalance,
            closingBalance: aepsClosingBalance,
            status: 'PENDING',
            latitude: latitude,
            longitude: longitude,
            addedBy: user.id,
            updatedBy: user.id
        };
        
        let customerBank = null;
        
        if (mode === 'bank') {
            // Validate bank-specific fields
            if (!paymentMode || !['IMPS', 'NEFT'].includes(paymentMode)) {
                return res.failure({ message: 'Valid paymentMode is required (IMPS or NEFT) for bank payout' });
            }
            
            payoutHistoryData.paymentMode = paymentMode;
            
            // Debug: Log received bank parameters
            // Get bank details
            // Priority: customerBankId (or bankId) takes precedence if provided, otherwise use accountNumber + ifscCode
            // Handle empty strings and null values properly
            const hasCustomerBankId = effectiveCustomerBankId && !isNaN(effectiveCustomerBankId);
            const hasAccountNumber = accountNumber && accountNumber.toString().trim() !== '';
            const hasIfscCode = ifscCode && ifscCode.toString().trim() !== '';
            
            if (hasCustomerBankId) {
                customerBank = await dbService.findOne(model.customerBank, {
                    id: effectiveCustomerBankId,
                    refId: user.id,
                    companyId: user.companyId,
                    isActive: true
                });
                
                if (!customerBank) {
                    return res.failure({ 
                        message: 'Customer bank not found or inactive',
                        details: {
                            searchedId: effectiveCustomerBankId,
                            userId: user.id,
                            companyId: user.companyId
                        }
                    });
                }
                
                // Ensure customerBank.id is a valid integer
                if (!customerBank.id || isNaN(parseInt(customerBank.id, 10))) {
                    console.error('Invalid customerBank.id:', customerBank.id);
                    return res.failure({ message: 'Invalid customer bank record: missing or invalid ID' });
                }
                
                // Double-check that the customerBank record actually exists in the database
                // This prevents foreign key constraint errors
                const verifyCustomerBank = await dbService.findOne(model.customerBank, {
                    id: customerBank.id
                });
                
                if (!verifyCustomerBank) {
                    console.error('CustomerBank record not found in database:', customerBank.id);
                    return res.failure({ 
                        message: 'Customer bank record not found in database',
                        details: {
                            customerBankId: customerBank.id,
                            userId: user.id,
                            companyId: user.companyId
                        }
                    });
                }
            } else if (hasAccountNumber && hasIfscCode) {
                customerBank = await dbService.findOne(model.customerBank, {
                    accountNumber: accountNumber.toString().trim(),
                    ifsc: ifscCode.toString().trim(),
                    refId: user.id,
                    companyId: user.companyId,
                    isActive: true
                });
                
                if (!customerBank) {
                    return res.failure({ message: 'Customer bank not found with provided account number and IFSC' });
                }
                
                // Ensure customerBank.id is a valid integer
                if (!customerBank.id || isNaN(parseInt(customerBank.id, 10))) {
                    console.error('Invalid customerBank.id:', customerBank.id);
                    return res.failure({ message: 'Invalid customer bank record: missing or invalid ID' });
                }
                
                // Double-check that the customerBank record actually exists in the database
                const verifyCustomerBank = await dbService.findOne(model.customerBank, {
                    id: customerBank.id
                });
                
                if (!verifyCustomerBank) {
                    console.error('CustomerBank record not found in database:', customerBank.id);
                    return res.failure({ 
                        message: 'Customer bank record not found in database',
                        details: {
                            customerBankId: customerBank.id,
                            userId: user.id,
                            companyId: user.companyId
                        }
                    });
                }
            } else {
                return res.failure({ 
                    message: 'Either customerBankId (or bankId) or (accountNumber and ifscCode) is required for bank payout',
                    received: {
                        customerBankId: effectiveCustomerBankId || null,
                        bankId: bankId || null,
                        accountNumber: accountNumber || null,
                        ifscCode: ifscCode || null
                    }
                });
            }
            
            // Convert customerBank.id to integer to ensure proper foreign key reference
            payoutHistoryData.customerBankId = parseInt(customerBank.id, 10);
            
            // Validate the ID before proceeding
            if (isNaN(payoutHistoryData.customerBankId)) {
                console.error('Invalid customerBank.id after conversion:', customerBank.id);
                return res.failure({ message: 'Invalid customer bank ID for payout history' });
            }
            
            console.log('Setting customerBankId for payoutHistory:', {
                originalId: customerBank.id,
                convertedId: payoutHistoryData.customerBankId,
                customerBankExists: !!customerBank
            });
            payoutHistoryData.accountNumber = customerBank.accountNumber;
            payoutHistoryData.ifscCode = customerBank.ifsc;
            payoutHistoryData.beneficiaryName = customerBank.beneficiaryName;
            payoutHistoryData.bankName = customerBank.bankName;
            payoutHistoryData.mobile = user.mobile || user.phone;
            
            // Call ASL API for bank payout
            const aslPayload = {
                mobile: user.mobileNo,
                accountNumber: customerBank.accountNumber,
                beneficiaryName: customerBank.beneficiaryName,
                bankName: customerBank.bankName,
                ifscCode: customerBank.ifsc,
                amount: payoutAmount.toString(),
                paymentMode: paymentMode,
                latitude: latitude,
                longitude: longitude,
                agentTransactionId: transactionID
            };
            console.log("aslPayload",aslPayload);
            
            const aslResponse = await asl.aslAepsPayOut(aslPayload);
            
            // Store API response
            payoutHistoryData.apiResponse = aslResponse;
            payoutHistoryData.agentTransactionId = transactionID;
            
            // Update status based on ASL response
            if (aslResponse && aslResponse.status) {
                const responseStatus = aslResponse.status.toUpperCase();
                if (responseStatus === 'SUCCESS' || responseStatus === 'SUCCESSFUL') {
                    payoutHistoryData.status = 'SUCCESS';
                } else if (responseStatus === 'FAILED' || responseStatus === 'FAILURE') {
                    payoutHistoryData.status = 'FAILED';
                } else {
                    payoutHistoryData.status = 'PENDING';
                }
            }
            
            // Extract additional fields from ASL response
            if (aslResponse) {
                if (aslResponse.utrn) payoutHistoryData.utrn = aslResponse.utrn;
                if (aslResponse.orderId) payoutHistoryData.orderId = aslResponse.orderId;
                if (aslResponse.referenceId) payoutHistoryData.referenceId = aslResponse.referenceId;
                if (aslResponse.message) payoutHistoryData.statusMessage = aslResponse.message;
            }
        } else {
            // Internal wallet transfer (AEPS to Main Wallet) - no external API call needed
            // No bank-related fields needed for wallet mode
            payoutHistoryData.status = 'SUCCESS';
        }
        
        // Prepare wallet update and history data before creating payout history
        const mainWalletOpeningBalance = parseFloat(parseFloat(wallet.mainWallet || 0).toFixed(2));
        const mainWalletClosingBalance = parseFloat((mainWalletOpeningBalance + payoutAmount).toFixed(2));
        
        // Create payout history record first (non-blocking for response)
        const payoutHistory = await dbService.createOne(model.payoutHistory, payoutHistoryData);
        
        // Update wallet balance only if payout is successful or internal
        if (payoutHistoryData.status === 'SUCCESS' || mode === 'wallet') {
            if (mode === 'wallet') {
                // Internal transfer: Debit from apesWallet, Credit to mainWallet
                // Prepare wallet history data
                const aepsWalletHistoryData = {
                    refId: user.id,
                    companyId: user.companyId,
                    walletType: 'apesWallet',
                    amount: payoutAmount,
                    debit: payoutAmount,
                    credit: 0,
                    openingAmt: aepsOpeningBalance,
                    closingAmt: aepsClosingBalance,
                    transactionId: transactionID,
                    paymentStatus: 'SUCCESS',
                    remark: 'Internal transfer: AEPS to Main Wallet',
                    addedBy: user.id,
                    updatedBy: user.id
                };
                
                const mainWalletHistoryData = {
                    refId: user.id,
                    companyId: user.companyId,
                    walletType: 'mainWallet',
                    amount: payoutAmount,
                    debit: 0,
                    credit: payoutAmount,
                    openingAmt: mainWalletOpeningBalance,
                    closingAmt: mainWalletClosingBalance,
                    transactionId: transactionID,
                    paymentStatus: 'SUCCESS',
                    remark: 'Internal transfer: From AEPS Wallet',
                    addedBy: user.id,
                    updatedBy: user.id
                };
                
                // Parallelize wallet update and history creation
                await Promise.all([
                    dbService.update(
                        model.wallet,
                        { refId: user.id, companyId: user.companyId },
                        {
                            apesWallet: aepsClosingBalance,
                            mainWallet: mainWalletClosingBalance,
                            updatedBy: user.id
                        }
                    ),
                    dbService.createOne(model.walletHistory, aepsWalletHistoryData),
                    dbService.createOne(model.walletHistory, mainWalletHistoryData)
                ]);
                
            } else {
                // External bank transfer: Only debit from apesWallet
                const walletHistoryData = {
                    refId: user.id,
                    companyId: user.companyId,
                    walletType: 'apesWallet',
                    amount: payoutAmount,
                    debit: payoutAmount,
                    credit: 0,
                    openingAmt: aepsOpeningBalance,
                    closingAmt: aepsClosingBalance,
                    transactionId: transactionID,
                    paymentStatus: payoutHistoryData.status,
                    remark: `Bank payout via ${paymentMode}`,
                    addedBy: user.id,
                    updatedBy: user.id
                };
                
                if (customerBank) {
                    walletHistoryData.beneficiaryName = customerBank.beneficiaryName;
                    walletHistoryData.beneficiaryAccountNumber = customerBank.accountNumber;
                    walletHistoryData.beneficiaryBankName = customerBank.bankName;
                    walletHistoryData.beneficiaryIfsc = customerBank.ifsc;
                    walletHistoryData.paymentMode = paymentMode;
                    if (payoutHistoryData.utrn) walletHistoryData.UTR = payoutHistoryData.utrn;
                }
                
                // Parallelize wallet update and history creation
                await Promise.all([
                    dbService.update(
                        model.wallet,
                        { refId: user.id, companyId: user.companyId },
                        {
                            apesWallet: aepsClosingBalance,
                            updatedBy: user.id
                        }
                    ),
                    dbService.createOne(model.walletHistory, walletHistoryData)
                ]);
            }
        }
        
        // Prepare response data
        const responseData = {
            payoutHistory: payoutHistory,
            transactionID: transactionID,
            status: payoutHistoryData.status,
            aepsWallet: {
                openingBalance: aepsOpeningBalance,
                closingBalance: aepsClosingBalance
            }
        };
        
        // Add main wallet info for internal transfers (already calculated above)
        if (mode === 'wallet' && payoutHistoryData.status === 'SUCCESS') {
            responseData.mainWallet = {
                openingBalance: mainWalletOpeningBalance,
                closingBalance: mainWalletClosingBalance
            };
        }
        
        return res.success({
            message: mode === 'wallet' ? 'Payout from AEPS wallet to Main wallet successful' : 'Payout request processed',
            data: responseData
        });
        
    } catch (error) {
        console.log('Payout error:', error);
        return res.failure({ message: error.message || 'Internal server error' });
    }
}


const getPayoutBankList = async (req, res) => {
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
        
        const banksWithPrimaryFlag = customerBanks.map(bank => ({
            ...bank.toJSON ? bank.toJSON() : bank,
            isPrimary: bank.isPrimary === true || bank.isPrimary === 1
        }));
        
        // Count primary banks (should be 0 or 1)
        const primaryBankCount = banksWithPrimaryFlag.filter(bank => bank.isPrimary === true).length;
        
        return res.success({
            message: 'Payout bank list retrieved successfully',
            data: {
                banks: banksWithPrimaryFlag,
                total: banksWithPrimaryFlag.length,
                primaryBankCount: primaryBankCount
            }
        });
        
    } catch (error) {
        console.log('Get payout bank list error:', error);
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

module.exports = { payout, getPayoutBankList };
