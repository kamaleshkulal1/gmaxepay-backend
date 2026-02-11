const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const { generateTransactionID } = require('../../../utils/transactionID');
const asl = require('../../../services/asl');

const round2 = (num) => {
    const n = Number(num);
    return Number.isFinite(n)
        ? Math.round((n + Number.EPSILON) * 100) / 100
        : 0;
};

const calcSlabAmount = (slab, baseAmount) => {
    if (!slab) return 0;
    const base = Number(baseAmount || 0);
    const rawComm = Number(slab.commAmt || 0);
    if (!Number.isFinite(base) || !Number.isFinite(rawComm)) return 0;

    const amtType = (slab.amtType || 'fix').toLowerCase();
    if (amtType === 'per') {
        return round2((base * rawComm) / 100);
    }
    return round2(rawComm);
};

const payout = async (req, res) => {
    try {
        if(![3,4,5].includes(req.user.userRole)){
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
        
        // Validate required fields
        const payoutAmount = parseFloat(amount);
        if (!amount || isNaN(payoutAmount) || payoutAmount <= 0) {
            return res.failure({ message: 'Amount is required and must be a valid number greater than 0' });
        }
        
        if (!mode || !['wallet', 'bank'].includes(mode)) {
            return res.failure({ message: 'Valid mode is required (wallet or bank)' });
        }
        
        // Validate AEPS type
        if (!aepsType || !['AEPS1', 'AEPS2'].includes(aepsType.toUpperCase())) {
            return res.failure({ message: 'Invalid AEPS type' });
        }
        
        if (!latitude || !longitude) {
            return res.failure({ message: 'Latitude and longitude are required' });
        }
        
        const normalizedAepsType = aepsType.toUpperCase();
        const walletType = normalizedAepsType === 'AEPS1' ? 'apes1Wallet' : 'apes2Wallet';
        
        // Parallel fetch: company and wallet
        const [company, wallet] = await Promise.all([
            dbService.findOne(model.company, { id: user.companyId }),
            dbService.findOne(model.wallet, { refId: user.id, companyId: user.companyId })
        ]);
        
        if (!company) return res.failure({ message: 'Company not found' });
        if (!wallet) return res.failure({ message: 'Wallet not found' });
        
        // Check AEPS wallet balance based on type
        const currentAepsBalance = parseFloat(wallet[walletType] || 0);
        if (currentAepsBalance < payoutAmount) {
            return res.failure({ 
                message: `Insufficient ${normalizedAepsType} wallet balance`,
                currentBalance: currentAepsBalance,
                requiredAmount: payoutAmount
            });
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
            // For bank payout, record which AEPS wallet was used (apes1Wallet / apes2Wallet).
            // For internal wallet transfers, we keep this null (no specific single wallet).
            walletType: mode === 'bank' ? walletType : null,
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
            console.log('parsedBankId', parsedBankId);
            if (parsedBankId && !isNaN(parsedBankId)) {
                // Find by ID
                customerBank = await dbService.findOne(model.customerBank, {
                    id: parsedBankId,
                    refId: user.id,
                    companyId: user.companyId,
                    isActive: true
                });
                console.log('customerBank', customerBank);
            } else if (accountNumber && ifscCode) {
                // Find by account number and IFSC
                customerBank = await dbService.findOne(model.customerBank, {
                    accountNumber: accountNumber,
                    ifsc: ifscCode,
                    refId: user.id,
                    companyId: user.companyId,
                    isActive: true
                });
                console.log('customerBank', customerBank);
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

            // Handle commission/surcharge logic for userRole 4 and 5
            if ([4, 5].includes(user.userRole)) {
                let distributor;
                let companyAdmin;
                let superAdmin;
                let companySlabComm;
                let SuperAdminSlabComm;
                let masterDistributorComm;
                let distributorComm;
                let masterDistributor;
                let retailer;
                let distributorWallet;
                let companyWallet;
                let superAdminWallet;
                let masterDistributorWallet;
                let retailerWallet;

                if (user.userRole === 4) {
                    // Distributor logic
                    [
                        distributor,
                        companyAdmin,
                        superAdmin,
                    ] = await Promise.all([
                        dbService.findOne(model.user, {
                            id: user.id,
                            companyId: user.companyId,
                            isActive: true
                        }),
                        dbService.findOne(model.user, {
                            companyId: user.companyId,
                            userRole: 2,
                            isActive: true
                        }),
                        dbService.findOne(model.user, {
                            id: 1,
                            companyId: 1,
                            userRole: 1,
                            isActive: true
                        })
                    ]);

                    if (!distributor) {
                        return res.failure({ message: 'Distributor not found' });
                    }
                    if (!companyAdmin) {
                        return res.failure({ message: 'Company admin not found' });
                    }
                    if (!superAdmin) {
                        return res.failure({ message: 'Super admin not found' });
                    }

                    // Check if distributor reports to company admin directly or has no reporting (null)
                    if (distributor.reportingTo === companyAdmin.id || distributor.reportingTo === null) {
                        // Scenario 1: Distributor reports directly to company admin (no master distributor)
                        [
                            SuperAdminSlabComm,
                            companySlabComm
                        ] = await Promise.all([
                            dbService.findAll(
                                model.commSlab,
                                {
                                    companyId: 1,
                                    addedBy: superAdmin.id,
                                    operatorType: 'PAYOUT'
                                },
                                { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }
                            ),
                            dbService.findAll(
                                model.commSlab,
                                {
                                    companyId: user.companyId,
                                    addedBy: companyAdmin.id,
                                    operatorType: 'PAYOUT'
                                },
                                { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }
                            )
                        ]);

                        if (!SuperAdminSlabComm || !companySlabComm) {
                            return res.failure({ message: 'Super admin or company admin slab commission not found' });
                        }

                        [
                            superAdminWallet,
                            companyWallet,
                            distributorWallet
                        ] = await Promise.all([
                            dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 }),
                            dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                            dbService.findOne(model.wallet, { refId: distributor.id, companyId: user.companyId })
                        ]);

                        if (!superAdminWallet || !companyWallet || !distributorWallet) {
                            return res.failure({ message: 'Super admin, company admin or distributor wallet not found' });
                        }
                    } else if (distributor.reportingTo && distributor.reportingTo !== null) {
                        masterDistributor = await dbService.findOne(model.user, {
                            id: distributor.reportingTo,
                            companyId: user.companyId,
                            isActive: true
                        });

                        if (!masterDistributor) {
                            return res.failure({ message: 'Master distributor not found' });
                        }

                        [
                            SuperAdminSlabComm,
                            companySlabComm,
                            masterDistributorComm
                        ] = await Promise.all([
                            dbService.findAll(
                                model.commSlab,
                                {
                                    companyId: 1,
                                    addedBy: superAdmin.id,
                                    operatorType: 'PAYOUT'
                                },
                                { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }
                            ),
                            dbService.findAll(
                                model.commSlab,
                                {
                                    companyId: user.companyId,
                                    addedBy: companyAdmin.id,
                                    operatorType: 'PAYOUT'
                                },
                                { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }
                            ),
                            dbService.findAll(
                                model.commSlab,
                                {
                                    companyId: user.companyId,
                                    addedBy: masterDistributor.id,
                                    operatorType: 'PAYOUT'
                                },
                                { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }
                            )
                        ]);

                        if (!SuperAdminSlabComm || !companySlabComm || !masterDistributorComm) {
                            return res.failure({ message: 'Super admin, company admin or master distributor slab commission not found' });
                        }

                        [
                            superAdminWallet,
                            companyWallet,
                            distributorWallet,
                            masterDistributorWallet
                        ] = await Promise.all([
                            dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 }),
                            dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                            dbService.findOne(model.wallet, { refId: distributor.id, companyId: user.companyId }),
                            dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: user.companyId })
                        ]);

                        if (!superAdminWallet || !companyWallet || !distributorWallet || !masterDistributorWallet) {
                            return res.failure({ message: 'Super admin, company admin, distributor or master distributor wallet not found' });
                        }
                    } else {
                        return res.failure({ message: 'Invalid distributor reporting structure' });
                    }
                } else if (user.userRole === 5) {
                    // Retailer logic
                    [retailer, companyAdmin, superAdmin] = await Promise.all([
                        dbService.findOne(model.user, {
                            id: user.id,
                            companyId: user.companyId,
                            isActive: true
                        }),
                        dbService.findOne(model.user, {
                            companyId: user.companyId,
                            userRole: 2,
                            isActive: true
                        }),
                        dbService.findOne(model.user, {
                            id: 1,
                            companyId: 1,
                            userRole: 1,
                            isActive: true
                        })
                    ]);
                    if (!retailer || !companyAdmin || !superAdmin) {
                        return res.failure({ message: 'Retailer, company admin or super admin not found' });
                    }
                    if (retailer.reportingTo === companyAdmin.id || retailer.reportingTo === null) {
                        // Scenario 1: Retailer reports directly to company admin (no master distributor or distributor)
                        [
                            SuperAdminSlabComm,
                            companySlabComm
                        ] = await Promise.all([
                            dbService.findAll(model.commSlab, {
                                companyId: 1,
                                addedBy: superAdmin.id,
                                operatorType: 'PAYOUT'
                            }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                            dbService.findAll(model.commSlab, {
                                companyId: user.companyId,
                                addedBy: companyAdmin.id,
                                operatorType: 'PAYOUT'
                            }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] })
                        ]);
                        if (!SuperAdminSlabComm)
                            return res.failure({ message: 'Super admin slab commission not found' });
                        if (!companySlabComm)
                            return res.failure({ message: 'Company admin slab commission not found' });
                        [
                            superAdminWallet,
                            companyWallet,
                            retailerWallet
                        ] = await Promise.all([
                            dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 }),
                            dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                            dbService.findOne(model.wallet, { refId: retailer.id, companyId: user.companyId })
                        ]);

                        if (!superAdminWallet)
                            return res.failure({ message: 'Super admin wallet not found' });
                        if (!companyWallet)
                            return res.failure({ message: 'Company admin wallet not found' });
                        if (!retailerWallet)
                            return res.failure({ message: 'Retailer wallet not found' });
                    } else if (retailer.reportingTo && retailer.reportingTo !== null) {
                        // Find the reporting user to determine if it's master distributor or distributor
                        const reportingUser = await dbService.findOne(model.user, {
                            id: retailer.reportingTo,
                            companyId: user.companyId,
                            isActive: true
                        });

                        if (!reportingUser) {
                            return res.failure({ message: 'Reporting user not found' });
                        }

                        if (reportingUser.userRole === 3) {
                            // Scenario 2: Retailer reports to master distributor
                            masterDistributor = reportingUser;
                            [
                                SuperAdminSlabComm,
                                companySlabComm,
                                masterDistributorComm
                            ] = await Promise.all([
                                dbService.findAll(model.commSlab, {
                                    companyId: 1,
                                    addedBy: superAdmin.id,
                                    operatorType: 'PAYOUT'
                                }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                                dbService.findAll(model.commSlab, {
                                    companyId: user.companyId,
                                    addedBy: companyAdmin.id,
                                    operatorType: 'PAYOUT'
                                }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                                dbService.findAll(model.commSlab, {
                                    companyId: user.companyId,
                                    addedBy: masterDistributor.id,
                                    operatorType: 'PAYOUT'
                                }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] })
                            ]);
                            if (!SuperAdminSlabComm || !companySlabComm || !masterDistributorComm)
                                return res.failure({ message: 'Super admin, company admin or master distributor slab commission not found' });
                            [
                                superAdminWallet,
                                companyWallet,
                                retailerWallet,
                                masterDistributorWallet
                            ] = await Promise.all([
                                dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 }),
                                dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                                dbService.findOne(model.wallet, { refId: retailer.id, companyId: user.companyId }),
                                dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: user.companyId })
                            ]);
                            if (!superAdminWallet || !companyWallet || !retailerWallet || !masterDistributorWallet)
                                return res.failure({ message: 'Super admin, company admin, retailer or master distributor wallet not found' });
                        } else if (reportingUser.userRole === 4) {
                            // Scenario 3: Retailer reports to distributor
                            distributor = reportingUser;
                            // Check if distributor reports to master distributor
                            if (distributor.reportingTo && distributor.reportingTo !== null && distributor.reportingTo !== companyAdmin.id) {
                                masterDistributor = await dbService.findOne(model.user, {
                                    id: distributor.reportingTo,
                                    companyId: user.companyId,
                                    isActive: true
                                });
                                if (masterDistributor && masterDistributor.userRole === 3) {
                                    // Scenario 4: Retailer -> Distributor -> Master Distributor (all in chain)
                                    [
                                        SuperAdminSlabComm,
                                        companySlabComm,
                                        masterDistributorComm,
                                        distributorComm
                                    ] = await Promise.all([
                                        dbService.findAll(model.commSlab, {
                                            companyId: 1,
                                            addedBy: superAdmin.id,
                                            operatorType: 'PAYOUT'
                                        }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                                        dbService.findAll(model.commSlab, {
                                            companyId: user.companyId,
                                            addedBy: companyAdmin.id,
                                            operatorType: 'PAYOUT'
                                        }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                                        dbService.findAll(model.commSlab, {
                                            companyId: user.companyId,
                                            addedBy: masterDistributor.id,
                                            operatorType: 'PAYOUT'
                                        }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                                        dbService.findAll(model.commSlab, {
                                            companyId: user.companyId,
                                            addedBy: distributor.id,
                                            operatorType: 'PAYOUT'
                                        }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] })
                                    ]);
                                    if (!SuperAdminSlabComm || !companySlabComm || !masterDistributorComm || !distributorComm)
                                        return res.failure({ message: 'Super admin, company admin, master distributor or distributor slab commission not found' });
                                    [
                                        superAdminWallet,
                                        companyWallet,
                                        retailerWallet,
                                        masterDistributorWallet,
                                        distributorWallet
                                    ] = await Promise.all([
                                        dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 }),
                                        dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                                        dbService.findOne(model.wallet, { refId: retailer.id, companyId: user.companyId }),
                                        dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: user.companyId }),
                                        dbService.findOne(model.wallet, { refId: distributor.id, companyId: user.companyId })
                                    ]);
                                    if (!superAdminWallet || !companyWallet || !retailerWallet || !masterDistributorWallet || !distributorWallet)
                                        return res.failure({ message: 'Super admin, company admin, retailer, master distributor or distributor wallet not found' });
                                } else {
                                    // Distributor reports to company admin, so only distributor in chain
                                    [
                                        SuperAdminSlabComm,
                                        companySlabComm,
                                        distributorComm
                                    ] = await Promise.all([
                                        dbService.findAll(model.commSlab, {
                                            companyId: 1,
                                            addedBy: superAdmin.id,
                                            operatorType: 'PAYOUT'
                                        }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                                        dbService.findAll(model.commSlab, {
                                            companyId: user.companyId,
                                            addedBy: companyAdmin.id,
                                            operatorType: 'PAYOUT'
                                        }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                                        dbService.findAll(model.commSlab, {
                                            companyId: user.companyId,
                                            addedBy: distributor.id,
                                            operatorType: 'PAYOUT'
                                        }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] })
                                    ]);
                                    if (!SuperAdminSlabComm || !companySlabComm || !distributorComm)
                                        return res.failure({ message: 'Super admin, company admin or distributor slab commission not found' });
                                    [
                                        superAdminWallet,
                                        companyWallet,
                                        retailerWallet,
                                        distributorWallet
                                    ] = await Promise.all([
                                        dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 }),
                                        dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                                        dbService.findOne(model.wallet, { refId: retailer.id, companyId: user.companyId }),
                                        dbService.findOne(model.wallet, { refId: distributor.id, companyId: user.companyId })
                                    ]);
                                    if (!superAdminWallet || !companyWallet || !retailerWallet || !distributorWallet)
                                        return res.failure({ message: 'Super admin, company admin, retailer or distributor wallet not found' });
                                }
                            } else {
                                // Scenario 3: Retailer reports to distributor (distributor reports to company admin)
                                [
                                    SuperAdminSlabComm,
                                    companySlabComm,
                                    distributorComm
                                ] = await Promise.all([
                                    dbService.findAll(model.commSlab, {
                                        companyId: 1,
                                        addedBy: superAdmin.id,
                                        operatorType: 'PAYOUT'
                                    }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                                    dbService.findAll(model.commSlab, {
                                        companyId: user.companyId,
                                        addedBy: companyAdmin.id,
                                        operatorType: 'PAYOUT'
                                    }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                                    dbService.findAll(model.commSlab, {
                                        companyId: user.companyId,
                                        addedBy: distributor.id,
                                        operatorType: 'PAYOUT'
                                    }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] })
                                ]);
                                if (!SuperAdminSlabComm || !companySlabComm || !distributorComm)
                                    return res.failure({ message: 'Super admin, company admin or distributor slab commission not found' });
                                [
                                    superAdminWallet,
                                    companyWallet,
                                    retailerWallet,
                                    distributorWallet
                                ] = await Promise.all([
                                    dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 }),
                                    dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                                    dbService.findOne(model.wallet, { refId: retailer.id, companyId: user.companyId }),
                                    dbService.findOne(model.wallet, { refId: distributor.id, companyId: user.companyId })
                                ]);
                                if (!superAdminWallet || !companyWallet || !retailerWallet || !distributorWallet)
                                    return res.failure({ message: 'Super admin, company admin, retailer or distributor wallet not found' });
                            }
                        } else {
                            return res.failure({ message: 'Invalid retailer reporting structure' });
                        }
                    }
                }

                // Process commission/surcharge only if payout is successful
                if (payoutHistoryData.status === 'SUCCESS') {
                    const operatorName = 'Payout';
                    const remarkText = `Bank payout via ${paymentMode} charge`;

                    if (user.userRole === 4) {
                        // Distributor commission logic
                        if (distributor.reportingTo === companyAdmin.id || distributor.reportingTo === null) {
                            // Scenario 1: Distributor reports directly to company admin
                            const distSlab = companySlabComm?.find(
                                (c) => c.roleType === 4 || c.roleName === 'DI'
                            );
                            const adminSlab = SuperAdminSlabComm?.find(
                                (c) => c.roleType === 1 || c.roleName === 'AD'
                            );
                            const companySlab = companySlabComm?.find(
                                (c) => c.roleType === 2 || c.roleName === 'WU'
                            );

                            const distBaseAmount = Number(distSlab?.commAmt || 0);
                            const distSurchargeAmt = calcSlabAmount(distSlab, distBaseAmount);

                            const companySurchargeAmt = calcSlabAmount(companySlab, distSurchargeAmt);
                            const adminSurchargeAmt = calcSlabAmount(adminSlab, distSurchargeAmt);

                            if (distSurchargeAmt <= 0) {
                                return res.failure({
                                    message: 'Invalid distributor surcharge configuration for payout'
                                });
                            }

                            if (adminSurchargeAmt < 0 || companySurchargeAmt < 0) {
                                return res.failure({
                                    message: 'Invalid admin/whitelabel surcharge configuration for payout'
                                });
                            }

                            if (adminSurchargeAmt + companySurchargeAmt > distSurchargeAmt) {
                                return res.failure({
                                    message: 'Invalid surcharge configuration: total admin + company income is greater than distributor debit for payout'
                                });
                            }

                            const distOpeningBalance = parseFloat(distributorWallet.mainWallet || 0);
                            const companyOpeningBalance = parseFloat(companyWallet.mainWallet || 0);
                            const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

                            const totalDebitFromDistributor = distSurchargeAmt;

                            if (distOpeningBalance < totalDebitFromDistributor) {
                                return res.failure({
                                    message: `Insufficient wallet balance. Required: ${totalDebitFromDistributor}, Available: ${distOpeningBalance}`
                                });
                            }

                            const distClosingBalance = parseFloat((distOpeningBalance - totalDebitFromDistributor).toFixed(2));
                            const companyClosingBalance = parseFloat((companyOpeningBalance + companySurchargeAmt).toFixed(2));
                            const adminClosingBalance = parseFloat((adminOpeningBalance + adminSurchargeAmt).toFixed(2));

                            // Update wallets
                            await dbService.update(
                                model.wallet,
                                { id: distributorWallet.id },
                                { mainWallet: distClosingBalance, updatedBy: distributor.id }
                            );

                            await dbService.update(
                                model.wallet,
                                { id: companyWallet.id },
                                { mainWallet: companyClosingBalance, updatedBy: companyAdmin.id }
                            );

                            await dbService.update(
                                model.wallet,
                                { id: superAdminWallet.id },
                                { mainWallet: adminClosingBalance, updatedBy: superAdmin.id }
                            );

                            // Wallet history for Distributor (debit)
                            await dbService.createOne(model.walletHistory, {
                                refId: distributor.id,
                                companyId: user.companyId,
                                walletType: walletType,
                                operator: operatorName,
                                remark: remarkText,
                                amount: totalDebitFromDistributor,
                                comm: 0,
                                surcharge: totalDebitFromDistributor,
                                openingAmt: distOpeningBalance,
                                closingAmt: distClosingBalance,
                                credit: 0,
                                debit: totalDebitFromDistributor,
                                transactionId: transactionID,
                                paymentStatus: 'SUCCESS',
                                beneficiaryName: customerBank.beneficiaryName || null,
                                beneficiaryAccountNumber: customerBank.accountNumber,
                                beneficiaryBankName: customerBank.bankName || null,
                                beneficiaryIfsc: customerBank.ifsc,
                                paymentMode: paymentMode,
                                addedBy: distributor.id,
                                updatedBy: distributor.id
                            });

                            // Wallet history for Company Admin (credit)
                            await dbService.createOne(model.walletHistory, {
                                refId: companyAdmin.id,
                                companyId: user.companyId,
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
                                transactionId: transactionID,
                                paymentStatus: 'SUCCESS',
                                beneficiaryName: companyAdmin.name || null,
                                beneficiaryAccountNumber: null,
                                beneficiaryBankName: null,
                                beneficiaryIfsc: null,
                                paymentMode: 'WALLET',
                                addedBy: companyAdmin.id,
                                updatedBy: companyAdmin.id
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
                                transactionId: transactionID,
                                paymentStatus: 'SUCCESS',
                                beneficiaryName: superAdmin.name || null,
                                beneficiaryAccountNumber: null,
                                beneficiaryBankName: null,
                                beneficiaryIfsc: null,
                                paymentMode: 'WALLET',
                                addedBy: superAdmin.id,
                                updatedBy: superAdmin.id
                            });
                        } else if (distributor.reportingTo && distributor.reportingTo !== null) {
                            // Scenario 2: Distributor reports to master distributor
                            const distSlab = masterDistributorComm?.find(
                                (c) => c.roleType === 4 || c.roleName === 'DI'
                            );
                            const adminSlab = SuperAdminSlabComm?.find(
                                (c) => c.roleType === 1 || c.roleName === 'AD'
                            );
                            const companySlab = companySlabComm?.find(
                                (c) => c.roleType === 2 || c.roleName === 'WU'
                            );
                            const mdSlab = masterDistributorComm?.find(
                                (c) => c.roleType === 3 || c.roleName === 'MD'
                            );

                            const distBaseAmount = Number(distSlab?.commAmt || 0);
                            const distSurchargeAmt = calcSlabAmount(distSlab, distBaseAmount);

                            const mdSurchargeAmt = calcSlabAmount(mdSlab, distSurchargeAmt);
                            const companySurchargeAmt = calcSlabAmount(companySlab, mdSurchargeAmt);
                            const adminSurchargeAmt = calcSlabAmount(adminSlab, mdSurchargeAmt);

                            if (distSurchargeAmt <= 0) {
                                return res.failure({
                                    message: 'Invalid distributor surcharge configuration for payout'
                                });
                            }

                            if (mdSurchargeAmt < 0 || adminSurchargeAmt < 0 || companySurchargeAmt < 0) {
                                return res.failure({
                                    message: 'Invalid master distributor/admin/whitelabel surcharge configuration for payout'
                                });
                            }

                            if (mdSurchargeAmt + adminSurchargeAmt + companySurchargeAmt > distSurchargeAmt) {
                                return res.failure({
                                    message: 'Invalid surcharge configuration: total MD + admin + company income is greater than distributor debit for payout'
                                });
                            }

                            const distOpeningBalance = parseFloat(distributorWallet.mainWallet || 0);
                            const mdOpeningBalance = parseFloat(masterDistributorWallet.mainWallet || 0);
                            const companyOpeningBalance = parseFloat(companyWallet.mainWallet || 0);
                            const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

                            const totalDebitFromDistributor = distSurchargeAmt;

                            if (distOpeningBalance < totalDebitFromDistributor) {
                                return res.failure({
                                    message: `Insufficient wallet balance. Required: ${totalDebitFromDistributor}, Available: ${distOpeningBalance}`
                                });
                            }

                            const distClosingBalance = parseFloat((distOpeningBalance - totalDebitFromDistributor).toFixed(2));
                            const mdClosingBalance = parseFloat((mdOpeningBalance + mdSurchargeAmt).toFixed(2));
                            const companyClosingBalance = parseFloat((companyOpeningBalance + companySurchargeAmt).toFixed(2));
                            const adminClosingBalance = parseFloat((adminOpeningBalance + adminSurchargeAmt).toFixed(2));

                            // Update wallets
                            await dbService.update(
                                model.wallet,
                                { id: distributorWallet.id },
                                { mainWallet: distClosingBalance, updatedBy: distributor.id }
                            );

                            await dbService.update(
                                model.wallet,
                                { id: masterDistributorWallet.id },
                                { mainWallet: mdClosingBalance, updatedBy: masterDistributor.id }
                            );

                            await dbService.update(
                                model.wallet,
                                { id: companyWallet.id },
                                { mainWallet: companyClosingBalance, updatedBy: companyAdmin.id }
                            );

                            await dbService.update(
                                model.wallet,
                                { id: superAdminWallet.id },
                                { mainWallet: adminClosingBalance, updatedBy: superAdmin.id }
                            );

                            // Wallet history for Distributor (debit from AEPS wallet)
                            await dbService.createOne(model.walletHistory, {
                                refId: distributor.id,
                                companyId: user.companyId,
                                walletType: walletType,
                                operator: operatorName,
                                remark: remarkText,
                                amount: totalDebitFromDistributor,
                                comm: 0,
                                surcharge: totalDebitFromDistributor,
                                openingAmt: distOpeningBalance,
                                closingAmt: distClosingBalance,
                                credit: 0,
                                debit: totalDebitFromDistributor,
                                transactionId: transactionID,
                                paymentStatus: 'SUCCESS',
                                beneficiaryName: customerBank.beneficiaryName || null,
                                beneficiaryAccountNumber: customerBank.accountNumber,
                                beneficiaryBankName: customerBank.bankName || null,
                                beneficiaryIfsc: customerBank.ifsc,
                                paymentMode: paymentMode,
                                addedBy: distributor.id,
                                updatedBy: distributor.id
                            });
                            // Wallet history for Distributor (debit from AEPS wallet)
                            await dbService.createOne(model.walletHistory, {
                                refId: distributor.id,
                                companyId: user.companyId,
                                walletType: walletType,
                                operator: operatorName,
                                remark: remarkText,
                                amount: totalDebitFromDistributor,
                                comm: 0,
                                surcharge: totalDebitFromDistributor,
                                openingAmt: distOpeningBalance,
                                closingAmt: distClosingBalance,
                                credit: 0,
                                debit: totalDebitFromDistributor,
                                transactionId: transactionID,
                                paymentStatus: 'SUCCESS',
                                beneficiaryName: customerBank.beneficiaryName || null,
                                beneficiaryAccountNumber: customerBank.accountNumber,
                                beneficiaryBankName: customerBank.bankName || null,
                                beneficiaryIfsc: customerBank.ifsc,
                                paymentMode: paymentMode,
                                addedBy: distributor.id,
                                updatedBy: distributor.id
                            });

                            // Wallet history for Master Distributor (credit)
                            await dbService.createOne(model.walletHistory, {
                                refId: masterDistributor.id,
                                companyId: user.companyId,
                                walletType: 'mainWallet',
                                operator: operatorName,
                                remark: `${remarkText} - master distributor commission`,
                                amount: mdSurchargeAmt,
                                comm: mdSurchargeAmt,
                                surcharge: 0,
                                openingAmt: mdOpeningBalance,
                                closingAmt: mdClosingBalance,
                                credit: mdSurchargeAmt,
                                debit: 0,
                                transactionId: transactionID,
                                paymentStatus: 'SUCCESS',
                                beneficiaryName: masterDistributor.name || null,
                                beneficiaryAccountNumber: null,
                                beneficiaryBankName: null,
                                beneficiaryIfsc: null,
                                paymentMode: 'WALLET',
                                addedBy: masterDistributor.id,
                                updatedBy: masterDistributor.id
                            });

                            // Wallet history for Company Admin (credit)
                            await dbService.createOne(model.walletHistory, {
                                refId: companyAdmin.id,
                                companyId: user.companyId,
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
                                transactionId: transactionID,
                                paymentStatus: 'SUCCESS',
                                beneficiaryName: companyAdmin.name || null,
                                beneficiaryAccountNumber: null,
                                beneficiaryBankName: null,
                                beneficiaryIfsc: null,
                                paymentMode: 'WALLET',
                                addedBy: companyAdmin.id,
                                updatedBy: companyAdmin.id
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
                                transactionId: transactionID,
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
                    } else if (user.userRole === 5) {
                        // Retailer commission logic
                        if (retailer.reportingTo === companyAdmin.id || retailer.reportingTo === null) {
                            // Scenario 1: Retailer reports directly to company admin
                            const retailerSlab = companySlabComm?.find(
                                (c) => c.roleType === 5 || c.roleName === 'RT'
                            );
                            const adminSlab = SuperAdminSlabComm?.find(
                                (c) => c.roleType === 1 || c.roleName === 'AD'
                            );
                            const companySlab = companySlabComm?.find(
                                (c) => c.roleType === 2 || c.roleName === 'WU'
                            );

                            const retailerBaseAmount = Number(retailerSlab?.commAmt || 0);
                            const retailerSurchargeAmt = calcSlabAmount(retailerSlab, retailerBaseAmount);

                            const companySurchargeAmt = calcSlabAmount(companySlab, retailerSurchargeAmt);
                            const adminSurchargeAmt = calcSlabAmount(adminSlab, retailerSurchargeAmt);

                            if (retailerSurchargeAmt <= 0) {
                                return res.failure({
                                    message: 'Invalid retailer surcharge configuration for payout'
                                });
                            }

                            if (adminSurchargeAmt < 0 || companySurchargeAmt < 0) {
                                return res.failure({
                                    message: 'Invalid admin/whitelabel surcharge configuration for payout'
                                });
                            }

                            if (adminSurchargeAmt + companySurchargeAmt > retailerSurchargeAmt) {
                                return res.failure({
                                    message: 'Invalid surcharge configuration: total admin + company income is greater than retailer debit for payout'
                                });
                            }

                            const retailerOpeningBalance = parseFloat(retailerWallet.mainWallet || 0);
                            const companyOpeningBalance = parseFloat(companyWallet.mainWallet || 0);
                            const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

                            const totalDebitFromRetailer = retailerSurchargeAmt;

                            if (retailerOpeningBalance < totalDebitFromRetailer) {
                                return res.failure({
                                    message: `Insufficient wallet balance. Required: ${totalDebitFromRetailer}, Available: ${retailerOpeningBalance}`
                                });
                            }

                            const retailerClosingBalance = parseFloat((retailerOpeningBalance - totalDebitFromRetailer).toFixed(2));
                            const companyClosingBalance = parseFloat((companyOpeningBalance + companySurchargeAmt).toFixed(2));
                            const adminClosingBalance = parseFloat((adminOpeningBalance + adminSurchargeAmt).toFixed(2));

                            // Update wallets
                            await dbService.update(
                                model.wallet,
                                { id: retailerWallet.id },
                                { mainWallet: retailerClosingBalance, updatedBy: retailer.id }
                            );

                            await dbService.update(
                                model.wallet,
                                { id: companyWallet.id },
                                { mainWallet: companyClosingBalance, updatedBy: companyAdmin.id }
                            );

                            await dbService.update(
                                model.wallet,
                                { id: superAdminWallet.id },
                                { mainWallet: adminClosingBalance, updatedBy: superAdmin.id }
                            );

                            // Wallet history for Retailer (debit from AEPS wallet)
                            await dbService.createOne(model.walletHistory, {
                                refId: retailer.id,
                                companyId: user.companyId,
                                walletType: walletType,
                                operator: operatorName,
                                remark: remarkText,
                                amount: totalDebitFromRetailer,
                                comm: 0,
                                surcharge: totalDebitFromRetailer,
                                openingAmt: retailerOpeningBalance,
                                closingAmt: retailerClosingBalance,
                                credit: 0,
                                debit: totalDebitFromRetailer,
                                transactionId: transactionID,
                                paymentStatus: 'SUCCESS',
                                beneficiaryName: customerBank.beneficiaryName || null,
                                beneficiaryAccountNumber: customerBank.accountNumber,
                                beneficiaryBankName: customerBank.bankName || null,
                                beneficiaryIfsc: customerBank.ifsc,
                                paymentMode: paymentMode,
                                addedBy: retailer.id,
                                updatedBy: retailer.id
                            });

                            // Wallet history for Company Admin (credit)
                            await dbService.createOne(model.walletHistory, {
                                refId: companyAdmin.id,
                                companyId: user.companyId,
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
                                transactionId: transactionID,
                                paymentStatus: 'SUCCESS',
                                beneficiaryName: companyAdmin.name || null,
                                beneficiaryAccountNumber: null,
                                beneficiaryBankName: null,
                                beneficiaryIfsc: null,
                                paymentMode: 'WALLET',
                                addedBy: companyAdmin.id,
                                updatedBy: companyAdmin.id
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
                                transactionId: transactionID,
                                paymentStatus: 'SUCCESS',
                                beneficiaryName: superAdmin.name || null,
                                beneficiaryAccountNumber: null,
                                beneficiaryBankName: null,
                                beneficiaryIfsc: null,
                                paymentMode: 'WALLET',
                                addedBy: superAdmin.id,
                                updatedBy: superAdmin.id
                            });
                        } else if (retailer.reportingTo && retailer.reportingTo !== null) {
                            const reportingUser = await dbService.findOne(model.user, {
                                id: retailer.reportingTo,
                                companyId: user.companyId,
                                isActive: true
                            });

                            if (reportingUser.userRole === 3) {
                                // Scenario 2: Retailer reports to master distributor
                                const retailerSlab = masterDistributorComm?.find(
                                    (c) => c.roleType === 5 || c.roleName === 'RT'
                                );
                                const adminSlab = SuperAdminSlabComm?.find(
                                    (c) => c.roleType === 1 || c.roleName === 'AD'
                                );
                                const companySlab = companySlabComm?.find(
                                    (c) => c.roleType === 2 || c.roleName === 'WU'
                                );
                                const mdSlab = masterDistributorComm?.find(
                                    (c) => c.roleType === 3 || c.roleName === 'MD'
                                );

                                const retailerBaseAmount = Number(retailerSlab?.commAmt || 0);
                                const retailerSurchargeAmt = calcSlabAmount(retailerSlab, retailerBaseAmount);

                                const mdSurchargeAmt = calcSlabAmount(mdSlab, retailerSurchargeAmt);
                                const companySurchargeAmt = calcSlabAmount(companySlab, mdSurchargeAmt);
                                const adminSurchargeAmt = calcSlabAmount(adminSlab, mdSurchargeAmt);

                                if (retailerSurchargeAmt <= 0) {
                                    return res.failure({
                                        message: 'Invalid retailer surcharge configuration for payout'
                                    });
                                }

                                if (mdSurchargeAmt < 0 || adminSurchargeAmt < 0 || companySurchargeAmt < 0) {
                                    return res.failure({
                                        message: 'Invalid master distributor/admin/whitelabel surcharge configuration for payout'
                                    });
                                }

                                if (mdSurchargeAmt + adminSurchargeAmt + companySurchargeAmt > retailerSurchargeAmt) {
                                    return res.failure({
                                        message: 'Invalid surcharge configuration: total MD + admin + company income is greater than retailer debit for payout'
                                    });
                                }

                                const retailerOpeningBalance = parseFloat(retailerWallet.mainWallet || 0);
                                const mdOpeningBalance = parseFloat(masterDistributorWallet.mainWallet || 0);
                                const companyOpeningBalance = parseFloat(companyWallet.mainWallet || 0);
                                const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

                                const totalDebitFromRetailer = retailerSurchargeAmt;

                                if (retailerOpeningBalance < totalDebitFromRetailer) {
                                    return res.failure({
                                        message: `Insufficient wallet balance. Required: ${totalDebitFromRetailer}, Available: ${retailerOpeningBalance}`
                                    });
                                }

                                const retailerClosingBalance = parseFloat((retailerOpeningBalance - totalDebitFromRetailer).toFixed(2));
                                const mdClosingBalance = parseFloat((mdOpeningBalance + mdSurchargeAmt).toFixed(2));
                                const companyClosingBalance = parseFloat((companyOpeningBalance + companySurchargeAmt).toFixed(2));
                                const adminClosingBalance = parseFloat((adminOpeningBalance + adminSurchargeAmt).toFixed(2));

                                // Update wallets
                                await dbService.update(
                                    model.wallet,
                                    { id: retailerWallet.id },
                                    { mainWallet: retailerClosingBalance, updatedBy: retailer.id }
                                );

                                await dbService.update(
                                    model.wallet,
                                    { id: masterDistributorWallet.id },
                                    { mainWallet: mdClosingBalance, updatedBy: masterDistributor.id }
                                );

                                await dbService.update(
                                    model.wallet,
                                    { id: companyWallet.id },
                                    { mainWallet: companyClosingBalance, updatedBy: companyAdmin.id }
                                );

                                await dbService.update(
                                    model.wallet,
                                    { id: superAdminWallet.id },
                                    { mainWallet: adminClosingBalance, updatedBy: superAdmin.id }
                                );

                                // Wallet history records (similar pattern as above)
                                await dbService.createOne(model.walletHistory, {
                                    refId: retailer.id,
                                    companyId: user.companyId,
                                    walletType: walletType,
                                    operator: operatorName,
                                    remark: remarkText,
                                    amount: totalDebitFromRetailer,
                                    comm: 0,
                                    surcharge: totalDebitFromRetailer,
                                    openingAmt: retailerOpeningBalance,
                                    closingAmt: retailerClosingBalance,
                                    credit: 0,
                                    debit: totalDebitFromRetailer,
                                    transactionId: transactionID,
                                    paymentStatus: 'SUCCESS',
                                    beneficiaryName: customerBank.beneficiaryName || null,
                                    beneficiaryAccountNumber: customerBank.accountNumber,
                                    beneficiaryBankName: customerBank.bankName || null,
                                    beneficiaryIfsc: customerBank.ifsc,
                                    paymentMode: paymentMode,
                                    addedBy: retailer.id,
                                    updatedBy: retailer.id
                                });

                                await dbService.createOne(model.walletHistory, {
                                    refId: masterDistributor.id,
                                    companyId: user.companyId,
                                    walletType: 'mainWallet',
                                    operator: operatorName,
                                    remark: `${remarkText} - master distributor commission`,
                                    amount: mdSurchargeAmt,
                                    comm: mdSurchargeAmt,
                                    surcharge: 0,
                                    openingAmt: mdOpeningBalance,
                                    closingAmt: mdClosingBalance,
                                    credit: mdSurchargeAmt,
                                    debit: 0,
                                    transactionId: transactionID,
                                    paymentStatus: 'SUCCESS',
                                    beneficiaryName: masterDistributor.name || null,
                                    beneficiaryAccountNumber: null,
                                    beneficiaryBankName: null,
                                    beneficiaryIfsc: null,
                                    paymentMode: 'WALLET',
                                    addedBy: masterDistributor.id,
                                    updatedBy: masterDistributor.id
                                });

                                await dbService.createOne(model.walletHistory, {
                                    refId: companyAdmin.id,
                                    companyId: user.companyId,
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
                                    transactionId: transactionID,
                                    paymentStatus: 'SUCCESS',
                                    beneficiaryName: companyAdmin.name || null,
                                    beneficiaryAccountNumber: null,
                                    beneficiaryBankName: null,
                                    beneficiaryIfsc: null,
                                    paymentMode: 'WALLET',
                                    addedBy: companyAdmin.id,
                                    updatedBy: companyAdmin.id
                                });

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
                                    transactionId: transactionID,
                                    paymentStatus: 'SUCCESS',
                                    beneficiaryName: superAdmin.name || null,
                                    beneficiaryAccountNumber: null,
                                    beneficiaryBankName: null,
                                    beneficiaryIfsc: null,
                                    paymentMode: 'WALLET',
                                    addedBy: superAdmin.id,
                                    updatedBy: superAdmin.id
                                });
                            } else if (reportingUser.userRole === 4) {
                                // Retailer reports to distributor
                                if (distributor.reportingTo && distributor.reportingTo !== null && distributor.reportingTo !== companyAdmin.id) {
                                    // Check if masterDistributor was already fetched, if not fetch it
                                    if (!masterDistributor || masterDistributor.id !== distributor.reportingTo) {
                                        masterDistributor = await dbService.findOne(model.user, {
                                            id: distributor.reportingTo,
                                            companyId: user.companyId,
                                            isActive: true
                                        });
                                    }
                                    if (masterDistributor && masterDistributor.userRole === 3) {
                                        // Scenario 4: Retailer -> Distributor -> Master Distributor
                                    const retailerSlab = distributorComm?.find(
                                        (c) => c.roleType === 5 || c.roleName === 'RT'
                                    );
                                    const adminSlab = SuperAdminSlabComm?.find(
                                        (c) => c.roleType === 1 || c.roleName === 'AD'
                                    );
                                    const companySlab = companySlabComm?.find(
                                        (c) => c.roleType === 2 || c.roleName === 'WU'
                                    );
                                    const mdSlab = masterDistributorComm?.find(
                                        (c) => c.roleType === 3 || c.roleName === 'MD'
                                    );
                                    const distSlab = distributorComm?.find(
                                        (c) => c.roleType === 4 || c.roleName === 'DI'
                                    );

                                    const retailerBaseAmount = Number(retailerSlab?.commAmt || 0);
                                    const retailerSurchargeAmt = calcSlabAmount(retailerSlab, retailerBaseAmount);

                                    const distSurchargeAmt = calcSlabAmount(distSlab, retailerSurchargeAmt);
                                    const mdSurchargeAmt = calcSlabAmount(mdSlab, distSurchargeAmt);
                                    const companySurchargeAmt = calcSlabAmount(companySlab, mdSurchargeAmt);
                                    const adminSurchargeAmt = calcSlabAmount(adminSlab, mdSurchargeAmt);

                                    if (retailerSurchargeAmt <= 0) {
                                        return res.failure({
                                            message: 'Invalid retailer surcharge configuration for payout'
                                        });
                                    }

                                    if (distSurchargeAmt < 0 || mdSurchargeAmt < 0 || adminSurchargeAmt < 0 || companySurchargeAmt < 0) {
                                        return res.failure({
                                            message: 'Invalid distributor/master distributor/admin/whitelabel surcharge configuration for payout'
                                        });
                                    }

                                    if (distSurchargeAmt + mdSurchargeAmt + adminSurchargeAmt + companySurchargeAmt > retailerSurchargeAmt) {
                                        return res.failure({
                                            message: 'Invalid surcharge configuration: total distributor + MD + admin + company income is greater than retailer debit for payout'
                                        });
                                    }

                                    const retailerOpeningBalance = parseFloat(retailerWallet.mainWallet || 0);
                                    const distOpeningBalance = parseFloat(distributorWallet.mainWallet || 0);
                                    const mdOpeningBalance = parseFloat(masterDistributorWallet.mainWallet || 0);
                                    const companyOpeningBalance = parseFloat(companyWallet.mainWallet || 0);
                                    const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

                                    const totalDebitFromRetailer = retailerSurchargeAmt;

                                    if (retailerOpeningBalance < totalDebitFromRetailer) {
                                        return res.failure({
                                            message: `Insufficient wallet balance. Required: ${totalDebitFromRetailer}, Available: ${retailerOpeningBalance}`
                                        });
                                    }

                                    const retailerClosingBalance = parseFloat((retailerOpeningBalance - totalDebitFromRetailer).toFixed(2));
                                    const distClosingBalance = parseFloat((distOpeningBalance + distSurchargeAmt).toFixed(2));
                                    const mdClosingBalance = parseFloat((mdOpeningBalance + mdSurchargeAmt).toFixed(2));
                                    const companyClosingBalance = parseFloat((companyOpeningBalance + companySurchargeAmt).toFixed(2));
                                    const adminClosingBalance = parseFloat((adminOpeningBalance + adminSurchargeAmt).toFixed(2));

                                    // Update wallets and create wallet history (similar pattern)
                                    await Promise.all([
                                        dbService.update(model.wallet, { id: retailerWallet.id }, { mainWallet: retailerClosingBalance, updatedBy: retailer.id }),
                                        dbService.update(model.wallet, { id: distributorWallet.id }, { mainWallet: distClosingBalance, updatedBy: distributor.id }),
                                        dbService.update(model.wallet, { id: masterDistributorWallet.id }, { mainWallet: mdClosingBalance, updatedBy: masterDistributor.id }),
                                        dbService.update(model.wallet, { id: companyWallet.id }, { mainWallet: companyClosingBalance, updatedBy: companyAdmin.id }),
                                        dbService.update(model.wallet, { id: superAdminWallet.id }, { mainWallet: adminClosingBalance, updatedBy: superAdmin.id })
                                    ]);

                                    // Create wallet history records
                                    await Promise.all([
                                        dbService.createOne(model.walletHistory, {
                                            refId: retailer.id,
                                            companyId: user.companyId,
                                            walletType: walletType,
                                            operator: operatorName,
                                            remark: remarkText,
                                            amount: totalDebitFromRetailer,
                                            comm: 0,
                                            surcharge: totalDebitFromRetailer,
                                            openingAmt: retailerOpeningBalance,
                                            closingAmt: retailerClosingBalance,
                                            credit: 0,
                                            debit: totalDebitFromRetailer,
                                            transactionId: transactionID,
                                            paymentStatus: 'SUCCESS',
                                            beneficiaryName: customerBank.beneficiaryName || null,
                                            beneficiaryAccountNumber: customerBank.accountNumber,
                                            beneficiaryBankName: customerBank.bankName || null,
                                            beneficiaryIfsc: customerBank.ifsc,
                                            paymentMode: paymentMode,
                                            addedBy: retailer.id,
                                            updatedBy: retailer.id
                                        }),
                                        dbService.createOne(model.walletHistory, {
                                            refId: distributor.id,
                                            companyId: user.companyId,
                                            walletType: 'mainWallet',
                                            operator: operatorName,
                                            remark: `${remarkText} - distributor commission`,
                                            amount: distSurchargeAmt,
                                            comm: distSurchargeAmt,
                                            surcharge: 0,
                                            openingAmt: distOpeningBalance,
                                            closingAmt: distClosingBalance,
                                            credit: distSurchargeAmt,
                                            debit: 0,
                                            transactionId: transactionID,
                                            paymentStatus: 'SUCCESS',
                                            beneficiaryName: distributor.name || null,
                                            beneficiaryAccountNumber: null,
                                            beneficiaryBankName: null,
                                            beneficiaryIfsc: null,
                                            paymentMode: 'WALLET',
                                            addedBy: distributor.id,
                                            updatedBy: distributor.id
                                        }),
                                        dbService.createOne(model.walletHistory, {
                                            refId: masterDistributor.id,
                                            companyId: user.companyId,
                                            walletType: 'mainWallet',
                                            operator: operatorName,
                                            remark: `${remarkText} - master distributor commission`,
                                            amount: mdSurchargeAmt,
                                            comm: mdSurchargeAmt,
                                            surcharge: 0,
                                            openingAmt: mdOpeningBalance,
                                            closingAmt: mdClosingBalance,
                                            credit: mdSurchargeAmt,
                                            debit: 0,
                                            transactionId: transactionID,
                                            paymentStatus: 'SUCCESS',
                                            beneficiaryName: masterDistributor.name || null,
                                            beneficiaryAccountNumber: null,
                                            beneficiaryBankName: null,
                                            beneficiaryIfsc: null,
                                            paymentMode: 'WALLET',
                                            addedBy: masterDistributor.id,
                                            updatedBy: masterDistributor.id
                                        }),
                                        dbService.createOne(model.walletHistory, {
                                            refId: companyAdmin.id,
                                            companyId: user.companyId,
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
                                            transactionId: transactionID,
                                            paymentStatus: 'SUCCESS',
                                            beneficiaryName: companyAdmin.name || null,
                                            beneficiaryAccountNumber: null,
                                            beneficiaryBankName: null,
                                            beneficiaryIfsc: null,
                                            paymentMode: 'WALLET',
                                            addedBy: companyAdmin.id,
                                            updatedBy: companyAdmin.id
                                        }),
                                        dbService.createOne(model.walletHistory, {
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
                                            transactionId: transactionID,
                                            paymentStatus: 'SUCCESS',
                                            beneficiaryName: superAdmin.name || null,
                                            beneficiaryAccountNumber: null,
                                            beneficiaryBankName: null,
                                            beneficiaryIfsc: null,
                                            paymentMode: 'WALLET',
                                            addedBy: superAdmin.id,
                                            updatedBy: superAdmin.id
                                        })
                                    ]);
                                } else {
                                    // Scenario 3: Retailer reports to distributor (distributor reports to company admin)
                                    const retailerSlab = distributorComm?.find(
                                        (c) => c.roleType === 5 || c.roleName === 'RT'
                                    );
                                    const adminSlab = SuperAdminSlabComm?.find(
                                        (c) => c.roleType === 1 || c.roleName === 'AD'
                                    );
                                    const companySlab = companySlabComm?.find(
                                        (c) => c.roleType === 2 || c.roleName === 'WU'
                                    );
                                    const distSlab = distributorComm?.find(
                                        (c) => c.roleType === 4 || c.roleName === 'DI'
                                    );

                                    const retailerBaseAmount = Number(retailerSlab?.commAmt || 0);
                                    const retailerSurchargeAmt = calcSlabAmount(retailerSlab, retailerBaseAmount);

                                    const distSurchargeAmt = calcSlabAmount(distSlab, retailerSurchargeAmt);
                                    const companySurchargeAmt = calcSlabAmount(companySlab, distSurchargeAmt);
                                    const adminSurchargeAmt = calcSlabAmount(adminSlab, distSurchargeAmt);

                                    if (retailerSurchargeAmt <= 0) {
                                        return res.failure({
                                            message: 'Invalid retailer surcharge configuration for payout'
                                        });
                                    }

                                    if (distSurchargeAmt < 0 || adminSurchargeAmt < 0 || companySurchargeAmt < 0) {
                                        return res.failure({
                                            message: 'Invalid distributor/admin/whitelabel surcharge configuration for payout'
                                        });
                                    }

                                    if (distSurchargeAmt + adminSurchargeAmt + companySurchargeAmt > retailerSurchargeAmt) {
                                        return res.failure({
                                            message: 'Invalid surcharge configuration: total distributor + admin + company income is greater than retailer debit for payout'
                                        });
                                    }

                                    const retailerOpeningBalance = parseFloat(retailerWallet.mainWallet || 0);
                                    const distOpeningBalance = parseFloat(distributorWallet.mainWallet || 0);
                                    const companyOpeningBalance = parseFloat(companyWallet.mainWallet || 0);
                                    const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

                                    const totalDebitFromRetailer = retailerSurchargeAmt;

                                    if (retailerOpeningBalance < totalDebitFromRetailer) {
                                        return res.failure({
                                            message: `Insufficient wallet balance. Required: ${totalDebitFromRetailer}, Available: ${retailerOpeningBalance}`
                                        });
                                    }

                                    const retailerClosingBalance = parseFloat((retailerOpeningBalance - totalDebitFromRetailer).toFixed(2));
                                    const distClosingBalance = parseFloat((distOpeningBalance + distSurchargeAmt).toFixed(2));
                                    const companyClosingBalance = parseFloat((companyOpeningBalance + companySurchargeAmt).toFixed(2));
                                    const adminClosingBalance = parseFloat((adminOpeningBalance + adminSurchargeAmt).toFixed(2));

                                    // Update wallets and create wallet history (similar pattern)
                                    await Promise.all([
                                        dbService.update(model.wallet, { id: retailerWallet.id }, { mainWallet: retailerClosingBalance, updatedBy: retailer.id }),
                                        dbService.update(model.wallet, { id: distributorWallet.id }, { mainWallet: distClosingBalance, updatedBy: distributor.id }),
                                        dbService.update(model.wallet, { id: companyWallet.id }, { mainWallet: companyClosingBalance, updatedBy: companyAdmin.id }),
                                        dbService.update(model.wallet, { id: superAdminWallet.id }, { mainWallet: adminClosingBalance, updatedBy: superAdmin.id })
                                    ]);

                                    // Create wallet history records
                                    await Promise.all([
                                        dbService.createOne(model.walletHistory, {
                                            refId: retailer.id,
                                            companyId: user.companyId,
                                            walletType: walletType,
                                            operator: operatorName,
                                            remark: remarkText,
                                            amount: totalDebitFromRetailer,
                                            comm: 0,
                                            surcharge: totalDebitFromRetailer,
                                            openingAmt: retailerOpeningBalance,
                                            closingAmt: retailerClosingBalance,
                                            credit: 0,
                                            debit: totalDebitFromRetailer,
                                            transactionId: transactionID,
                                            paymentStatus: 'SUCCESS',
                                            beneficiaryName: customerBank.beneficiaryName || null,
                                            beneficiaryAccountNumber: customerBank.accountNumber,
                                            beneficiaryBankName: customerBank.bankName || null,
                                            beneficiaryIfsc: customerBank.ifsc,
                                            paymentMode: paymentMode,
                                            addedBy: retailer.id,
                                            updatedBy: retailer.id
                                        }),
                                        dbService.createOne(model.walletHistory, {
                                            refId: distributor.id,
                                            companyId: user.companyId,
                                            walletType: 'mainWallet',
                                            operator: operatorName,
                                            remark: `${remarkText} - distributor commission`,
                                            amount: distSurchargeAmt,
                                            comm: distSurchargeAmt,
                                            surcharge: 0,
                                            openingAmt: distOpeningBalance,
                                            closingAmt: distClosingBalance,
                                            credit: distSurchargeAmt,
                                            debit: 0,
                                            transactionId: transactionID,
                                            paymentStatus: 'SUCCESS',
                                            beneficiaryName: distributor.name || null,
                                            beneficiaryAccountNumber: null,
                                            beneficiaryBankName: null,
                                            beneficiaryIfsc: null,
                                            paymentMode: 'WALLET',
                                            addedBy: distributor.id,
                                            updatedBy: distributor.id
                                        }),
                                        dbService.createOne(model.walletHistory, {
                                            refId: companyAdmin.id,
                                            companyId: user.companyId,
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
                                            transactionId: transactionID,
                                            paymentStatus: 'SUCCESS',
                                            beneficiaryName: companyAdmin.name || null,
                                            beneficiaryAccountNumber: null,
                                            beneficiaryBankName: null,
                                            beneficiaryIfsc: null,
                                            paymentMode: 'WALLET',
                                            addedBy: companyAdmin.id,
                                            updatedBy: companyAdmin.id
                                        }),
                                        dbService.createOne(model.walletHistory, {
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
                                            transactionId: transactionID,
                                            paymentStatus: 'SUCCESS',
                                            beneficiaryName: superAdmin.name || null,
                                            beneficiaryAccountNumber: null,
                                            beneficiaryBankName: null,
                                            beneficiaryIfsc: null,
                                            paymentMode: 'WALLET',
                                            addedBy: superAdmin.id,
                                            updatedBy: superAdmin.id
                                        })
                                    ]);
                                }
                            }
                        }
                    }
                }
            }
            }
        }
        
        // Create payout history record
        const payoutHistory = await dbService.createOne(model.payoutHistory, payoutHistoryData);
        
        // Update wallet balance only if payout is successful
        if (payoutHistoryData.status === 'SUCCESS') {
            if (mode === 'wallet') {
                // Internal transfer: Debit from selected AEPS wallet, Credit to mainWallet
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
                
                // Parallel execution: Update wallet and create history records
                await Promise.all([
                    dbService.update(model.wallet, { refId: user.id, companyId: user.companyId }, walletUpdate),
                    dbService.createOne(model.walletHistory, walletHistories[0]),
                    dbService.createOne(model.walletHistory, walletHistories[1])
                ]);
                
            } else {
                // External bank transfer: Only debit from selected AEPS wallet
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
        
        // Prepare response data (without payoutHistory object)
        const responseData = {
            transactionID: transactionID,
            status: payoutHistoryData?.status || aslResponse?.status,
            orderId: aslResponse?.orderid,
            bankref: aslResponse?.bankref || aslResponse?.txid,
            aepsType: normalizedAepsType,
            remark: aslResponse?.remark,
            [normalizedAepsType.toLowerCase()]: {
                openingBalance: aepsOpeningBalance,
                closingBalance: aepsClosingBalance
            }
        }; 
                
        // Update payoutHistory with apiResponse if available
        if (responseData) {
            const updateCondition = payoutHistory?.id 
                ? { id: payoutHistory.id } 
                : { transactionID: transactionID };
            
            await dbService.update(
                model.payoutHistory,
                updateCondition,
                { apiResponse: responseData, updatedBy: user.id }
            );
        }
        
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
        const successMessage = mode === 'wallet' 
            ? `Payout from ${normalizedAepsType} wallet to Main wallet successful`
            : `Payout request processed from ${normalizedAepsType}`;
        
        return res.success({
            message: successMessage,
            data: responseData
        });
    } catch (error) {
        console.error('Payout error:', error);
        return res.failure({ message: error?.message || 'Internal server error' });
    }
}


const getPayoutBankList = async (req, res) => {
    try {
        if (![3, 4, 5].includes(req.user.userRole)) {
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

module.exports = { payout, getPayoutBankList };
