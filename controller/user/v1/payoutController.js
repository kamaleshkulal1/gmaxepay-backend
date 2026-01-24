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
        
        const user = req.user;
        
        // Validate required fields
        const payoutAmount = parseFloat(amount);
        if (!amount || isNaN(payoutAmount) || payoutAmount <= 0) {
            return res.failure({ message: 'Amount is required and must be a valid number greater than 0' });
        }
        
        if (!mode || !['wallet', 'bank'].includes(mode)) {
            return res.failure({ message: 'Valid mode is required (wallet or bank)' });
        }
        
        if (!latitude || !longitude) {
            return res.failure({ message: 'Latitude and longitude are required' });
        }
        
        // Parallel fetch: company and wallet
        const [company, wallet] = await Promise.all([
            dbService.findOne(model.company, { id: user.companyId }),
            dbService.findOne(model.wallet, { refId: user.id, companyId: user.companyId })
        ]);
        
        if (!company) return res.failure({ message: 'Company not found' });
        if (!wallet) return res.failure({ message: 'Wallet not found' });
        
        // Check AEPS wallet balance
        const currentAepsBalance = parseFloat(wallet.apesWallet || 0);
        if (currentAepsBalance < payoutAmount) {
            return res.failure({ message: 'Insufficient AEPS wallet balance' });
        }
        
        // Generate transaction ID and calculate balances
        const transactionID = generateTransactionID(company.companyName || company.name);
        const aepsOpeningBalance = parseFloat(currentAepsBalance.toFixed(2));
        const aepsClosingBalance = parseFloat((aepsOpeningBalance - payoutAmount).toFixed(2));
        const mainWalletOpeningBalance = parseFloat(parseFloat(wallet.mainWallet || 0).toFixed(2));
        const mainWalletClosingBalance = parseFloat((mainWalletOpeningBalance + payoutAmount).toFixed(2));
        
        // Initialize payout history data
        const payoutHistoryData = {
            refId: user.id,
            companyId: user.companyId,
            type: mode === 'wallet' ? 'internal' : 'external',
            transactionID: transactionID,
            amount: payoutAmount,
            walletType: 'apesWallet',
            openingBalance: aepsOpeningBalance,
            closingBalance: aepsClosingBalance,
            status: mode === 'wallet' ? 'SUCCESS' : 'PENDING',
            latitude: latitude,
            longitude: longitude,
            addedBy: user.id,
            updatedBy: user.id
        };
        
        let customerBank = null;
        let aslResponse = null;
        
        // Handle bank payout mode
        if (mode === 'bank') {
            // Validate payment mode
            if (!paymentMode || !['IMPS', 'NEFT'].includes(paymentMode)) {
                return res.failure({ message: 'Valid paymentMode is required (IMPS or NEFT) for bank payout' });
            }
            
            payoutHistoryData.paymentMode = paymentMode;
            
            // Get customer bank - support both customerBankId/bankId and accountNumber+ifscCode
            const effectiveCustomerBankId = customerBankId || bankId;
            const parsedBankId = effectiveCustomerBankId ? parseInt(effectiveCustomerBankId, 10) : null;
            
            if (parsedBankId && !isNaN(parsedBankId)) {
                // Find by ID
                customerBank = await dbService.findOne(model.customerBank, {
                    id: parsedBankId,
                    refId: user.id,
                    companyId: user.companyId,
                    isActive: true
                });
            } else if (accountNumber?.toString().trim() && ifscCode?.toString().trim()) {
                // Find by account number and IFSC
                customerBank = await dbService.findOne(model.customerBank, {
                    accountNumber: accountNumber.toString().trim(),
                    ifsc: ifscCode.toString().trim(),
                    refId: user.id,
                    companyId: user.companyId,
                    isActive: true
                });
            }
            
            if (!customerBank) {
                return res.failure({ 
                    message: 'Customer bank not found or inactive',
                    details: { customerBankId: parsedBankId, accountNumber, ifscCode }
                });
            }
            
            // Set bank details in payout history
            payoutHistoryData.customerBankId = parseInt(customerBank.id, 10);
            payoutHistoryData.accountNumber = customerBank.accountNumber;
            payoutHistoryData.ifscCode = customerBank.ifsc;
            payoutHistoryData.beneficiaryName = customerBank.beneficiaryName;
            payoutHistoryData.bankName = customerBank.bankName;
            payoutHistoryData.mobile = user.mobileNo || user.mobile || user.phone;
            
            // Call ASL API for bank payout
            aslResponse = await asl.aslAepsPayOut({
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
            });
            
            // Store API response and update status
            payoutHistoryData.apiResponse = aslResponse;
            payoutHistoryData.agentTransactionId = transactionID;
            
            if (aslResponse?.status) {
                const responseStatus = aslResponse.status.toUpperCase();
                if (responseStatus === 'SUCCESS' || responseStatus === 'SUCCESSFUL') {
                    payoutHistoryData.status = 'SUCCESS';
                } else if (responseStatus === 'FAILED' || responseStatus === 'FAILURE') {
                    payoutHistoryData.status = 'FAILED';
                }
                
                // Extract additional fields
                if (aslResponse.utrn) payoutHistoryData.utrn = aslResponse.utrn;
                if (aslResponse.orderId) payoutHistoryData.orderId = aslResponse.orderId;
                if (aslResponse.referenceId) payoutHistoryData.referenceId = aslResponse.referenceId;
                if (aslResponse.message) payoutHistoryData.statusMessage = aslResponse.message;
            }
        }
        
        // Create payout history record
        const payoutHistory = await dbService.createOne(model.payoutHistory, payoutHistoryData);
        
        // Update wallet balance only if payout is successful
        if (payoutHistoryData.status === 'SUCCESS') {
            if (mode === 'wallet') {
                // Internal transfer: Debit from apesWallet, Credit to mainWallet
                const walletUpdate = {
                    apesWallet: aepsClosingBalance,
                    mainWallet: mainWalletClosingBalance,
                    updatedBy: user.id
                };
                
                const walletHistories = [
                    {
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
                    },
                    {
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
                    }
                ];
                
                // Parallel execution: Update wallet and create history records
                await Promise.all([
                    dbService.update(model.wallet, { refId: user.id, companyId: user.companyId }, walletUpdate),
                    dbService.createOne(model.walletHistory, walletHistories[0]),
                    dbService.createOne(model.walletHistory, walletHistories[1])
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
                    paymentStatus: 'SUCCESS',
                    remark: `Bank payout via ${paymentMode}`,
                    addedBy: user.id,
                    updatedBy: user.id
                };
                
                // Add bank details if available
                if (customerBank) {
                    walletHistoryData.beneficiaryName = customerBank.beneficiaryName;
                    walletHistoryData.beneficiaryAccountNumber = customerBank.accountNumber;
                    walletHistoryData.beneficiaryBankName = customerBank.bankName;
                    walletHistoryData.beneficiaryIfsc = customerBank.ifsc;
                    walletHistoryData.paymentMode = paymentMode;
                    if (payoutHistoryData.utrn) walletHistoryData.UTR = payoutHistoryData.utrn;
                }
                
                // Parallel execution: Update wallet and create history
                await Promise.all([
                    dbService.update(
                        model.wallet,
                        { refId: user.id, companyId: user.companyId },
                        { apesWallet: aepsClosingBalance, updatedBy: user.id }
                    ),
                    dbService.createOne(model.walletHistory, walletHistoryData)
                ]);
            }
        }
        
        // Prepare response data (without payoutHistory object)
        const responseData = {
            transactionID: transactionID,
            status: payoutHistoryData.status,
            aepsWallet: {
                openingBalance: aepsOpeningBalance,
                closingBalance: aepsClosingBalance
            }
        };
        
        // Add main wallet info for internal transfers
        if (mode === 'wallet' && payoutHistoryData.status === 'SUCCESS') {
            responseData.mainWallet = {
                openingBalance: mainWalletOpeningBalance,
                closingBalance: mainWalletClosingBalance
            };
        }
        
        // Return failure response if payout status is FAILED
        if (payoutHistoryData.status === 'FAILED') {
            const failureMessage = payoutHistoryData.apiResponse?.remark || 
                                 payoutHistoryData.statusMessage || 
                                 'Payout request failed';
            return res.failure({
                message: failureMessage,
                data: responseData
            });
        }
        
        // Return success response for SUCCESS or PENDING status
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
