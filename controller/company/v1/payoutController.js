const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const { generateTransactionID } = require('../../../utils/transactionID');
const asl = require('../../../services/asl');
const { Op } = require('sequelize');

const round2 = (num) => {
    const n = Number(num);
    return Number.isFinite(n)
        ? Math.round((n + Number.EPSILON) * 100) / 100
        : 0;
};


const payout = async (req, res) => {
    try {
        if (![2].includes(req.user.userRole)) {
            return res.failure({ message: 'You are not authorized to do payout' });
        }
        const {
            amount,
            mode,
            aepsType,
            customerBankId,
            bankId,
            accountNumber,
            ifscCode,
            paymentMode,
            latitude,
            longitude
        } = req.body;

        const user = req.user;

        const payoutAmount = parseFloat(amount);
        if (!amount || isNaN(payoutAmount) || payoutAmount <= 0) {
            return res.failure({ message: 'Amount is required and must be a valid number greater than 0' });
        }

        if (!mode || !['wallet', 'bank'].includes(mode)) {
            return res.failure({ message: 'Valid mode is required (wallet or bank)' });
        }

        if (!aepsType || !['AEPS1', 'AEPS2'].includes(aepsType.toUpperCase())) {
            return res.failure({ message: 'Invalid AEPS type' });
        }

        if (!latitude || !longitude) {
            return res.failure({ message: 'Latitude and longitude are required' });
        }

        const normalizedAepsType = aepsType.toUpperCase();
        const walletType = normalizedAepsType === 'AEPS1' ? 'apes1Wallet' : 'apes2Wallet';

        const [company, wallet] = await Promise.all([
            dbService.findOne(model.company, { id: user.companyId }),
            dbService.findOne(model.wallet, { refId: user.id, companyId: user.companyId })
        ]);

        if (!company) return res.failure({ message: 'Company not found' });
        if (!wallet) return res.failure({ message: 'Wallet not found' });

        const currentAepsBalance = parseFloat(wallet[walletType] || 0);
        if (currentAepsBalance < payoutAmount) {
            return res.failure({
                message: `Insufficient ${normalizedAepsType} wallet balance`,
                currentBalance: currentAepsBalance,
                requiredAmount: payoutAmount
            });
        }

        const transactionID = generateTransactionID(company.companyName || company.name);
        const aepsOpeningBalance = parseFloat(currentAepsBalance.toFixed(2));
        // aepsClosingBalance will be updated later with surcharge/commission adjustments
        let aepsClosingBalance = parseFloat((aepsOpeningBalance - payoutAmount).toFixed(2));
        const mainWalletOpeningBalance = parseFloat(parseFloat(wallet.mainWallet || 0).toFixed(2));
        const mainWalletClosingBalance = parseFloat((mainWalletOpeningBalance + payoutAmount).toFixed(2));

        const payoutHistoryData = {
            refId: user.id,
            companyId: user.companyId,
            type: mode === 'wallet' ? 'internal' : 'external',
            transactionID: transactionID,
            amount: payoutAmount,
            walletType: walletType,
            aepsType: normalizedAepsType,
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

        // Commercial variables declared here to be accessible in SUCCESS block
        let payoutOperator = null;
        let superAdmin = null;
        let companyAdmin = null;
        let slabComm = null;
        let adminSlabComm = null;
        let calculatedAmount = 0;
        let adminCommAmount = 0;
        let companyAdminWallet = null;
        let superAdminWallet = null;

        if (mode === 'bank') {
            if (!paymentMode || !['IMPS', 'NEFT'].includes(paymentMode)) {
                return res.failure({ message: 'Valid paymentMode is required (IMPS or NEFT) for bank payout' });
            }

            payoutHistoryData.paymentMode = paymentMode;
            const effectiveCustomerBankId = customerBankId || bankId;
            const parsedBankId = effectiveCustomerBankId ? parseInt(effectiveCustomerBankId, 10) : null;

            if (parsedBankId && !isNaN(parsedBankId)) {
                customerBank = await dbService.findOne(model.customerBank, {
                    id: parsedBankId,
                    refId: user.id,
                    companyId: user.companyId,
                    isActive: true
                });
            } else if (accountNumber?.toString().trim() && ifscCode?.toString().trim()) {
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

            payoutHistoryData.customerBankId = parseInt(customerBank.id, 10);
            payoutHistoryData.accountNumber = customerBank.accountNumber;
            payoutHistoryData.ifscCode = customerBank.ifsc;
            payoutHistoryData.beneficiaryName = customerBank.beneficiaryName;
            payoutHistoryData.bankName = customerBank.bankName;
            payoutHistoryData.mobile = user.mobileNo || user.mobile || user.phone;

            // --- START: Commercials & Validation BEFORE API Call ---
            // 1. Fetch Operator
            payoutOperator = await dbService.findOne(model.operator, {
                operatorType: 'PAYOUT',
                isActive: true,
                minValue: { [Op.lte]: payoutAmount },
                maxValue: { [Op.gte]: payoutAmount }
            });
            console.log("payoutOperator", payoutOperator);

            if (!payoutOperator) {
                return res.failure({ message: 'PAYOUT operator configuration not found for this amount range' });
            }

            // 2. Fetch Admins
            [superAdmin, companyAdmin] = await Promise.all([
                dbService.findOne(model.user, { id: 1, companyId: 1, userRole: 1, isActive: true }),
                dbService.findOne(model.user, { id: user.id, companyId: user.companyId, userRole: 2, isActive: true })
            ]);

            if (!superAdmin) return res.failure({ message: 'Super admin not found' });
            if (!companyAdmin) return res.failure({ message: 'Company admin not found' });

            // 3. Fetch Slabs (User & Admin)
            [slabComm, adminSlabComm] = await Promise.all([
                dbService.findOne(model.commSlab, {
                    companyId: 1,
                    addedBy: superAdmin.id,
                    operatorId: payoutOperator.id,
                    roleType: 2 // User's Slab
                }),
                dbService.findOne(model.commSlab, {
                    companyId: 1,
                    operatorId: payoutOperator.id,
                    roleType: 1 // Admin's Commercial Slab
                })
            ]);
            console.log("slabComm (User)", slabComm);
            console.log("adminSlabComm (Admin)", adminSlabComm);

            if (!slabComm) {
                return res.failure({ message: 'Commission/Surcharge slab not configured for Payout' });
            }

            // 4. Calculate User Amount (Surcharge/Comm)
            const amtType = (slabComm.amtType || 'fix').toLowerCase();
            const rawComm = Number(slabComm.commAmt || 0);

            if (amtType === 'per') {
                calculatedAmount = round2((payoutAmount * rawComm) / 100);
            } else {
                calculatedAmount = round2(rawComm);
            }

            // 5. Calculate Admin Amount (For Logs/History)
            if (adminSlabComm) {
                const adminAmtType = (adminSlabComm.amtType || 'fix').toLowerCase();
                const adminRawComm = Number(adminSlabComm.commAmt || 0);
                if (adminAmtType === 'per') {
                    adminCommAmount = round2((payoutAmount * adminRawComm) / 100);
                } else {
                    adminCommAmount = round2(adminRawComm);
                }
            }

            // --- LOGS: Commercial Details ---
            console.log("-----------------------------------------");
            console.log("PAYOUT COMMERCIALS LOG");
            console.log("Operator:", payoutOperator ? payoutOperator.operatorName : 'N/A');
            console.log("Super Admin Commercial Slab:", adminSlabComm ? adminSlabComm : "None");
            console.log("Super Admin Commercial Amount:", adminCommAmount);
            console.log("Company Admin Commercial Slab:", slabComm ? slabComm : "None");
            console.log("Company Admin Commercial Amount:", calculatedAmount);

            let effectiveTotal = payoutAmount;
            const effectiveCommType = (slabComm && slabComm.commType) ? slabComm.commType.toLowerCase() : 'sur';
            if (effectiveCommType === 'sur') {
                effectiveTotal += calculatedAmount;
            } else {
                effectiveTotal -= calculatedAmount;
            }
            console.log("Company Admin Overall Pays (Net Debit):", effectiveTotal);
            console.log("-----------------------------------------");

            // 6. Fetch Wallets & Check Balance
            if (calculatedAmount > 0) {
                // Fetch Super Admin Wallet (Company Admin Wallet no longer needed for Main Wallet check)
                [superAdminWallet] = await Promise.all([
                    dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 })
                ]);

                if (!superAdminWallet) return res.failure({ message: 'Super admin wallet not found' });

                const commType = (slabComm.commType || 'sur').toLowerCase();
                const totalRequired = payoutAmount + calculatedAmount;
                const totalNet = payoutAmount - calculatedAmount;

                if (commType === 'sur') {
                    // Check if AEPS Wallet has enough for Payout + Surcharge
                    if (currentAepsBalance < totalRequired) {
                        return res.failure({
                            message: `Insufficient wallet balance for payout + surcharge. Required: ${totalRequired}, Available: ${currentAepsBalance}`
                        });
                    }
                } else if (commType === 'com') {
                    // Check if AEPS Wallet has enough for Net Payout (Payout - Commission)? 
                    // Typically we check against the net debit.
                    if (currentAepsBalance < totalNet) {
                        return res.failure({
                            message: `Insufficient wallet balance. Required: ${totalNet}, Available: ${currentAepsBalance}`
                        });
                    }
                }
            }
            // --- END: Commercials & Validation ---

            // Call ASL API for bank payout
            // aslResponse = await asl.aslAepsPayOut({
            //     mobile: user.mobileNo,
            //     accountNumber: customerBank.accountNumber,
            //     beneficiaryName: customerBank.beneficiaryName,
            //     bankName: customerBank.bankName,
            //     ifscCode: customerBank.ifsc,
            //     amount: payoutAmount.toString(),
            //     paymentMode: paymentMode,
            //     latitude: latitude,
            //     longitude: longitude,
            //     agentTransactionId: transactionID
            // });

            // Custom response for testing
            aslResponse = {
                status: 'SUCCESS',
                orderid: 'PAY1723565406',
                bankref: '604221395191',
                remark: 'Transaction was Successfull',
                agentTransactionId: transactionID
            };

            payoutHistoryData.apiResponse = aslResponse;
            payoutHistoryData.agentTransactionId = aslResponse.agentTransactionId || transactionID;

            if (aslResponse?.status) {
                const responseStatus = aslResponse.status.toUpperCase();
                if (responseStatus === 'SUCCESS' || responseStatus === 'SUCCESSFUL') {
                    payoutHistoryData.status = 'SUCCESS';
                } else if (responseStatus === 'FAILED' || responseStatus === 'FAILURE') {
                    payoutHistoryData.status = 'FAILED';
                }

                if (aslResponse.utrn) payoutHistoryData.utrn = aslResponse.bankref;
                if (aslResponse.orderid) payoutHistoryData.orderId = aslResponse.orderid;
                if (aslResponse.referenceId) payoutHistoryData.referenceId = aslResponse.bankref;
                if (aslResponse.remark) payoutHistoryData.statusMessage = aslResponse.remark;
            }

            if (payoutHistoryData.status === 'SUCCESS' && calculatedAmount > 0) {
                const superAdminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);
                const operatorName = 'Payout';
                const remarkText = `Bank payout via ${paymentMode}`;
                const commType = (slabComm.commType || 'sur').toLowerCase();

                if (commType === 'sur') {
                    // Surcharge: User Pays (Debit AEPS), Admin Receives (Credit Main)

                    const surchargeDebit = calculatedAmount;
                    // Update global aepsClosingBalance to reflect additional deduction
                    aepsClosingBalance = parseFloat((aepsClosingBalance - surchargeDebit).toFixed(2));

                    const superAdminClosingBalance = parseFloat((superAdminOpeningBalance + calculatedAmount).toFixed(2));

                    // Update SuperAdmin Wallet
                    await dbService.update(
                        model.wallet,
                        { id: superAdminWallet.id },
                        { mainWallet: superAdminClosingBalance, updatedBy: superAdmin.id }
                    );

                    // User History for Surcharge (Debit) - WalletType: AEPS
                    await dbService.createOne(model.walletHistory, {
                        refId: companyAdmin.id,
                        companyId: user.companyId,
                        walletType: walletType, // AEPS Wallet
                        operator: operatorName,
                        remark: `${remarkText} - surcharge`,
                        amount: calculatedAmount,
                        comm: 0,
                        surcharge: calculatedAmount,
                        openingAmt: parseFloat((aepsClosingBalance + surchargeDebit).toFixed(2)),
                        closingAmt: aepsClosingBalance,
                        credit: 0,
                        debit: calculatedAmount,
                        transactionId: transactionID,
                        paymentStatus: 'SUCCESS',
                        beneficiaryName: customerBank.beneficiaryName || null,
                        beneficiaryAccountNumber: customerBank.accountNumber,
                        beneficiaryBankName: customerBank.bankName || null,
                        beneficiaryIfsc: customerBank.ifsc,
                        paymentMode: paymentMode,
                        addedBy: companyAdmin.id,
                        updatedBy: companyAdmin.id
                    });

                    // Super Admin History (Credit)
                    await dbService.createOne(model.walletHistory, {
                        refId: superAdmin.id,
                        companyId: 1,
                        walletType: 'mainWallet',
                        operator: operatorName,
                        remark: `${remarkText} - surcharge received`,
                        amount: calculatedAmount,
                        comm: 0,
                        surcharge: calculatedAmount,
                        openingAmt: superAdminOpeningBalance,
                        closingAmt: superAdminClosingBalance,
                        credit: calculatedAmount,
                        debit: 0,
                        transactionId: transactionID,
                        paymentStatus: 'SUCCESS',
                        paymentMode: 'WALLET',
                        addedBy: superAdmin.id,
                        updatedBy: superAdmin.id
                    });

                } else if (commType === 'com') {
                    // Commission: User Receives (Credit AEPS), Admin Pays (Debit Main)

                    const commissionCredit = calculatedAmount;
                    // Update global aepsClosingBalance to reflect credit
                    aepsClosingBalance = parseFloat((aepsClosingBalance + commissionCredit).toFixed(2));

                    const superAdminClosingBalance = parseFloat((superAdminOpeningBalance - calculatedAmount).toFixed(2));

                    // Update SuperAdmin Wallet
                    await dbService.update(
                        model.wallet,
                        { id: superAdminWallet.id },
                        { mainWallet: superAdminClosingBalance, updatedBy: superAdmin.id }
                    );

                    // User History for Commission (Credit) - WalletType: AEPS
                    await dbService.createOne(model.walletHistory, {
                        refId: companyAdmin.id,
                        companyId: user.companyId,
                        walletType: walletType, // AEPS Wallet
                        operator: operatorName,
                        remark: `${remarkText} - commission`,
                        amount: calculatedAmount,
                        comm: calculatedAmount,
                        surcharge: 0,
                        openingAmt: parseFloat((aepsClosingBalance - commissionCredit).toFixed(2)),
                        closingAmt: aepsClosingBalance,
                        credit: calculatedAmount,
                        debit: 0,
                        transactionId: transactionID,
                        paymentStatus: 'SUCCESS',
                        beneficiaryName: customerBank.beneficiaryName || null,
                        beneficiaryAccountNumber: customerBank.accountNumber,
                        beneficiaryBankName: customerBank.bankName || null,
                        beneficiaryIfsc: customerBank.ifsc,
                        paymentMode: paymentMode,
                        addedBy: companyAdmin.id,
                        updatedBy: companyAdmin.id
                    });

                    // Super Admin History (Debit)
                    await dbService.createOne(model.walletHistory, {
                        refId: superAdmin.id,
                        companyId: 1,
                        walletType: 'mainWallet',
                        operator: operatorName,
                        remark: `${remarkText} - commission paid`,
                        amount: calculatedAmount,
                        comm: calculatedAmount,
                        surcharge: 0,
                        openingAmt: superAdminOpeningBalance,
                        closingAmt: superAdminClosingBalance,
                        credit: 0,
                        debit: calculatedAmount,
                        transactionId: transactionID,
                        paymentStatus: 'SUCCESS',
                        paymentMode: 'WALLET',
                        addedBy: superAdmin.id,
                        updatedBy: superAdmin.id
                    });
                }
            }
        }

        const payoutHistory = await dbService.createOne(model.payoutHistory, payoutHistoryData);

        if (payoutHistoryData.status === 'SUCCESS') {
            if (mode === 'wallet') {
                const walletUpdate = {
                    [walletType]: aepsClosingBalance,
                    mainWallet: mainWalletClosingBalance,
                    updatedBy: user.id
                };

                const walletHistories = [
                    {
                        refId: user.id,
                        companyId: user.companyId,
                        walletType: walletType,
                        amount: payoutAmount,
                        debit: payoutAmount,
                        credit: 0,
                        openingAmt: aepsOpeningBalance,
                        closingAmt: aepsClosingBalance,
                        transactionId: transactionID,
                        paymentStatus: 'SUCCESS',
                        remark: `Internal transfer: ${normalizedAepsType} to Main Wallet`,
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
                        remark: `Internal transfer: From ${normalizedAepsType} Wallet`,
                        addedBy: user.id,
                        updatedBy: user.id
                    }
                ];

                await Promise.all([
                    dbService.update(model.wallet, { refId: user.id, companyId: user.companyId }, walletUpdate),
                    dbService.createOne(model.walletHistory, walletHistories[0]),
                    dbService.createOne(model.walletHistory, walletHistories[1])
                ]);

            } else {
                const walletHistoryData = {
                    refId: user.id,
                    companyId: user.companyId,
                    walletType: walletType,
                    amount: payoutAmount,
                    debit: payoutAmount,
                    credit: 0,
                    openingAmt: aepsOpeningBalance,
                    closingAmt: aepsClosingBalance,
                    transactionId: transactionID,
                    paymentStatus: 'SUCCESS',
                    remark: `Bank payout via ${paymentMode} from ${normalizedAepsType}`,
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

                const walletUpdateData = {
                    [walletType]: aepsClosingBalance,
                    updatedBy: user.id
                };

                await Promise.all([
                    dbService.update(
                        model.wallet,
                        { refId: user.id, companyId: user.companyId },
                        walletUpdateData
                    ),
                    dbService.createOne(model.walletHistory, walletHistoryData)
                ]);
            }
        }

        const responseData = {
            transactionID: transactionID,
            status: payoutHistoryData.status,
            aepsType: normalizedAepsType,
            [normalizedAepsType.toLowerCase()]: {
                openingBalance: aepsOpeningBalance,
                closingBalance: aepsClosingBalance
            }
        };

        if (mode === 'wallet' && payoutHistoryData.status === 'SUCCESS') {
            responseData.mainWallet = {
                openingBalance: mainWalletOpeningBalance,
                closingBalance: mainWalletClosingBalance
            };
        }

        if (payoutHistoryData.status === 'FAILED') {
            const failureMessage = payoutHistoryData.apiResponse?.remark ||
                payoutHistoryData.statusMessage ||
                'Payout request failed';
            return res.failure({
                message: failureMessage,
                data: responseData
            });
        }

        const successMessage = mode === 'wallet'
            ? `Payout from ${normalizedAepsType} wallet to Main wallet successful`
            : `Payout request processed from ${normalizedAepsType}`;

        return res.success({
            message: successMessage,
            data: responseData
        });

    } catch (error) {
        console.log('Payout error:', error);
        return res.failure({ message: error.message || 'Internal server error' });
    }
}

const getPayoutBankList = async (req, res) => {
    try {
        if (![2].includes(req.user.userRole)) {
            return res.failure({ message: 'You are not authorized to get payout bank list' });
        }
        const user = req.user;

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

        if (!customerBanks || customerBanks.length === 0) {
            return res.success({
                message: 'Payout bank list retrieved successfully',
                data: {
                    banks: [],
                    total: 0,
                    primaryBankCount: 0
                }
            });
        }

        const uniqueBankNames = [...new Set(customerBanks.map(bank => bank.bankName).filter(Boolean))];

        const bankLogoPromises = uniqueBankNames.map(async (bankName) => {
            const [practomindBank, aslBank] = await Promise.all([
                dbService.findOne(model.practomindBankList, { bankName: bankName }),
                dbService.findOne(model.aslBankList, { bankName: bankName })
            ]);

            let bankLogo = null;
            if (practomindBank && practomindBank.bankLogo) {
                bankLogo = practomindBank.bankLogo;
            } else if (aslBank && aslBank.bankLogo) {
                bankLogo = aslBank.bankLogo;
            }

            return {
                bankName,
                bankLogo: bankLogo || null
            };
        });

        const bankLogoMap = await Promise.all(bankLogoPromises);
        const logoLookup = bankLogoMap.reduce((acc, item) => {
            acc[item.bankName] = item.bankLogo;
            return acc;
        }, {});

        const banksWithLogo = customerBanks.map(bank => {
            const bankData = bank.toJSON ? bank.toJSON() : bank;
            const rawBankLogo = bankData.bankName ? (logoLookup[bankData.bankName] || null) : null;

            let bankLogo = null;
            if (rawBankLogo) {
                bankLogo = `${process.env.AWS_CDN_URL}/${rawBankLogo}`;
            }

            return {
                id: bankData.id,
                customerBankId: bankData.id,
                bankName: bankData.bankName,
                bankLogo: bankLogo,
                branch: bankData.branch || null,
                ifscCode: bankData.ifsc || null,
                accountNumber: bankData.accountNumber || null,
                isPrimary: bankData.isPrimary === true || bankData.isPrimary === 1
            };
        });

        const primaryBankCount = banksWithLogo.filter(bank => bank.isPrimary === true).length;

        return res.success({
            message: 'Payout bank list retrieved successfully',
            data: {
                banks: banksWithLogo,
                total: banksWithLogo.length,
                primaryBankCount: primaryBankCount
            }
        });

    } catch (error) {
        console.log('Get payout bank list error:', error);
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

const getAllPayoutHistory = async (req, res) => {
    try {
        if (![2].includes(req.user.userRole)) {
            return res.failure({ message: 'You are not authorized to get all payout history' });
        }
        const user = req.user;

        const dataToFind = req.body || {};
        let options = {};
        let query = { companyId: user.companyId };

        if (dataToFind && dataToFind.query) {
            const { startDate, endDate, type, walletType, aepsType, ...restQuery } = dataToFind.query;

            query = { ...query, ...restQuery };

            if (startDate) {
                query.startDate = startDate;
            }
            if (endDate) {
                query.endDate = endDate;
            }

            if (type && typeof type === 'string' && type.toLowerCase() !== 'all') {
                query.type = type.toLowerCase();
            }

            if (walletType && typeof walletType === 'string') {
                const normalizedWalletType = walletType.toUpperCase();
                if (normalizedWalletType === 'AEPS1') {
                    query.walletType = 'apes1Wallet';
                } else if (normalizedWalletType === 'AEPS2') {
                    query.walletType = 'apes2Wallet';
                } else {
                    query.walletType = walletType;
                }
            } else if (aepsType && typeof aepsType === 'string') {
                const normalizedAepsType = aepsType.toUpperCase();
                if (normalizedAepsType === 'AEPS1') {
                    query.walletType = 'apes1Wallet';
                } else if (normalizedAepsType === 'AEPS2') {
                    query.walletType = 'apes2Wallet';
                }
            }
        }

        if (dataToFind && dataToFind.options !== undefined) {
            options = { ...dataToFind.options };
        }
        if (dataToFind && dataToFind.customSearch) {
            const searchConditions = [];
            const customSearch = dataToFind.customSearch;

            if (customSearch.transactionID || customSearch.transactionId) {
                const searchValue = String(customSearch.transactionID || customSearch.transactionId).trim();
                if (searchValue) {
                    searchConditions.push({
                        transactionID: {
                            [Op.iLike]: `%${searchValue}%`
                        }
                    });
                }
            }

            if (customSearch.beneficiaryName) {
                const searchValue = String(customSearch.beneficiaryName).trim();
                if (searchValue) {
                    searchConditions.push({
                        beneficiaryName: {
                            [Op.iLike]: `%${searchValue}%`
                        }
                    });
                }
            }

            if (searchConditions.length > 0) {
                query = {
                    ...query,
                    [Op.and]: [{ [Op.or]: searchConditions }]
                };
            }
        }

        const result = await dbService.paginate(model.payoutHistory, query, options);

        return res.success({
            message: 'Payout history retrieved successfully',
            data: result?.data || [],
            total: result?.total || 0,
            paginator: result?.paginator
        });
    }
    catch (error) {
        console.log('Get all payout history error:', error);
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

module.exports = {
    payout,
    getPayoutBankList,
    getAllPayoutHistory
};