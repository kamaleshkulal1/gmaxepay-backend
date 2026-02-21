const asl = require('../../../services/asl');
const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const aepsDailyLoginService = require('../../../services/aepsDailyLoginService');
const { generateTransactionID } = require('../../../utils/transactionID');
const googleMap = require('../../../services/googleMap');
const imageService = require('../../../services/imageService');
const { Op } = require('sequelize');

const aepsTransaction = async (req, res) => {
    try {
        const {
            amount,
            txnType,
            captureType,
            biometricData,
            bankiin,
            latitude,
            longitude,
            ipAddress,
            aadharNumber,
            consumerNumber
        } = req.body || {};

        const round2 = (num) => {
            const n = Number(num);
            if (!Number.isFinite(n)) return 0;
            return Math.round((n + Number.EPSILON) * 100) / 100;
        };

        const normalizeTxnType = (value) => (value ? String(value).trim().toUpperCase() : null);
        const normalizeCaptureType = (value) => {
            const t = value ? String(value).trim().toUpperCase() : null;
            if (t === 'FINGURE') return 'FINGER';
            return t;
        };

        const normalizedTxnType = normalizeTxnType(txnType);
        const normalizedCaptureType = normalizeCaptureType(captureType);
        const normalizedBankiin = bankiin ? String(bankiin).trim() : null;
        if (!biometricData) {
            return res.failure({ message: 'Biometric data is required' });
        }
        if (!normalizedCaptureType || !['FACE', 'FINGER'].includes(normalizedCaptureType)) {
            return res.failure({ message: 'Invalid capture type. Allowed values are FACE or FINGER' });
        }
        if (!normalizedTxnType || !['CW', 'BE', 'MS'].includes(normalizedTxnType)) {
            return res.failure({ message: 'Invalid transaction type. Allowed values are CW, BE or MS' });
        }
        if (!normalizedBankiin) {
            return res.failure({ message: 'bankiin is required' });
        }

        // Validate bankIIN exists in aslBankList
        const bankDetails = await dbService.findOne(model.aslBankList, {
            bankIIN: normalizedBankiin,
            isDeleted: false,
            isActive: true
        });
        if (!bankDetails) {
            return res.failure({ message: 'Bank Name not found' });
        }

        if (!ipAddress) {
            return res.failure({ message: 'ipAddress is required' });
        }
        if (!aadharNumber) {
            return res.failure({ message: 'aadharNumber is required' });
        }
        if (!consumerNumber) {
            return res.failure({ message: 'consumerNumber is required' });
        }
        if (!latitude || !longitude) {
            return res.failure({ message: 'latitude and longitude are required' });
        }

        const amountNumber = round2(amount || 0);
        if (normalizedTxnType === 'CW' && (!amountNumber || amountNumber < 100)) {
            return res.failure({ message: 'Minimum amount for CW transaction is 100' });
        }

        // Ensure daily 2FA is completed for today (IST date)
        await aepsDailyLoginService.logoutPreviousDaySessions(req.user.id, req.user.companyId);
        const todayDateStr = aepsDailyLoginService.getIndianDateOnly();
        const existingDaily2FA = await dbService.findOne(model.aepsDailyLogin, {
            refId: req.user.id,
            companyId: req.user.companyId,
            loginDate: todayDateStr
        });
        if (!existingDaily2FA) {
            return res.failure({ message: 'AEPS daily 2FA authentication is required before transaction' });
        }

        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        if (!existingUser.latitude || !existingUser.longitude) {
            return res.failure({ message: 'User latitude/longitude is required' });
        }

        const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
            userId: req.user.id,
            companyId: req.user.companyId,
            merchantStatus: true
        });
        if (!existingAepsOnboarding) {
            return res.failure({ message: 'AEPS onboarding not completed' });
        }
        if (!existingAepsOnboarding.merchantLoginId) {
            return res.failure({ message: 'AEPS merchantLoginId not found' });
        }
        if (!existingAepsOnboarding.isOtpValidated) {
            return res.failure({ message: 'AEPS eKYC OTP validation is required before transaction' });
        }
        if (!existingAepsOnboarding.isBioMetricValidated) {
            return res.failure({ message: 'AEPS eKYC biometric validation is required before transaction' });
        }
        if (!existingAepsOnboarding.isBankKycOtpValidated) {
            return res.failure({ message: 'Bank eKYC OTP validation is required before transaction' });
        }
        if (!existingAepsOnboarding.isBankKycBiometricValidated) {
            return res.failure({ message: 'Bank eKYC biometric validation is required before transaction' });
        }

        const existingBioMetric = await dbService.findOne(model.bioMetric, {
            refId: req.user.id,
            companyId: req.user.companyId,
            captureType: normalizedCaptureType
        });
        if (!existingBioMetric) {
            return res.failure({ message: 'Biometric data is required' });
        }

        const existingCompany = await dbService.findOne(model.company, { id: req.user.companyId });

        const generatedTxnId = generateTransactionID(existingCompany?.companyName);

        // ── Fetch AEPS operator based on txnType ──────────────────────────────
        // CW: uses AEPS1 operator (matched by amount range)
        // MS: uses AEPS_MS operator (no amount range needed)
        // BE: no operator required — no commission is calculated for BE
        let operator = null;
        let operatorType = null;

        if (normalizedTxnType === 'CW') {
            operator = await dbService.findOne(model.operator, {
                operatorType: 'AEPS1',
                minValue: { [Op.lte]: amountNumber },
                maxValue: { [Op.gte]: amountNumber }
            });
            operatorType = operator?.operatorType || 'AEPS1';
        } else if (normalizedTxnType === 'MS') {
            operator = await dbService.findOne(model.operator, {
                operatorType: 'AEPS_MS',
                isActive: true
            });
            operatorType = operator?.operatorType || 'AEPS_MS';
        }
        // BE: operator stays null, no commission

        // ── Slab-based Commission (same logic as rechargeController) ──────────────
        const round4 = (num) => {
            const n = Number(num);
            return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 10000) / 10000 : 0;
        };

        const calcSlabAmount = (slab, baseAmount) => {
            if (!slab) return 0;
            const base = Number(baseAmount || 0);
            const rawComm = Number(slab.commAmt || 0);
            if (!Number.isFinite(base) || !Number.isFinite(rawComm)) return 0;
            const amtType = (slab.amtType || 'fix').toLowerCase();
            if (amtType === 'per') return round4((base * rawComm) / 100);
            return round4(rawComm);
        };

        const commData = {
            users: {},
            wallets: {},
            slabs: {},
            amounts: {
                retailerComm: 0,
                distComm: 0,
                mdComm: 0,
                companyComm: 0,
                superAdminComm: 0,
                wlShortfall: 0,
                mdShortfall: 0,
                distShortfall: 0,
                saShortfall: 0
            },
            scenario: ''
        };

        const user = req.user;

        // Commission is only applicable for CW and MS, NOT for BE
        if (['CW', 'MS'].includes(normalizedTxnType) && operator && [4, 5].includes(user.userRole)) {
            // A. Fetch Company Admin and Super Admin
            const [companyAdmin, superAdmin] = await Promise.all([
                dbService.findOne(model.user, { companyId: user.companyId, userRole: 2, isActive: true }),
                dbService.findOne(model.user, { id: 1, companyId: 1, userRole: 1, isActive: true })
            ]);

            if (companyAdmin && superAdmin) {
                commData.users.companyAdmin = companyAdmin;
                commData.users.superAdmin = superAdmin;

                // B. Fetch Common Wallets
                const [companyWallet, superAdminWallet] = await Promise.all([
                    dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                    dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 })
                ]);
                commData.wallets.companyWallet = companyWallet;
                commData.wallets.superAdminWallet = superAdminWallet;

                if (user.userRole === 4) {
                    // Distributor
                    const distributor = await dbService.findOne(model.user, { id: user.id, companyId: user.companyId, isActive: true });
                    commData.users.distributor = distributor;
                    // Distributor's wallet is the AEPS wallet
                    commData.wallets.distributorWallet = await model.wallet.findOne({ where: { refId: user.id, companyId: user.companyId } });

                    if (distributor.reportingTo === companyAdmin.id || distributor.reportingTo === null) {
                        commData.scenario = 'DIST_DIRECT';
                        const [SuperAdminSlabComm, companySlabComm] = await Promise.all([
                            dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                        ]);
                        commData.slabs.saSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'AD'));
                        commData.slabs.wlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
                        commData.slabs.distSlab = companySlabComm?.find(c => (c.roleType === 4 || c.roleName === 'DI'));
                    } else {
                        commData.scenario = 'DIST_MD';
                        const masterDistributor = await dbService.findOne(model.user, { id: distributor.reportingTo, companyId: user.companyId, isActive: true });
                        if (masterDistributor) {
                            commData.users.masterDistributor = masterDistributor;
                            commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: user.companyId });

                            const [SuperAdminSlabComm, companySlabComm, mdSlabComm] = await Promise.all([
                                dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: masterDistributor.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                            ]);
                            commData.slabs.saSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'AD'));
                            commData.slabs.wlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
                            commData.slabs.mdSlab = companySlabComm?.find(c => c.roleType === 3);
                            commData.slabs.distSlab = mdSlabComm?.find(c => c.roleType === 4);
                        }
                    }

                } else if (user.userRole === 5) {
                    // Retailer
                    const retailer = await dbService.findOne(model.user, { id: user.id, companyId: user.companyId, isActive: true });
                    commData.users.retailer = retailer;
                    commData.wallets.retailerWallet = await model.wallet.findOne({ where: { refId: user.id, companyId: user.companyId } });

                    let reportingUser = null;
                    if (retailer.reportingTo && retailer.reportingTo !== companyAdmin.id) {
                        reportingUser = await dbService.findOne(model.user, { id: retailer.reportingTo, companyId: user.companyId, isActive: true });
                    }

                    if (!reportingUser || retailer.reportingTo === companyAdmin.id || retailer.reportingTo === null) {
                        commData.scenario = 'RET_DIRECT';
                        const [SuperAdminSlabComm, companySlabComm] = await Promise.all([
                            dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                        ]);
                        commData.slabs.saSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'AD'));
                        commData.slabs.wlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
                        commData.slabs.retSlab = companySlabComm?.find(c => c.roleType === 5);

                    } else if (reportingUser.userRole === 3) {
                        commData.scenario = 'RET_MD';
                        commData.users.masterDistributor = reportingUser;
                        commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: reportingUser.id, companyId: user.companyId });

                        const [SuperAdminSlabComm, companySlabComm, masterDistributorComm] = await Promise.all([
                            dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: reportingUser.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                        ]);
                        commData.slabs.saSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'AD'));
                        commData.slabs.wlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
                        commData.slabs.mdSlab = companySlabComm?.find(c => c.roleType === 3);
                        commData.slabs.retSlab = masterDistributorComm?.find(c => c.roleType === 5);

                    } else if (reportingUser.userRole === 4) {
                        commData.users.distributor = reportingUser;
                        commData.wallets.distributorWallet = await dbService.findOne(model.wallet, { refId: reportingUser.id, companyId: user.companyId });

                        if (reportingUser.reportingTo === companyAdmin.id || reportingUser.reportingTo === null) {
                            commData.scenario = 'RET_DIST_CO';
                            const [SuperAdminSlabComm, companySlabComm, distSlabComm] = await Promise.all([
                                dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: reportingUser.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                            ]);
                            commData.slabs.saSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'AD'));
                            commData.slabs.wlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
                            commData.slabs.distSlab = companySlabComm?.find(c => c.roleType === 4);
                            commData.slabs.retSlab = distSlabComm?.find(c => c.roleType === 5);

                        } else {
                            commData.scenario = 'RET_DIST_MD';
                            const masterDistributor = await dbService.findOne(model.user, { id: reportingUser.reportingTo, companyId: user.companyId, isActive: true });
                            if (masterDistributor) {
                                commData.users.masterDistributor = masterDistributor;
                                commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: user.companyId });

                                const [SuperAdminSlabComm, companySlabComm, mdSlabComm, distSlabComm] = await Promise.all([
                                    dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                    dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                    dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: masterDistributor.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                    dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: reportingUser.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                                ]);
                                commData.slabs.saSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'AD'));
                                commData.slabs.wlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
                                commData.slabs.mdSlab = companySlabComm?.find(c => c.roleType === 3);
                                commData.slabs.distSlab = mdSlabComm?.find(c => c.roleType === 4);
                                commData.slabs.retSlab = distSlabComm?.find(c => c.roleType === 5);
                            }
                        }
                    }
                }

                // D. Calculate Amounts
                const operatorCommissionAmount = operator?.comm ? calcSlabAmount({ amtType: operator.amtType, commAmt: operator.comm }, amountNumber) : 0;
                const saSlabAmount = commData.slabs.saSlab ? calcSlabAmount(commData.slabs.saSlab, amountNumber) : 0;
                const wlSlabAmount = commData.slabs.wlSlab ? calcSlabAmount(commData.slabs.wlSlab, amountNumber) : 0;
                const mdSlabAmount = commData.slabs.mdSlab ? calcSlabAmount(commData.slabs.mdSlab, amountNumber) : 0;
                const distSlabAmount = commData.slabs.distSlab ? calcSlabAmount(commData.slabs.distSlab, amountNumber) : 0;
                const retSlabAmount = commData.slabs.retSlab ? calcSlabAmount(commData.slabs.retSlab, amountNumber) : 0;

                let companyCost = 0;
                if (commData.users.masterDistributor) companyCost = mdSlabAmount;
                else if (commData.users.distributor) companyCost = distSlabAmount;
                else companyCost = retSlabAmount;

                // Super Admin
                commData.amounts.superAdminComm = Math.max(0, round4(operatorCommissionAmount - wlSlabAmount));
                commData.amounts.saShortfall = wlSlabAmount > operatorCommissionAmount
                    ? parseFloat((wlSlabAmount - operatorCommissionAmount).toFixed(4)) : 0;

                // Company (WL)
                commData.amounts.companyComm = Math.max(0, round4(wlSlabAmount - companyCost));
                if (companyCost > wlSlabAmount) {
                    commData.amounts.wlShortfall = parseFloat((companyCost - wlSlabAmount).toFixed(4));
                }

                // Master Distributor
                if (commData.users.masterDistributor) {
                    const mdCost = commData.users.distributor ? distSlabAmount : retSlabAmount;
                    commData.amounts.mdComm = Math.max(0, round4(mdSlabAmount - mdCost));
                    if (mdCost > mdSlabAmount) {
                        commData.amounts.mdShortfall = parseFloat((mdCost - mdSlabAmount).toFixed(4));
                    }
                }

                // Distributor
                if (commData.users.distributor) {
                    commData.amounts.distComm = Math.max(0, round4(distSlabAmount - retSlabAmount));
                    if (retSlabAmount > distSlabAmount) {
                        commData.amounts.distShortfall = parseFloat((retSlabAmount - distSlabAmount).toFixed(4));
                    }
                }

                // Retailer
                commData.amounts.retailerComm = retSlabAmount;

                // ── TDS: 2% of each party's GROSS incoming commission ─────────────
                const TDS_RATE = Number(process.env.AEPS_TDS_PERCENT || 2) / 100;
                const tds2 = (gross) => round4(gross * TDS_RATE);

                commData.tds = {
                    superAdminTDS: tds2(operatorCommissionAmount),   // SA receives from operator
                    whitelabelTDS: tds2(wlSlabAmount),               // WL receives from SA
                    masterDistributorTDS: tds2(mdSlabAmount),               // MD receives from WL
                    distributorTDS: tds2(distSlabAmount),             // Dist receives from MD/WL
                    retailerTDS: tds2(retSlabAmount)               // Retailer receives from Dist/MD/WL
                };

                // ── Avail flags: which parties exist in this commission chain ─────
                commData.avail = {
                    superAdminAvail: Boolean(commData.users.superAdmin),
                    whitelabelAvail: Boolean(commData.users.companyAdmin),
                    masterDistributorAvail: Boolean(commData.users.masterDistributor),
                    distributorAvail: Boolean(commData.users.distributor),
                    retailerAvail: Boolean(commData.users.retailer)
                };

                console.log('[AEPS] Scenario:', commData.scenario);
                console.log('[AEPS] Final Distribution Amounts:', JSON.stringify(commData.amounts, null, 2));
                console.log('[AEPS] TDS:', JSON.stringify(commData.tds, null, 2));
                console.log('[AEPS] Avail:', JSON.stringify(commData.avail, null, 2));
            }
        }

        // Transaction metadata we want to persist for reporting/audit
        const consumerAadhaarNumber = aadharNumber ? String(aadharNumber) : null;
        const resolvedIpAddress = ipAddress ? String(ipAddress) : (req.ip ? String(req.ip) : null);
        const txLatitude = latitude ?? existingUser.latitude;
        const txLongitude = longitude ?? existingUser.longitude;

        const payload = {
            uniqueID: existingAepsOnboarding.uniqueID,
            aadhaarNo: aadharNumber,
            txnType: normalizedTxnType,
            merchantLoginId: existingAepsOnboarding.merchantLoginId,
            bankiin: normalizedBankiin,
            mobile: consumerNumber,
            amount: normalizedTxnType === 'CW' ? amountNumber : undefined, // MS and BE don't send amount
            latitude: txLatitude,
            longitude: txLongitude,
            transactionId: generatedTxnId,
            captureType: normalizedCaptureType,
            biometricData: biometricData
        };
        console.log('payload', payload);

        // ── MOCK API RESPONSE (ASL API call commented out for testing) ─────────
        // const aepsResponse = await asl.aslAepsTransaction(payload);
        let aepsResponse;
        if (normalizedTxnType === 'CW') {
            aepsResponse = {
                status: 'SUCCESS',
                data: {
                    terminalId: 'FA012123',
                    requestTransactionTime: '01/01/2018 23:59:59',
                    transactionAmount: amountNumber,
                    transactionStatus: 'successful',
                    balanceAmount: 200,
                    bankRRN: '765765656857',
                    transactionType: 'CW',
                    FingpayTransactionId: 'CW00010291117175529',
                    merchantTxnId: generatedTxnId,
                    responseCode: '00'
                },
                message: 'successful'
            };
        } else if (normalizedTxnType === 'BE') {
            aepsResponse = {
                status: 'SUCCESS',
                data: {
                    terminalId: 'FA274530',
                    requestTransactionTime: '01/05/2020 00:04:32',
                    transactionAmount: 590.0,
                    transactionStatus: 'successful',
                    balanceAmount: 1500.0,
                    bankRRN: '012200836920',
                    transactionType: 'BE',
                    fpTransactionId: 'BEBD0491833010520000431984I',
                    merchantTxnId: generatedTxnId,
                    errorCode: null,
                    errorMessage: null,
                    merchantTransactionId: null,
                    responseCode: '00'
                },
                message: 'successful'
            };
        } else if (normalizedTxnType === 'MS') {
            aepsResponse = {
                status: 'SUCCESS',
                data: {
                    terminalId: 'FA049053',
                    requestTransactionTime: '03/01/2020 16:56:53',
                    transactionStatus: 'successful',
                    balanceAmount: 995.88,
                    bankRRN: '000316273914',
                    transactionType: 'MS',
                    fpTransactionId: '000316273914',
                    merchantTxnId: generatedTxnId,
                    errorCode: null,
                    errorMessage: null,
                    miniStatementStructureModel: [
                        { date: '31/12/2019', txnType: 'Cr', amount: ' 1.00', narration: ' INF/INFT/021841' },
                        { date: '31/12/2019', txnType: 'Cr', amount: ' 1.00', narration: ' INF/INFT/021841' }
                    ],
                    responseCode: '00'
                },
                message: 'successful'
            };
        }
        const safeJsonStringify = (value) => {
            try {
                const seen = new WeakSet();
                return JSON.stringify(
                    value,
                    (key, val) => {
                        if (typeof val === 'bigint') return val.toString();
                        if (val instanceof Error) {
                            return { name: val.name, message: val.message, stack: val.stack };
                        }
                        if (typeof val === 'function') {
                            return `[Function ${val.name || 'anonymous'}]`;
                        }
                        if (val && typeof val === 'object') {
                            if (seen.has(val)) return '[Circular]';
                            seen.add(val);
                        }
                        return val;
                    },
                    2
                );
            } catch (e) {
                return String(value);
            }
        };
        // Log response as JSON (prefer response.data if this is an axios response)
        console.log('aepsResponse', safeJsonStringify(aepsResponse?.data ?? aepsResponse));

        // Normalize response (sometimes comes as JSON string)
        let parsedResponse = aepsResponse;
        if (typeof aepsResponse === 'string') {
            try {
                parsedResponse = JSON.parse(aepsResponse);
            } catch (e) {
                const jsonMatch = aepsResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        parsedResponse = JSON.parse(jsonMatch[0]);
                    } catch (parseError) {
                        parsedResponse = { status: 'ERROR', message: aepsResponse };
                    }
                } else {
                    parsedResponse = { status: 'ERROR', message: aepsResponse };
                }
            }
        }

        const topStatus = parsedResponse?.status ? String(parsedResponse.status).toUpperCase() : null;
        const innerData =
            parsedResponse && typeof parsedResponse === 'object' && parsedResponse.data && typeof parsedResponse.data === 'object'
                ? parsedResponse.data
                : null;
        const transactionStatusRaw =
            innerData?.transactionStatus ??
            innerData?.status ??
            parsedResponse?.transactionStatus ??
            parsedResponse?.status;
        const transactionStatus = transactionStatusRaw ? String(transactionStatusRaw).toUpperCase() : null;
        const responseCode = innerData?.responseCode ?? parsedResponse?.responseCode;

        const isSuccess =
            responseCode === '00' ||
            transactionStatus === 'SUCCESS' ||
            transactionStatus === 'SUCCESSFUL' ||
            topStatus === 'SUCCESS';

        const isPending =
            !isSuccess &&
            (
                transactionStatus === 'PENDING' ||
                transactionStatus === 'PROCESSING' ||
                transactionStatus === 'INPROGRESS' ||
                transactionStatus === 'IN_PROGRESS' ||
                transactionStatus === 'INITIATED' ||
                transactionStatus === 'SUBMITTED'
            );

        const paymentStatus = isSuccess ? 'SUCCESS' : (isPending ? 'PENDING' : 'FAILED');

        // If gateway returns contradictory wrapper status (e.g. status="ERROR" but responseCode="00"),
        // normalize it so API consumers don't see ERROR inside a successful response.
        const normalizedGatewayResponse =
            parsedResponse && typeof parsedResponse === 'object' && Object.prototype.hasOwnProperty.call(parsedResponse, 'status')
                ? { ...parsedResponse, status: isSuccess ? 'SUCCESS' : (topStatus || 'ERROR') }
                : parsedResponse;

        // Only set merchantTransactionId for SUCCESS transactions
        // For FAILED/PENDING, it should be null
        const merchantTransactionId = isSuccess
            ? (innerData?.merchantTxnId ||
                innerData?.merchantTransactionId ||
                normalizedGatewayResponse?.merchantTxnId ||
                normalizedGatewayResponse?.merchantTransactionId ||
                payload.transactionId)
            : null;
        const transactionType = isSuccess
            ? (innerData?.transactionType ||
                normalizedGatewayResponse?.transactionType)
            : null;

        // Prepare request payload for persistence (mask biometric)
        const safeRequest = {
            ...payload,
            biometricData: undefined,
            biometricDataPresent: Boolean(payload.biometricData),
            ipAddress: resolvedIpAddress,
            consumerAadhaarNumber,
            consumerNumber
        };

        // Resolve complete address from latitude/longitude (best-effort: do not fail transaction if Google fails)
        let transactionCompleteAddress = null;
        try {
            if (txLatitude !== undefined && txLatitude !== null && txLongitude !== undefined && txLongitude !== null) {
                const geo = await googleMap.reverseGeocode(txLatitude, txLongitude);
                transactionCompleteAddress =
                    geo?.complete_address ||
                    geo?.address ||
                    geo?.formatted_address ||
                    null;
            }
        } catch (geoErr) {
            transactionCompleteAddress = null;
        }

        // ── Per-party AEPS wallet updates & history (SUCCESS or PENDING only) ─────
        // Initiating user's AEPS wallet snapshot (used for history even on FAILURE)
        let wallet = await model.wallet.findOne({ where: { refId: req.user.id, companyId: req.user.companyId } });
        if (!wallet) {
            wallet = await model.wallet.create({
                refId: req.user.id,
                companyId: req.user.companyId,
                roleType: req.user.userType,
                mainWallet: 0,
                apes1Wallet: 0,
                apes2Wallet: 0,
                addedBy: req.user.id,
                updatedBy: req.user.id
            });
        }
        const openingAepsWallet = round2(wallet.apes1Wallet || 0);

        // Slab commission references — GROSS amounts (for reporting)
        const retailerCommAmt = commData.amounts.retailerComm || 0;
        const distCommAmt = commData.amounts.distComm || 0;
        const mdCommAmt = commData.amounts.mdComm || 0;
        const companyCommAmt = commData.amounts.companyComm || 0;
        const superAdminCommAmt = commData.amounts.superAdminComm || 0;
        const distShortfallAmt = commData.amounts.distShortfall || 0;
        const mdShortfallAmt = commData.amounts.mdShortfall || 0;
        const wlShortfallAmt = commData.amounts.wlShortfall || 0;
        const saShortfallAmt = commData.amounts.saShortfall || 0;

        // TDS amounts (2% of each party's gross incoming commission)
        const retailerTDS = commData.tds?.retailerTDS || 0;
        const distributorTDS = commData.tds?.distributorTDS || 0;
        const masterDistTDS = commData.tds?.masterDistributorTDS || 0;
        const whitelabelTDS = commData.tds?.whitelabelTDS || 0;
        const superAdminTDS = commData.tds?.superAdminTDS || 0;

        // NET amounts = gross commission − TDS (what actually gets credited to each party)
        const retailerNetAmt = round4(retailerCommAmt - retailerTDS);
        const distNetAmt = round4(distCommAmt - distributorTDS);
        const mdNetAmt = round4(mdCommAmt - masterDistTDS);
        const companyNetAmt = round4(companyCommAmt - whitelabelTDS);
        const superAdminNetAmt = round4(superAdminCommAmt - superAdminTDS);

        // Avail flags
        const aepsAvail = commData.avail || {
            superAdminAvail: false, whitelabelAvail: false,
            masterDistributorAvail: false, distributorAvail: false, retailerAvail: false
        };

        // Transaction initiator's AEPS wallet credit = NET retail comm (role 5) or NET dist comm (role 4)
        const initiatorCredit = [4, 5].includes(user.userRole) ? (user.userRole === 5 ? retailerNetAmt : distNetAmt) : 0;
        const closingAepsWallet = (isSuccess || isPending) ? round4(openingAepsWallet + initiatorCredit) : openingAepsWallet;


        if (isSuccess || isPending) {
            const remarkStatus = isPending ? ` Pending-${operator?.operatorName || normalizedBankiin}` : `-${operator?.operatorName || normalizedBankiin}`;
            const remarkText = `AEPS ${normalizedTxnType}${remarkStatus}`;

            const walletUpdates = [];
            const historyPromises = [];

            if ([4, 5].includes(user.userRole) && commData.users.companyAdmin) {

                // A. Initiating User (Retailer role 5 OR Distributor role 4)
                if (initiatorCredit > 0) {
                    await wallet.update({ apes1Wallet: closingAepsWallet, updatedBy: req.user.id });
                }

                await model.walletHistory.create({
                    refId: req.user.id,
                    companyId: req.user.companyId,
                    walletType: 'AEPS',
                    operator: operator?.operatorName || normalizedBankiin,
                    amount: amountNumber,
                    comm: initiatorCredit,
                    surcharge: 0,
                    openingAmt: openingAepsWallet,
                    closingAmt: closingAepsWallet,
                    credit: initiatorCredit,
                    debit: 0,
                    merchantTransactionId,
                    transactionId: safeRequest.transactionId,
                    paymentStatus,
                    paymentInstrument: {
                        service: 'AEPS',
                        request: safeRequest,
                        response: normalizedGatewayResponse,
                        metadata: { ipAddress: resolvedIpAddress, latitude: txLatitude, longitude: txLongitude, transactionCompleteAddress }
                    },
                    remark: remarkText,
                    aepsTxnType: normalizedTxnType,
                    bankiin: normalizedBankiin,
                    superadminComm: superAdminCommAmt,
                    whitelabelComm: companyCommAmt,
                    masterDistributorCom: mdCommAmt,
                    distributorCom: distCommAmt,
                    retailerCom: retailerCommAmt,
                    addedBy: req.user.id,
                    updatedBy: req.user.id,
                    userDetails: { id: existingUser.id, userType: existingUser.userType, mobileNo: existingUser.mobileNo }
                });

                // B. Distributor (role 4) — only present when retailer (role 5) is the initiator
                if (commData.users.distributor && commData.wallets.distributorWallet && user.userRole === 5) {
                    const dWallet = commData.wallets.distributorWallet;
                    const dOpening = round4(dWallet.apes1Wallet || 0);
                    // Net credit = gross comm − TDS − shortfall
                    const dNet = distNetAmt - distShortfallAmt;
                    const dClosing = round4(dOpening + dNet);
                    walletUpdates.push(
                        dbService.update(model.wallet, { id: dWallet.id }, { apes1Wallet: dClosing, updatedBy: commData.users.distributor.id })
                    );
                    historyPromises.push(dbService.createOne(model.walletHistory, {
                        refId: commData.users.distributor.id,
                        companyId: user.companyId,
                        walletType: 'AEPS',
                        operator: operator?.operatorName || normalizedBankiin,
                        remark: `${remarkText} - dist comm`,
                        amount: amountNumber,
                        comm: distCommAmt,
                        surcharge: 0,
                        openingAmt: dOpening,
                        closingAmt: dClosing,
                        credit: distNetAmt,
                        debit: distShortfallAmt + distributorTDS,
                        merchantTransactionId,
                        transactionId: safeRequest.transactionId,
                        paymentStatus,
                        addedBy: commData.users.distributor.id,
                        updatedBy: commData.users.distributor.id
                    }));
                }

                // C. Master Distributor
                if (commData.users.masterDistributor && commData.wallets.masterDistributorWallet) {
                    const mWallet = commData.wallets.masterDistributorWallet;
                    const mOpening = round4(mWallet.apes1Wallet || 0);
                    const mNet = mdNetAmt - mdShortfallAmt;
                    const mClosing = round4(mOpening + mNet);
                    walletUpdates.push(
                        dbService.update(model.wallet, { id: mWallet.id }, { apes1Wallet: mClosing, updatedBy: commData.users.masterDistributor.id })
                    );
                    historyPromises.push(dbService.createOne(model.walletHistory, {
                        refId: commData.users.masterDistributor.id,
                        companyId: user.companyId,
                        walletType: 'AEPS',
                        operator: operator?.operatorName || normalizedBankiin,
                        remark: `${remarkText} - md comm`,
                        amount: amountNumber,
                        comm: mdCommAmt,
                        surcharge: 0,
                        openingAmt: mOpening,
                        closingAmt: mClosing,
                        credit: mdNetAmt,
                        debit: mdShortfallAmt + masterDistTDS,
                        merchantTransactionId,
                        transactionId: safeRequest.transactionId,
                        paymentStatus,
                        addedBy: commData.users.masterDistributor.id,
                        updatedBy: commData.users.masterDistributor.id
                    }));
                }

                // D. Company (WL)
                if (commData.wallets.companyWallet) {
                    const cWallet = commData.wallets.companyWallet;
                    const cOpening = round4(cWallet.apes1Wallet || 0);
                    const cNet = companyNetAmt - wlShortfallAmt;
                    const cClosing = round4(cOpening + cNet);
                    walletUpdates.push(
                        dbService.update(model.wallet, { id: cWallet.id }, { apes1Wallet: cClosing, updatedBy: commData.users.companyAdmin.id })
                    );
                    historyPromises.push(dbService.createOne(model.walletHistory, {
                        refId: commData.users.companyAdmin.id,
                        companyId: user.companyId,
                        walletType: 'AEPS',
                        operator: operator?.operatorName || normalizedBankiin,
                        remark: `${remarkText} - company comm`,
                        amount: amountNumber,
                        comm: companyCommAmt,
                        surcharge: 0,
                        openingAmt: cOpening,
                        closingAmt: cClosing,
                        credit: companyNetAmt,
                        debit: wlShortfallAmt + whitelabelTDS,
                        merchantTransactionId,
                        transactionId: safeRequest.transactionId,
                        paymentStatus,
                        addedBy: commData.users.companyAdmin.id,
                        updatedBy: commData.users.companyAdmin.id
                    }));
                }

                // E. Super Admin
                if (commData.wallets.superAdminWallet) {
                    const saWallet = commData.wallets.superAdminWallet;
                    const saOpening = round4(saWallet.apes1Wallet || 0);
                    const saNet = superAdminNetAmt - saShortfallAmt;
                    const saClosing = round4(saOpening + saNet);
                    walletUpdates.push(
                        dbService.update(model.wallet, { id: saWallet.id }, { apes1Wallet: saClosing, updatedBy: commData.users.superAdmin.id })
                    );
                    historyPromises.push(dbService.createOne(model.walletHistory, {
                        refId: commData.users.superAdmin.id,
                        companyId: 1,
                        walletType: 'AEPS',
                        operator: operator?.operatorName || normalizedBankiin,
                        remark: `${remarkText} - admin comm`,
                        amount: amountNumber,
                        comm: superAdminCommAmt,
                        surcharge: 0,
                        openingAmt: saOpening,
                        closingAmt: saClosing,
                        credit: superAdminNetAmt,
                        debit: saShortfallAmt + superAdminTDS,
                        merchantTransactionId,
                        transactionId: safeRequest.transactionId,
                        paymentStatus,
                        addedBy: commData.users.superAdmin.id,
                        updatedBy: commData.users.superAdmin.id
                    }));
                }

                // Execute all remaining updates
                await Promise.all([...walletUpdates, ...historyPromises]);

            } else {
                // Non-role 4/5 fallback: just credit initiator AEPS wallet
                if (initiatorCredit > 0) {
                    await wallet.update({ apes1Wallet: closingAepsWallet, updatedBy: req.user.id });
                }
                await model.walletHistory.create({
                    refId: req.user.id,
                    companyId: req.user.companyId,
                    walletType: 'AEPS',
                    operator: operator?.operatorName || normalizedBankiin,
                    amount: amountNumber,
                    comm: 0,
                    surcharge: 0,
                    openingAmt: openingAepsWallet,
                    closingAmt: closingAepsWallet,
                    credit: initiatorCredit,
                    debit: 0,
                    merchantTransactionId,
                    transactionId: safeRequest.transactionId,
                    paymentStatus,
                    paymentInstrument: {
                        service: 'AEPS',
                        request: safeRequest,
                        response: normalizedGatewayResponse,
                        metadata: { ipAddress: resolvedIpAddress, latitude: txLatitude, longitude: txLongitude, transactionCompleteAddress }
                    },
                    remark: remarkText,
                    aepsTxnType: normalizedTxnType,
                    bankiin: normalizedBankiin,
                    addedBy: req.user.id,
                    updatedBy: req.user.id,
                    userDetails: { id: existingUser.id, userType: existingUser.userType, mobileNo: existingUser.mobileNo }
                });
            }
        }

        // Separate AEPS history (for reporting) — always written for all statuses
        const creditToApply = (isSuccess || isPending) ? initiatorCredit : 0;
        if (model.aepsHistory) {
            await model.aepsHistory.create({
                refId: req.user.id,
                companyId: req.user.companyId,
                operator: operator?.operatorName || normalizedBankiin,
                bankiin: normalizedBankiin,
                aepsTxnType: normalizedTxnType,
                captureType: normalizedCaptureType,
                amount: amountNumber,
                transactionId: safeRequest.transactionId,
                merchantTransactionId,
                consumerNumber: consumerNumber ? String(consumerNumber) : null,
                consumerAadhaarNumber,
                ipAddress: resolvedIpAddress,
                latitude: txLatitude !== undefined && txLatitude !== null ? Number(txLatitude) : null,
                longitude: txLongitude !== undefined && txLongitude !== null ? Number(txLongitude) : null,
                transactionCompleteAddress,
                bankRRN:
                    innerData?.bankRRN ||
                    innerData?.bankRrn ||
                    normalizedGatewayResponse?.bankRRN ||
                    normalizedGatewayResponse?.bankRrn,
                fpTransactionId:
                    innerData?.fpTransactionId ||
                    innerData?.FingpayTransactionId ||
                    normalizedGatewayResponse?.fpTransactionId ||
                    normalizedGatewayResponse?.FingpayTransactionId,
                responseCode,
                status: paymentStatus,
                message:
                    normalizedGatewayResponse?.message ||
                    innerData?.errorMessage ||
                    innerData?.responseMessage ||
                    innerData?.message,
                requestPayload: safeRequest,
                responsePayload: normalizedGatewayResponse,
                openingAepsWallet,
                closingAepsWallet,
                credit: creditToApply,
                superadminComm: superAdminCommAmt,
                whitelabelComm: companyCommAmt,
                masterDistributorCom: mdCommAmt,
                distributorCom: distCommAmt,
                retailerCom: retailerCommAmt,
                superadminCommTDS: superAdminTDS,
                whitelabelCommTDS: whitelabelTDS,
                masterDistributorComTDS: masterDistTDS,
                distributorComTDS: distributorTDS,
                retailerComTDS: retailerTDS,
                ...aepsAvail,
                addedBy: req.user.id,
                updatedBy: req.user.id
            });
        }

        // If FAILED/PENDING: do not stop persistence above; just return gateway response after storing
        if (!isSuccess) {
            return res.failure({
                message:
                    normalizedGatewayResponse?.message ||
                    innerData?.message ||
                    (isPending ? 'AEPS transaction pending' : 'AEPS transaction failed'),
                data: {
                    paymentStatus,
                    responseCode,
                    transactionStatus,
                    merchantTransactionId: null,
                    gatewayResponse: normalizedGatewayResponse
                }
            });
        }

        // Use bank details already fetched during validation
        let bankName = null;
        let bankLogo = null;
        if (bankDetails) {
            bankName = bankDetails.bankName;
            bankLogo = imageService.getImageUrl(bankDetails.bankLogo, false);
        }

        // Get company logo URL - check company.logo first, then companyImage table
        let companyLogo = null;
        if (existingCompany?.logo) {
            companyLogo = imageService.getImageUrl(existingCompany.logo, false);
        } else if (existingCompany?.id) {
            // Try to get logo from companyImage table (type: signature, subtype: logo)
            const companyLogoImage = await dbService.findOne(model.companyImage, {
                companyId: existingCompany.id,
                type: 'signature',
                subtype: 'logo',
                isActive: true
            });
            if (companyLogoImage?.s3Key) {
                companyLogo = imageService.getImageUrl(companyLogoImage.s3Key, false);
            }
        }

        // Extract transaction date/time from gateway response
        const transactionDateTimeRaw = innerData?.requestTransactionTime ||
            normalizedGatewayResponse?.data?.requestTransactionTime ||
            null;

        // Format transaction date/time (if from gateway, use as-is; otherwise use current time)
        let transactionDateTime = transactionDateTimeRaw;
        let transactionTime = transactionDateTimeRaw;
        if (!transactionDateTimeRaw) {
            const now = new Date();
            // Format as DD/MM/YYYY HH:MM:SS
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = now.getFullYear();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            transactionDateTime = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
            transactionTime = `${hours}:${minutes}:${seconds}`;
        } else {
            // If gateway provides time, extract just time part if needed
            const timeMatch = transactionDateTimeRaw.match(/(\d{2}:\d{2}:\d{2})/);
            if (timeMatch) {
                transactionTime = timeMatch[1];
            }
        }

        // Extract remaining balance from gateway response
        const remainingBalance = innerData?.balanceAmount ||
            normalizedGatewayResponse?.data?.balanceAmount ||
            normalizedGatewayResponse?.balanceAmount ||
            null;

        const miniStatement = innerData?.miniStatementStructureModel ||
            normalizedGatewayResponse?.data?.miniStatementStructureModel ||
            aepsResponse?.miniStatementStructureModel ||
            null;

        // Extract client_transaction_id for transactionId
        const clientTransactionId = normalizedGatewayResponse?.client_transaction_id ||
            payload.transactionId;

        // Format response with all required fields
        const responseData = {
            status: paymentStatus,
            service: 'AEPS',
            transactionId: clientTransactionId,
            referenceId: merchantTransactionId,
            transactionType: transactionType,
            transactionDate: transactionDateTime,
            transactionTime: transactionTime,
            amount: amountNumber,
            remainingBalance: remainingBalance,
            miniStatement: miniStatement,
            bankName: bankName,
            bankLogo: bankLogo,
            response: aepsResponse,
            companyName: existingCompany?.companyName || null,
            companyLogo: companyLogo,
        };

        // Add mini statement data for MS transactions
        if (normalizedTxnType === 'MS' && miniStatement && Array.isArray(miniStatement)) {
            responseData.response.miniStatement = miniStatement;
        }

        return res.success({
            message: 'AEPS transaction successful',
            data: responseData
        });
    }
    catch (error) {
        console.error('AEPS transaction error', error);
        return res.failure({ message: error.message || 'Unable to process AEPS transaction' });
    }
}


const checkStatus = async (req, res) => {
    try {
        const { txnId } = req.body;
        if (!txnId) {
            return res.failure({ message: 'Transaction ID is required' });
        }

        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId,
            isActive: true
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
            userId: req.user.id,
            companyId: req.user.companyId,
            isActive: true
        });
        if (!existingAepsOnboarding) {
            return res.failure({ message: 'AEPS onboarding not found' });
        }

        // ── Lookup existing AEPS history record for this txnId ───────────────
        const aepsHistoryRecord = await dbService.findOne(model.aepsHistory, { transactionId: txnId });

        // ── Call the ASL check-status API ────────────────────────────────────
        const statusPayload = {
            uniqueID: existingAepsOnboarding.uniqueID,
            merchantLoginId: existingAepsOnboarding.merchantLoginId,
            txnId: txnId
        };
        const response = await asl.aslAepsCheckStatus(statusPayload);
        console.log('[AEPS checkStatus] response:', JSON.stringify(response, null, 2));

        const innerData = response?.data && typeof response.data === 'object' ? response.data : null;
        const responseCode = innerData?.responseCode ?? response?.responseCode;
        const transactionStatusRaw = innerData?.transactionStatus ?? innerData?.status ?? response?.status;
        const transactionStatus = transactionStatusRaw ? String(transactionStatusRaw).toUpperCase() : null;

        const isSuccess =
            responseCode === '00' ||
            transactionStatus === 'SUCCESS' ||
            transactionStatus === 'SUCCESSFUL';

        const isFailure = !isSuccess && (
            transactionStatus === 'FAILED' ||
            transactionStatus === 'FAILURE' ||
            transactionStatus === 'ERROR' ||
            (response?.status && String(response.status).toUpperCase() !== 'SUCCESS')
        );

        // ── If FAILURE: reverse all AEPS wallet commissions ──────────────────
        if (isFailure && aepsHistoryRecord) {
            const currentStatus = aepsHistoryRecord.status;

            // Only reverse if the original transaction was SUCCESS or PENDING (not already FAILED/REFUNDED)
            if (currentStatus === 'SUCCESS' || currentStatus === 'PENDING') {
                console.log(`[AEPS checkStatus] Reversing commissions for txnId: ${txnId}, previous status: ${currentStatus}`);

                // Find all walletHistory entries for this transactionId with walletType = AEPS
                const aepsWalletHistories = await dbService.findAll(model.walletHistory, {
                    transactionId: txnId,
                    walletType: 'AEPS'
                });

                if (aepsWalletHistories && aepsWalletHistories.length > 0) {
                    const reversalUpdates = [];
                    const reversalHistoryPromises = [];

                    for (const history of aepsWalletHistories) {
                        // Net impact on this party's apes1Wallet was: credit − debit
                        // To reverse: we subtract that net (i.e. debit credit, credit debit)
                        const netImpact = round4((history.credit || 0) - (history.debit || 0));
                        if (netImpact === 0) continue;

                        const walletRecord = await dbService.findOne(model.wallet, {
                            refId: history.refId,
                            companyId: history.companyId
                        });
                        if (!walletRecord) continue;

                        const currentAeps = round4(walletRecord.apes1Wallet || 0);
                        const newAeps = round4(currentAeps - netImpact);

                        reversalUpdates.push(
                            dbService.update(model.wallet, { id: walletRecord.id }, {
                                apes1Wallet: newAeps,
                                updatedBy: existingUser.id
                            })
                        );

                        reversalHistoryPromises.push(
                            dbService.createOne(model.walletHistory, {
                                refId: history.refId,
                                companyId: history.companyId,
                                walletType: 'AEPS',
                                operator: history.operator || '',
                                remark: `Reversal - AEPS ${aepsHistoryRecord.aepsTxnType || ''} Failed`,
                                amount: history.amount || 0,
                                comm: 0,
                                surcharge: 0,
                                openingAmt: currentAeps,
                                closingAmt: newAeps,
                                // Reversed: credit becomes debit, debit becomes credit
                                credit: history.debit || 0,
                                debit: history.credit || 0,
                                transactionId: txnId,
                                paymentStatus: 'REFUNDED',
                                addedBy: existingUser.id,
                                updatedBy: existingUser.id
                            })
                        );
                    }

                    await Promise.all([...reversalUpdates, ...reversalHistoryPromises]);
                    console.log(`[AEPS checkStatus] Reversed ${aepsWalletHistories.length} wallet entries for txnId: ${txnId}`);

                } else {
                    // No wallet history found — try to reverse by credit field stored in aepsHistory
                    console.warn(`[AEPS checkStatus] No AEPS walletHistory found for txnId: ${txnId}, attempting fallback reversal`);
                    const creditToReverse = round4(aepsHistoryRecord.credit || 0);
                    if (creditToReverse > 0) {
                        const walletRecord = await dbService.findOne(model.wallet, {
                            refId: aepsHistoryRecord.refId,
                            companyId: aepsHistoryRecord.companyId
                        });
                        if (walletRecord) {
                            const currentAeps = round4(walletRecord.apes1Wallet || 0);
                            const newAeps = round4(currentAeps - creditToReverse);
                            await dbService.update(model.wallet, { id: walletRecord.id }, {
                                apes1Wallet: newAeps,
                                updatedBy: existingUser.id
                            });
                            await dbService.createOne(model.walletHistory, {
                                refId: aepsHistoryRecord.refId,
                                companyId: aepsHistoryRecord.companyId,
                                walletType: 'AEPS',
                                operator: aepsHistoryRecord.operator || '',
                                remark: `Reversal - AEPS ${aepsHistoryRecord.aepsTxnType || ''} Failed`,
                                amount: aepsHistoryRecord.amount || 0,
                                comm: 0, surcharge: 0,
                                openingAmt: currentAeps, closingAmt: newAeps,
                                credit: 0, debit: creditToReverse,
                                transactionId: txnId,
                                paymentStatus: 'REFUNDED',
                                addedBy: existingUser.id, updatedBy: existingUser.id
                            });
                        }
                    }
                }

                // Update aepsHistory record to FAILED with zeroed commissions
                await dbService.update(model.aepsHistory, { transactionId: txnId }, {
                    status: 'FAILED',
                    superadminComm: 0,
                    whitelabelComm: 0,
                    masterDistributorCom: 0,
                    distributorCom: 0,
                    retailerCom: 0,
                    superadminCommTDS: 0,
                    whitelabelCommTDS: 0,
                    masterDistributorComTDS: 0,
                    distributorComTDS: 0,
                    retailerComTDS: 0,
                    credit: 0,
                    updatedBy: existingUser.id
                });

                return res.failure({
                    message: innerData?.errorMessage || response?.message || 'AEPS transaction failed. Commissions reversed.',
                    data: {
                        txnId,
                        status: 'FAILED',
                        refunded: true,
                        gatewayResponse: response
                    }
                });
            }
        }

        // ── SUCCESS or still pending ─────────────────────────────────────────
        if (isSuccess) {
            // Update aepsHistory status to SUCCESS if it was PENDING
            if (aepsHistoryRecord && aepsHistoryRecord.status === 'PENDING') {
                await dbService.update(model.aepsHistory, { transactionId: txnId }, {
                    status: 'SUCCESS',
                    updatedBy: existingUser.id
                });
            }
            return res.success({
                message: 'AEPS transaction is successful',
                data: {
                    txnId,
                    status: 'SUCCESS',
                    gatewayResponse: response
                }
            });
        }

        // Indeterminate / still pending
        return res.success({
            message: 'AEPS transaction status',
            data: {
                txnId,
                status: transactionStatus || 'UNKNOWN',
                gatewayResponse: response
            }
        });

    } catch (error) {
        console.error('Check status error', error);
        return res.failure({ message: error.message || 'Unable to check status' });
    }
}


const getOnboardingStatus = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
            userId: existingUser.id,
            companyId: existingUser.companyId,
        });

        // Daily 2FA status (IST date based)
        await aepsDailyLoginService.logoutPreviousDaySessions(req.user.id, req.user.companyId);
        const todayDateStr = aepsDailyLoginService.getIndianDateOnly();
        const existingDaily2FA = await dbService.findOne(model.aepsDailyLogin, {
            refId: req.user.id,
            companyId: req.user.companyId,
            loginDate: todayDateStr
        });
        const isDaily2FACompleted = Boolean(existingDaily2FA);
        const nextEligibleAt = aepsDailyLoginService.getNextMidnightIST();

        // Handle case when onboarding doesn't exist yet (pending)
        if (!existingAepsOnboarding) {
            const statusData = {
                onboardingStatus: 'PENDING',
                currentStep: 'aepsOnboarding',
                aepsOnboarding: {
                    status: 'pending',
                    isCompleted: false
                },
                ekycOtp: {
                    status: 'pending',
                    isCompleted: false
                },
                ekycBiometric: {
                    status: 'pending',
                    isCompleted: false
                },
                bankKycOtp: {
                    status: 'pending',
                    isCompleted: false
                },
                bankKycBiometric: {
                    status: 'pending',
                    isCompleted: false
                },
                '2faAuthentication': {
                    status: isDaily2FACompleted ? 'success' : 'pending',
                    isCompleted: isDaily2FACompleted,
                    loginDate: todayDateStr,
                    nextEligibleAt: nextEligibleAt ? nextEligibleAt.toISOString() : null
                }
            };
            return res.success({ message: 'AEPS onboarding status', data: statusData });
        }

        const isAepsOnboardingComplete = Boolean(existingAepsOnboarding.merchantStatus);
        const isOtpValidated = Boolean(existingAepsOnboarding.isOtpValidated);
        const isBioMetricValidated = Boolean(existingAepsOnboarding.isBioMetricValidated);
        const isBankKycOtpValidated = Boolean(existingAepsOnboarding.isBankKycOtpValidated);
        const isBankKycBiometricValidated = Boolean(existingAepsOnboarding.isBankKycBiometricValidated);

        // Determine current step and overall status
        let currentStep = 'aepsOnboarding';
        if (!isAepsOnboardingComplete) {
            currentStep = 'aepsOnboarding';
        } else if (!isOtpValidated) {
            currentStep = 'ekycOtp';
        } else if (!isBioMetricValidated) {
            currentStep = 'ekycBiometric';
        } else if (!isBankKycOtpValidated) {
            currentStep = 'bankKycOtp';
        } else if (!isBankKycBiometricValidated) {
            currentStep = 'bankKycBiometric';
        } else if (!isDaily2FACompleted) {
            currentStep = '2faAuthentication';
        } else {
            currentStep = 'aepsTransaction';
        }

        const isAllCompleted = isAepsOnboardingComplete && isOtpValidated && isBioMetricValidated &&
            isBankKycOtpValidated && isBankKycBiometricValidated;
        const overallStatus = isAllCompleted ? 'COMPLETED' : 'PENDING';

        // Update onboardingStatus in database if it needs to be updated
        if (existingAepsOnboarding.onboardingStatus !== overallStatus) {
            await dbService.update(
                model.aepsOnboarding,
                { id: existingAepsOnboarding.id },
                { onboardingStatus: overallStatus }
            );
        }

        const statusData = {
            ...existingAepsOnboarding.toJSON ? existingAepsOnboarding.toJSON() : existingAepsOnboarding,
            onboardingStatus: overallStatus,
            currentStep: currentStep,
            aepsOnboarding: {
                status: isAepsOnboardingComplete ? 'success' : 'pending',
                isCompleted: isAepsOnboardingComplete
            },
            ekycOtp: {
                status: isOtpValidated ? 'success' : 'pending',
                isCompleted: isOtpValidated
            },
            ekycBiometric: {
                status: isBioMetricValidated ? 'success' : 'pending',
                isCompleted: isBioMetricValidated
            },
            bankKycOtp: {
                status: isBankKycOtpValidated ? 'success' : 'pending',
                isCompleted: isBankKycOtpValidated
            },
            bankKycBiometric: {
                status: isBankKycBiometricValidated ? 'success' : 'pending',
                isCompleted: isBankKycBiometricValidated
            },
            aeps2FaAuthentication: {
                status: isDaily2FACompleted ? 'success' : 'pending',
                isCompleted: isDaily2FACompleted,
                loginDate: todayDateStr,
                nextEligibleAt: nextEligibleAt ? nextEligibleAt.toISOString() : null
            }
        };

        return res.success({ message: 'AEPS onboarding status', data: statusData });
    }
    catch (error) {
        console.error('AEPS onboarding status error', error);
        return res.failure({ message: error.message || 'Unable to process AEPS onboarding status' });
    }
}

const aepsOnboarding = async (req, res) => {
    try {
        const REQUIRED_FIELD_ERRORS = {
            retailerFirstName: 'Enter your first name [PAR001]',
            retailerEmail: 'Enter your email [PAR002]',
            phone: 'Enter your phone [PAR003]',
            retailerDob: 'Enter your date of birth [PAR004]',
            retailerCity: 'Enter your city [PAR005]',
            retailerState: 'Enter your state [PAR006]',
            retailerCountry: 'Enter your country [PAR007]',
            retailerPincode: 'Enter your pincode [PAR008]',
            aadharNo: 'Enter your aadhaar no [PAR009]',
            panNo: 'Enter your pancard no [PAR010]',
            retailerAadhaarFrontImage: 'Enter aadhaar front image [PAR011]',
            retailerAadhaarBackImage: 'Enter aadhaar back image [PAR012]',
            retailerPanFrontImage: 'Enter pan card front image [PAR013]',
            retailerPanBackImage: 'Enter pancard back image [PAR014]',
            retailerShopImage: 'Enter your shop image [PAR015]',
            bankAccountNo: 'Enter your bank account no [PAR016]',
            bankIfsc: 'Enter your bank IFSC [PAR017]',
            latitude: 'Enter your latitude [PAR018]',
            longitude: 'Enter your longitude [PAR019]',
            retailerShopName: 'Enter your shop name [PAR020]',
            shopAddress: 'Enter your shop address [PAR021]',
            shopCity: 'Enter your shop city [PAR022]',
            shopDistrict: 'Enter your shop district [PAR023]',
            shopState: 'Enter your shop state [PAR024]',
            shopPincode: 'Enter your shop pincode [PAR025]'
        };

        const pickValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

        const formatDob = (dob) => {
            if (!dob) {
                return undefined;
            }
            if (/^\d{2}-\d{2}-\d{4}$/.test(dob)) {
                return dob;
            }
            const parsed = new Date(dob);
            if (Number.isNaN(parsed.getTime())) {
                return dob;
            }
            const day = `${parsed.getDate()}`.padStart(2, '0');
            const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
            return `${day}-${month}-${parsed.getFullYear()}`;
        };

        const buildImageUrl = (image) => {
            if (!image) {
                return undefined;
            }
            const key = typeof image === 'string' ? image : image.key || image.path || image.Location;
            if (!key) {
                return undefined;
            }
            const baseCdnUrl = process.env.AWS_CDN_URL ? process.env.AWS_CDN_URL.replace(/\/$/, '') : '';
            const normalizedKey = key.replace(/^\//, '');
            return baseCdnUrl ? `${baseCdnUrl}/${normalizedKey}` : normalizedKey;
        };

        const validatePayload = (payload) => {
            for (const [field, message] of Object.entries(REQUIRED_FIELD_ERRORS)) {
                const value = payload[field];
                const isEmpty = value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
                if (isEmpty) {
                    return message;
                }
            }
            return null;
        };
        const [
            existingUser,
            existingCompany,
            outletDetails,
            customerBankDetails,
            existingAepsOnboarding
        ] = await Promise.all([
            dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId }),
            dbService.findOne(model.company, { id: req.user.companyId }),
            dbService.findOne(model.outlet, { refId: req.user.id }),
            dbService.findOne(model.customerBank, { refId: req.user.id }),
            dbService.findOne(model.aepsOnboarding, {
                userId: req.user.id,
                companyId: req.user.companyId,
                merchantStatus: true
            })
        ]);

        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        if (!existingCompany) {
            return res.failure({ message: 'Company not found' });
        }

        if (!outletDetails) {
            return res.failure({ message: 'Outlet not found' });
        }
        if (!customerBankDetails) {
            return res.failure({ message: 'Customer bank not found' });
        }
        if (existingAepsOnboarding && existingAepsOnboarding.onboardingStatus === 'COMPLETED') {
            return res.failure({ message: 'AEPS onboarding already completed' });
        }

        const retailerLatitude = pickValue(existingUser.latitude, outletDetails.latitude);
        const retailerLongitude = pickValue(existingUser.longitude, outletDetails.longitude);
        const retailerCountry = pickValue(existingUser.country, outletDetails.shopCountry, 'India');
        const retailerFirstName = existingUser.name;
        const payload = {
            retailerFirstName,
            retailerMiddleName: "",
            retailerLastName: "",
            retailerEmail: existingUser.email,
            phone: existingUser.mobileNo,
            retailerDob: formatDob(existingUser.dob),
            retailerCity: existingUser.city || outletDetails.shopCity,
            retailerState: existingUser.state || outletDetails.shopState,
            retailerCountry,
            retailerPincode: existingUser.zipcode || outletDetails.shopPincode,
            aadharNo: existingUser.aadharDetails?.aadhaarNumber || '829763289274',
            panNo: existingUser.panDetails?.data?.pan_number || existingCompany.companyPan,
            bankAccountNo: customerBankDetails.accountNumber,
            bankIfsc: customerBankDetails.ifsc,
            bankName: customerBankDetails.bankName,
            bankAccHolderName: customerBankDetails.beneficiaryName,
            latitude: retailerLatitude,
            longitude: retailerLongitude,
            retailerShopName: outletDetails.shopName || existingUser.outletName,
            companyOrShopPan: existingUser.panDetails?.data?.pan_number || existingCompany.companyPan,
            shopAddress: outletDetails.shopAddress,
            gstinNumber: outletDetails.gstNo || '',
            shopCity: outletDetails.shopCity || existingUser.city,
            shopDistrict: outletDetails.shopDistrict,
            shopState: outletDetails.shopState || existingUser.state,
            shopPincode: outletDetails.shopPincode || existingUser.zipcode,
            shopLatitude: pickValue(outletDetails.shopLatitude),
            shopLongitude: pickValue(outletDetails.shopLongitude),
            retailerAddress: outletDetails.shopAddress || existingUser.fullAddress,
            retailerAadhaarFrontImage: buildImageUrl(existingUser.aadharFrontImage),
            retailerAadhaarBackImage: buildImageUrl(existingUser.aadharBackImage),
            retailerPanFrontImage: buildImageUrl(existingUser.panFrontImage || existingUser.panCardFrontImage),
            retailerPanBackImage: buildImageUrl(existingUser.panBackImage || existingUser.panCardBackImage),
            retailerShopImage: buildImageUrl(outletDetails.shopImage || existingUser.profileImage)
        };
        console.log('payload', payload);

        const validationError = validatePayload(payload);
        if (validationError) {
            return res.failure({ message: validationError });
        }

        const aepsOnboardingDetails = await asl.aslAepsOnboarding(payload);

        console.log("aepsOnboardingDetails", aepsOnboardingDetails);

        const normalizedStatus = aepsOnboardingDetails?.status ? String(aepsOnboardingDetails.status).toLowerCase() : null;
        const nestedStatus = aepsOnboardingDetails?.data?.status ? String(aepsOnboardingDetails.data.status).toLowerCase() : null;
        const merchantStatus = Boolean(aepsOnboardingDetails?.data?.data?.merchantStatus ?? aepsOnboardingDetails?.data?.merchantStatus);
        const isSuccess =
            normalizedStatus === 'success' ||
            nestedStatus === 'success' ||
            nestedStatus === 'transaction successful' ||
            merchantStatus;

        if (isSuccess) {
            await dbService.createOne(model.aepsOnboarding, {
                userId: req.user.id,
                companyId: req.user.companyId,
                status: aepsOnboardingDetails.status || aepsOnboardingDetails.data?.status,
                uniqueID: aepsOnboardingDetails.uniqueID || aepsOnboardingDetails.data?.uniqueID,
                otpReferenceId: aepsOnboardingDetails.otpReferneceId || aepsOnboardingDetails.data?.otpReferneceId,
                hash: aepsOnboardingDetails.hash || aepsOnboardingDetails.data?.hash,
                message: aepsOnboardingDetails.message || aepsOnboardingDetails.data?.message,
                merchantStatus: merchantStatus,
                remarks: aepsOnboardingDetails.data?.data?.remarks || aepsOnboardingDetails.data?.remarks,
                superMerchantId: aepsOnboardingDetails.data?.data?.superMerchantId || aepsOnboardingDetails.data?.superMerchantId,
                merchantLoginId: aepsOnboardingDetails.data?.data?.merchantLoginId || aepsOnboardingDetails.data?.merchantLoginId,
                errorCodes: aepsOnboardingDetails.data?.data?.errorCodes || aepsOnboardingDetails.data?.errorCodes,
                onboardingStatus: 'PENDING'
            });

            const responseData = {
                ...aepsOnboardingDetails,
                phone: existingUser.mobileNo || null
            };

            return res.success({ message: 'AEPS onboarding successful', data: responseData });
        }

        return res.failure({ message: aepsOnboardingDetails?.message || 'AEPS onboarding failed', data: aepsOnboardingDetails });
    } catch (error) {
        return res.failure({ message: error.message || 'Unable to process AEPS onboarding' });
    }
};

const validateAgentOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
            userId: req.user.id,
            companyId: req.user.companyId,
            merchantStatus: true
        });
        if (!existingAepsOnboarding) {
            return res.failure({ message: 'AEPS onboarding not found' });
        }

        if (existingAepsOnboarding.isOtpValidated) {
            return res.failure({ message: 'AEPS OTP already validated' });
        }
        const payload = {
            uniqueID: existingAepsOnboarding.uniqueID,
            aadhaarNo: existingUser.aadharDetails?.aadhaarNumber || '829763289274',
            otpReferenceID: existingAepsOnboarding.otpReferenceId,
            otp,
            hash: existingAepsOnboarding.hash,
            merchantLoginId: existingAepsOnboarding.merchantLoginId,
        }
        const aepsResponse = await asl.aslAepsValidateAgentOtp(payload);

        const status = aepsResponse?.status ? String(aepsResponse.status).toUpperCase() : null;
        const nestedStatus = aepsResponse?.data?.status ? String(aepsResponse.data.status).toUpperCase() : null;
        if (status === 'SUCCESS' || nestedStatus === 'SUCCESS') {
            // Don't mark as COMPLETED yet - need to complete all steps including bank eKYC
            await dbService.update(
                model.aepsOnboarding,
                { id: existingAepsOnboarding.id },
                { isOtpValidated: true, otp: otp }
            );
            return res.success({ message: 'AEPS OTP validation successful', data: aepsResponse });
        }
        return res.failure({ message: aepsResponse?.message || aepsResponse?.data?.message || 'AEPS OTP validation failed', data: aepsResponse });
    } catch (error) {
        console.error('AEPS OTP validation error', error);
        return res.failure({ message: error.message || 'Unable to process AEPS OTP validation' });
    }
};

const resendAgentOtp = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
            userId: req.user.id,
            companyId: req.user.companyId,
            merchantStatus: true
        });
        if (!existingAepsOnboarding) {
            return res.failure({ message: 'AEPS onboarding not found' });
        }
        const payload = {
            uniqueID: existingAepsOnboarding.uniqueID,
            otpReferenceId: existingAepsOnboarding.otpReferenceId,
            hash: existingAepsOnboarding.hash,
            merchantLoginId: existingAepsOnboarding.merchantLoginId
        }
        const aepsResponse = await asl.aslAepsResendOtp(payload);
        console.log('aepsResponse', aepsResponse);
        const status = aepsResponse?.status ? String(aepsResponse.status).toUpperCase() : null;
        const nestedStatus = aepsResponse?.data?.status ? String(aepsResponse.data.status).toUpperCase() : null;
        if (status === 'SUCCESS' || nestedStatus === 'SUCCESS') {
            return res.success({ message: 'AEPS OTP resend successful', data: aepsResponse });
        }
    }
    catch (error) {
        console.error('AEPS OTP resend error', error);
        return res.failure({ message: error.message || 'Unable to process AEPS OTP resend' });
    }
}

const bioMetricVerification = async (req, res) => {
    try {
        const { biometricData } = req.body;
        let { captureType } = req.body;

        if (!biometricData) {
            return res.failure({ message: 'Biometric data is required' });
        }

        captureType = captureType ? String(captureType).trim().toUpperCase() : null;
        if (!captureType || !['FACE', 'FINGER'].includes(captureType)) {
            return res.failure({ message: 'Invalid capture type. Allowed values are FACE or FINGER' });
        }

        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
            userId: req.user.id,
            companyId: req.user.companyId,
            merchantStatus: true
        });
        if (!existingAepsOnboarding) {
            return res.failure({ message: 'AEPS onboarding not found' });
        }
        if (existingAepsOnboarding.onboardingStatus === 'COMPLETED') {
            return res.failure({ message: 'AEPS onboarding already completed' });
        }
        if (existingAepsOnboarding.isBioMetricValidated) {
            return res.failure({ message: 'Bio metric verification already validated' });
        }

        // Validate that biometricData is a string (PID XML)
        if (typeof biometricData !== 'string' || biometricData.trim() === '') {
            return res.failure({ message: 'Biometric data must be a valid PID XML string' });
        }
        if (!existingAepsOnboarding.otp) {
            return res.failure({ message: 'AEPS OTP is required before bio metric verification' });
        }
        // Ensure biometricData is properly formatted (trim whitespace)
        const formattedBiometricData = biometricData.trim();

        const payload = {
            uniqueID: existingAepsOnboarding.uniqueID,
            aadhaarNo: existingUser.aadharDetails?.aadhaarNumber || '829763289274',
            otpReferenceID: existingAepsOnboarding.otpReferenceId,
            otp: existingAepsOnboarding.otp,
            hash: existingAepsOnboarding.hash,
            biometricData: formattedBiometricData,
            merchantLoginId: existingAepsOnboarding.merchantLoginId,
            captureType
        }

        const aepsResponse = await asl.aslAepsValidateAgentBiometric(payload);

        const status = aepsResponse?.status ? String(aepsResponse.status).toUpperCase() : null;
        const nestedStatus = aepsResponse?.data?.status ? String(aepsResponse.data.status).toUpperCase() : null;
        const normalizedStatus = status || nestedStatus;
        const sanitizedRequestPayload = {
            uniqueID: payload.uniqueID,
            aadhaarNo: payload.aadhaarNo,
            otpReferenceID: payload.otpReferenceID,
            hash: payload.hash,
            merchantLoginId: payload.merchantLoginId
        };

        await dbService.createOne(model.bioMetric, {
            refId: existingUser.id,
            companyId: existingUser.companyId,
            captureType,
            status: normalizedStatus,
            responseMessage: aepsResponse?.message || aepsResponse?.data?.message,
            transactionId: aepsResponse?.data?.aslTransactionId || aepsResponse?.data?.reqId,
            rrn: aepsResponse?.data?.rrn,
            aadhaarNumber: aepsResponse?.data?.aadharNumber,
            authCode: aepsResponse?.data?.authCode,
            requestPayload: sanitizedRequestPayload,
            responsePayload: aepsResponse,
            addedBy: req.user.id,
            updatedBy: req.user.id
        });

        if (status === 'SUCCESS' || nestedStatus === 'SUCCESS') {
            // Don't mark as COMPLETED yet - need to complete bank eKYC steps too
            await dbService.update(
                model.aepsOnboarding,
                { id: existingAepsOnboarding.id },
                { isBioMetricValidated: true }
            );
            return res.success({ message: 'Bio metric verification successful', data: aepsResponse });
        }

        // Update isOtpValidated to false on error
        await dbService.update(
            model.aepsOnboarding,
            { id: existingAepsOnboarding.id },
            { isOtpValidated: false }
        );

        return res.failure({ message: aepsResponse?.message || aepsResponse?.data?.message || 'Bio metric verification failed', data: aepsResponse });
    }
    catch (error) {
        console.error('Bio metric verification error', error);

        // Update isOtpValidated to false on exception
        try {
            const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
                userId: req.user.id,
                companyId: req.user.companyId,
                merchantStatus: true
            });
            if (existingAepsOnboarding) {
                await dbService.update(
                    model.aepsOnboarding,
                    { id: existingAepsOnboarding.id },
                    { isOtpValidated: false }
                );
            }
        } catch (updateError) {
            console.error('Error updating aepsOnboarding on exception:', updateError);
        }

        return res.failure({ message: error.message || 'Unable to process Bio metric verification' });
    }
}

const bankKycSendOtp = async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId
        });
        const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
            userId: req.user.id,
            companyId: req.user.companyId,
            merchantStatus: true
        });

        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        if (!existingAepsOnboarding) {
            return res.failure({ message: 'AEPS onboarding not found' });
        }

        // Validate that eKYC biometric is completed
        if (!existingAepsOnboarding.isBioMetricValidated) {
            return res.failure({ message: 'Please complete eKYC biometric verification before bank eKYC' });
        }

        const existingCompany = await dbService.findOne(model.company, { id: req.user.companyId });

        const payload = {
            latitude: latitude,
            longitude: longitude,
            uniqueID: existingAepsOnboarding.uniqueID,
            mobileNumber: existingUser.mobileNo,
            aadharNumber: existingUser.aadharDetails?.aadhaarNumber || '829763289274',
            panNumber: existingUser.panDetails?.data?.pan_number || existingCompany.companyPan,
            merchantLoginId: existingAepsOnboarding.merchantLoginId,
        }
        const bankKycSendOtpResponse = await asl.aslAepsBankKycSendOtp(payload);

        // Store Bank KYC OTP reference & hash from latest response
        // ASL sometimes returns key as `otpReferneceId` (note the spelling) inside `data`
        const bankKycOtpRef =
            bankKycSendOtpResponse?.otpReferneceId ||
            bankKycSendOtpResponse?.data?.otpReferneceId ||
            bankKycSendOtpResponse?.otpReferenceId ||
            bankKycSendOtpResponse?.data?.otpReferenceId;
        const bankKycHash =
            bankKycSendOtpResponse?.hash ||
            bankKycSendOtpResponse?.data?.hash;

        if (bankKycOtpRef || bankKycHash) {
            const updateData = {};
            if (bankKycOtpRef) {
                // Save specifically for Bank KYC and also as generic otpReferenceId fallback
                updateData.bankKycOtpReferenceId = bankKycOtpRef;
                updateData.otpReferenceId = bankKycOtpRef;
            }
            if (bankKycHash) {
                // Overwrite hash with latest Bank KYC hash so subsequent calls use correct value
                updateData.hash = bankKycHash;
            }

            await dbService.update(
                model.aepsOnboarding,
                { id: existingAepsOnboarding.id },
                updateData
            );
        }

        return res.success({
            message: 'Bank KYC send OTP successful',
            data: bankKycSendOtpResponse
        });
    } catch (error) {
        console.error('Bank KYC send OTP error', error);
        return res.failure({ message: error.message || 'Unable to send Bank KYC OTP' });
    }
}

const bankKycValidateOtp = async (req, res) => {
    try {
        const { otp } = req.body;

        if (!otp) {
            return res.failure({ message: 'OTP is required' });
        }

        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
            userId: req.user.id,
            companyId: req.user.companyId,
            merchantStatus: true
        });
        if (!existingAepsOnboarding) {
            return res.failure({ message: 'AEPS onboarding not found' });
        }

        // Validate that eKYC biometric is completed
        if (!existingAepsOnboarding.isBioMetricValidated) {
            return res.failure({ message: 'Please complete eKYC biometric verification before bank eKYC' });
        }

        if (existingAepsOnboarding.isBankKycOtpValidated) {
            return res.failure({ message: 'Bank eKYC OTP already validated' });
        }
        const payload = {
            uniqueID: existingAepsOnboarding.uniqueID,
            aadhaarNo: existingUser.aadharDetails?.aadhaarNumber || '829763289274',
            otpReferenceID: existingAepsOnboarding.bankKycOtpReferenceId || existingAepsOnboarding.otpReferenceId,
            hash: existingAepsOnboarding.hash,
            merchantLoginId: existingAepsOnboarding.merchantLoginId,
            otp: otp
        }
        console.log('payload', payload);
        const bankKycValidateOtpResponse = await asl.aslAepsBankKycValidateOtp(payload);

        const status = bankKycValidateOtpResponse?.status ? String(bankKycValidateOtpResponse.status).toUpperCase() : null;
        const nestedStatus = bankKycValidateOtpResponse?.data?.status ? String(bankKycValidateOtpResponse.data.status).toUpperCase() : null;

        if (status === 'SUCCESS' || nestedStatus === 'SUCCESS') {
            await dbService.update(
                model.aepsOnboarding,
                { id: existingAepsOnboarding.id },
                { isBankKycOtpValidated: true }
            );
            return res.success({
                message: 'Bank KYC validate OTP successful',
                data: bankKycValidateOtpResponse
            });
        }

        return res.failure({
            message: bankKycValidateOtpResponse?.message || bankKycValidateOtpResponse?.data?.message || 'Bank KYC OTP validation failed',
            data: bankKycValidateOtpResponse
        });
    } catch (error) {
        console.error('Bank KYC validate OTP error', error);
        return res.failure({ message: error.message || 'Unable to process Bank KYC OTP validation' });
    }
}

const bankKycBiometricValidate = async (req, res) => {
    try {
        const { biometricData } = req.body;
        let { captureType } = req.body;

        if (!biometricData) {
            return res.failure({ message: 'Biometric data is required' });
        }

        captureType = captureType ? String(captureType).trim().toUpperCase() : null;
        if (!captureType || !['FACE', 'FINGER'].includes(captureType)) {
            return res.failure({ message: 'Invalid capture type. Allowed values are FACE or FINGER' });
        }

        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
            userId: req.user.id,
            companyId: req.user.companyId,
            merchantStatus: true
        });
        if (!existingAepsOnboarding) {
            return res.failure({ message: 'AEPS onboarding not found' });
        }

        // Validate that bank eKYC OTP is completed
        if (!existingAepsOnboarding.isBankKycOtpValidated) {
            return res.failure({ message: 'Please complete bank eKYC OTP validation before biometric verification' });
        }

        if (existingAepsOnboarding.isBankKycBiometricValidated) {
            return res.failure({ message: 'Bank eKYC biometric already validated' });
        }

        // Validate that biometricData is a string (PID XML)
        if (typeof biometricData !== 'string' || biometricData.trim() === '') {
            return res.failure({ message: 'Biometric data must be a valid PID XML string' });
        }

        const formattedBiometricData = biometricData.trim();

        const payload = {
            uniqueID: existingAepsOnboarding.uniqueID,
            aadhaarNo: existingUser.aadharDetails?.aadhaarNumber || '829763289274',
            otpReferenceID: existingAepsOnboarding.bankKycOtpReferenceId || existingAepsOnboarding.otpReferenceId,
            otp: existingAepsOnboarding.otp,
            hash: existingAepsOnboarding.hash,
            merchantLoginId: existingAepsOnboarding.merchantLoginId,
            captureType: captureType,
            biometricData: formattedBiometricData
        }
        const bankKycBiometricValidateResponse = await asl.aslAepsBankKycBiometricValidate(payload);

        const status = bankKycBiometricValidateResponse?.status ? String(bankKycBiometricValidateResponse.status).toUpperCase() : null;
        const nestedStatus = bankKycBiometricValidateResponse?.data?.status ? String(bankKycBiometricValidateResponse.data.status).toUpperCase() : null;

        // Store biometric attempt in bioMetric table
        const normalizedStatus = status || nestedStatus;
        const sanitizedRequestPayload = {
            uniqueID: payload.uniqueID,
            aadhaarNo: payload.aadhaarNo,
            otpReferenceID: payload.otpReferenceID,
            hash: payload.hash,
            merchantLoginId: payload.merchantLoginId,
            captureType: captureType
        };

        await dbService.createOne(model.bioMetric, {
            refId: existingUser.id,
            companyId: existingUser.companyId,
            captureType,
            status: normalizedStatus,
            responseMessage: bankKycBiometricValidateResponse?.message || bankKycBiometricValidateResponse?.data?.message,
            transactionId: bankKycBiometricValidateResponse?.data?.aslTransactionId || bankKycBiometricValidateResponse?.data?.reqId,
            rrn: bankKycBiometricValidateResponse?.data?.rrn,
            aadhaarNumber: bankKycBiometricValidateResponse?.data?.aadharNumber,
            authCode: bankKycBiometricValidateResponse?.data?.authCode,
            requestPayload: sanitizedRequestPayload,
            responsePayload: bankKycBiometricValidateResponse,
            addedBy: req.user.id,
            updatedBy: req.user.id
        });

        if (status === 'SUCCESS' || nestedStatus === 'SUCCESS') {
            // Update onboarding status to COMPLETED if all steps are done
            const isAllCompleted = existingAepsOnboarding.merchantStatus &&
                existingAepsOnboarding.isOtpValidated &&
                existingAepsOnboarding.isBioMetricValidated &&
                existingAepsOnboarding.isBankKycOtpValidated;
            const onboardingStatus = isAllCompleted ? 'COMPLETED' : 'PENDING';

            await dbService.update(
                model.aepsOnboarding,
                { id: existingAepsOnboarding.id },
                { isBankKycBiometricValidated: true, onboardingStatus }
            );
            return res.success({
                message: 'Bank KYC biometric validate successful',
                data: bankKycBiometricValidateResponse
            });
        }

        return res.failure({
            message: bankKycBiometricValidateResponse?.message || bankKycBiometricValidateResponse?.data?.message || 'Bank KYC biometric validation failed',
            data: bankKycBiometricValidateResponse
        });
    } catch (error) {
        console.error('Bank KYC biometric validate error', error);
        return res.failure({ message: error.message || 'Unable to process Bank KYC biometric validation' });
    }
}

const aeps2FaAuthentication = async (req, res) => {
    try {
        const { biometricData } = req.body;
        let { captureType } = req.body;
        if (!biometricData) {
            return res.failure({ message: 'Biometric data is required' });
        }
        captureType = captureType ? String(captureType).trim().toUpperCase() : null;
        if (!captureType || !['FACE', 'FINGER'].includes(captureType)) {
            return res.failure({ message: 'Invalid capture type. Allowed values are FACE or FINGER' });
        }
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
            userId: req.user.id,
            companyId: req.user.companyId,
            merchantStatus: true
        });

        if (!existingAepsOnboarding) {
            return res.failure({ message: 'AEPS onboarding not found' });
        }

        // Validate that bank eKYC biometric is completed before 2FA
        if (!existingAepsOnboarding.isBankKycBiometricValidated) {
            return res.failure({ message: 'Please complete bank eKYC biometric verification before 2FA authentication' });
        }

        const existingBioMetric = await dbService.findOne(model.bioMetric, {
            refId: req.user.id,
            companyId: req.user.companyId,
            captureType: captureType
        });

        if (!existingBioMetric) {
            return res.failure({ message: 'Biometric data is required' });
        }

        // Daily login tracking - logout previous day sessions
        await aepsDailyLoginService.logoutPreviousDaySessions(req.user.id, req.user.companyId);

        // Check if user already logged in today (IST date) - DB read in controller
        const todayDateStr = aepsDailyLoginService.getIndianDateOnly();
        const existingDailyLogin = await dbService.findOne(model.aepsDailyLogin, {
            refId: req.user.id,
            companyId: req.user.companyId,
            loginDate: todayDateStr
        });

        if (existingDailyLogin) {
            const data = {
                status: 'used',
                loginDate: todayDateStr,
                nextEligibleAt: aepsDailyLoginService.getNextMidnightIST()?.toISOString?.() || null
            }
            return res.success({ message: 'Already logged in today. You can login again after midnight (IST).', data });
        }

        // Fetch company to get company name for transaction ID generation
        const existingCompany = await dbService.findOne(model.company, { id: req.user.companyId });
        const generatedTxnId = generateTransactionID(existingCompany?.companyName);

        const payload = {
            uniqueID: existingAepsOnboarding.uniqueID,
            type: 'DAILY_LOGIN',
            aadhaarNo: existingUser.aadharDetails?.aadhaarNumber || '829763289274',
            serviceType: "CashDeposit",
            latitude: existingUser.latitude,
            longitude: existingUser.longitude,
            transactionId: generatedTxnId,
            captureType: captureType,
            biometricData: biometricData,
            merchantLoginId: existingAepsOnboarding.merchantLoginId
        }
        const aepsResponse = await asl.aslAeps2FA(payload);
        console.log('aepsResponse', aepsResponse);

        // Parse response if it's a string (handles trailing commas and newlines)
        let parsedResponse = aepsResponse;
        if (typeof aepsResponse === 'string') {
            try {
                let cleanedResponse = aepsResponse.trim()
                    .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
                    .replace(/\\r\\n/g, '')
                    .replace(/\\n/g, '')
                    .replace(/\s+/g, ' ');
                parsedResponse = JSON.parse(cleanedResponse);
            } catch (e) {
                // Fallback: extract JSON from string
                const jsonMatch = aepsResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        let jsonStr = jsonMatch[0]
                            .replace(/,(\s*[}\]])/g, '$1')
                            .replace(/\\r\\n/g, '')
                            .replace(/\\n/g, '')
                            .replace(/\s+/g, ' ');
                        parsedResponse = JSON.parse(jsonStr);
                    } catch (parseError) {
                        console.error('Failed to parse aepsResponse:', parseError.message);
                    }
                }
            }
        }

        // Extract success indicators
        const status = parsedResponse?.status ? String(parsedResponse.status).toUpperCase() : null;
        const nestedStatus = parsedResponse?.data?.status ? String(parsedResponse.data.status).toUpperCase() : null;
        const responseCode = parsedResponse?.data?.responseCode;
        const responseMessage = parsedResponse?.data?.responseMessage;

        // Check for success
        const isSuccess = status === 'SUCCESS' ||
            nestedStatus === 'SUCCESS' ||
            responseCode === '00' ||
            (responseMessage && responseMessage.toLowerCase().includes('completed'));

        if (isSuccess) {
            // Create daily login record in database - done in controller
            const newLoginTime = new Date();
            const logoutTime = aepsDailyLoginService.getNextMidnightIST();

            await dbService.createOne(model.aepsDailyLogin, {
                refId: req.user.id,
                companyId: req.user.companyId,
                loginTime: newLoginTime,
                logoutTime: logoutTime,
                loginDate: todayDateStr,
                isLoggedIn: true,
                addedBy: req.user.id,
                updatedBy: req.user.id
            });

            return res.success({ message: 'AEPS 2FA authentication successful', data: parsedResponse });
        }

        return res.failure({
            message: parsedResponse?.message || parsedResponse?.data?.message || 'AEPS 2FA authentication failed',
            data: parsedResponse
        });
    }
    catch (error) {
        console.error('AEPS 2FA authentication error', error);
        return res.failure({ message: error.message || 'Unable to process AEPS 2FA authentication' });
    }
}

const recentBanks = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        // Get all AEPS transactions for this user, ordered by most recent first
        const aepsTransactions = await dbService.findAll(model.aepsHistory, {
            refId: req.user.id,
            companyId: req.user.companyId,
            bankiin: { [Op.ne]: null }
        }, {
            attributes: ['bankiin', 'createdAt'],
            sort: { createdAt: -1 }
        });

        // Extract unique bankIINs (first occurrence = most recent)
        const uniqueBankIINs = [];
        const seenBankIINs = new Set();

        for (const txn of aepsTransactions) {
            const bankIIN = txn.bankiin ? String(txn.bankiin).trim() : null;
            if (bankIIN && !seenBankIINs.has(bankIIN)) {
                seenBankIINs.add(bankIIN);
                uniqueBankIINs.push(bankIIN);
                // Stop once we have 4 unique banks
                if (uniqueBankIINs.length >= 4) break;
            }
        }

        // If no recent transactions, return empty array
        if (uniqueBankIINs.length === 0) {
            return res.success({
                message: 'Recent banks retrieved successfully',
                data: []
            });
        }

        // Get bank details from aslBankList
        const banks = await dbService.findAll(model.aslBankList, {
            bankIIN: { [Op.in]: uniqueBankIINs },
            isDeleted: false,
            isActive: true
        });

        // Map to response format with CDN URLs for logos, maintaining order
        const bankMap = new Map();
        banks.forEach(bank => {
            const bankData = bank.toJSON ? bank.toJSON() : bank;
            bankMap.set(bankData.bankIIN, {
                bankIIN: bankData.bankIIN,
                bankName: bankData.bankName,
                bankLogo: imageService.getImageUrl(bankData.bankLogo, false)
            });
        });

        // Return banks in the order they appeared (most recent first)
        const recentBanksData = uniqueBankIINs
            .map(bankIIN => bankMap.get(bankIIN))
            .filter(Boolean); // Remove any nulls if bank not found

        return res.success({
            message: 'Recent banks retrieved successfully',
            data: recentBanksData
        });
    } catch (error) {
        console.error('Recent banks error', error);
        return res.failure({ message: error.message || 'Unable to retrieve recent banks' });
    }
};

const processBankData = (data) => {
    if (!data) return data;
    if (Array.isArray(data)) {
        return data.map(record => processBankData(record));
    }
    const processed = { ...data.dataValues || data };
    if (processed.bankLogo) {
        try {
            processed.bankLogo = imageService.getImageUrl(processed.bankLogo, false);
        } catch (e) {
            processed.bankLogo = null;
        }
    }
    return processed;
};

const getAllBankDetails = async (req, res) => {
    try {
        const dataToFind = req.body || {};
        let options = {};
        let query = {
            isActive: true,
            isDeleted: false
        };

        // Build query from request body
        if (dataToFind && dataToFind.query) {
            query = { ...query, ...dataToFind.query };
        }

        // Handle options (pagination, sorting)
        if (dataToFind && dataToFind.options !== undefined) {
            options = { ...dataToFind.options };
        }

        // Set default pagination if not provided
        if (!options.paginate) {
            options.paginate = 10;
        }
        if (!options.page) {
            options.page = 1;
        }

        // Handle customSearch (iLike search on multiple fields)
        // Support: bankName, bankIIN
        if (dataToFind?.customSearch && typeof dataToFind.customSearch === 'object') {
            const keys = Object.keys(dataToFind.customSearch);
            const searchOrConditions = [];

            for (const key of keys) {
                const value = dataToFind.customSearch[key];
                if (value === undefined || value === null || String(value).trim() === '') continue;

                if (key === 'bankName' || key === 'bankIIN') {
                    // Direct field search in aslBankList table
                    searchOrConditions.push({
                        [key]: {
                            [Op.iLike]: `%${String(value).trim()}%`
                        }
                    });
                }
            }

            if (searchOrConditions.length > 0) {
                // Combine all search conditions with OR (if multiple) and then AND with base query
                if (searchOrConditions.length === 1) {
                    // Single condition - add directly to query (will be ANDed with base conditions)
                    Object.assign(query, searchOrConditions[0]);
                } else {
                    // Multiple conditions - combine with OR, then AND with base query
                    query[Op.and] = [
                        { [Op.or]: searchOrConditions }
                    ];
                }
            }
        }

        // Use paginate for consistent pagination response
        const result = await dbService.paginate(model.aslBankList, query, options);

        // Process data to add CDN URLs for bank logos
        const processedData = processBankData(result?.data || []);

        return res.status(200).json({
            message: 'All bank details retrieved successfully',
            data: processedData,
            total: result?.total || 0,
            paginator: result?.paginator || {
                page: options.page || 1,
                paginate: options.paginate || 10,
                totalPages: 0
            }
        });

    } catch (error) {
        console.error('Get all bank details error', error);
        return res.failure({ message: error.message || 'Unable to retrieve all bank details' });
    }
}

const aepsTransactionHistory = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId,
            isActive: true
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        const userRole = existingUser.userRole;
        const userId = existingUser.id;
        const companyId = existingUser.companyId;

        // Only userRole 3, 4, 5 can access this endpoint
        if (![3, 4, 5].includes(userRole)) {
            return res.failure({ message: 'Access denied. Only Master Distributor, Distributor, and Retailer can access transaction history.' });
        }

        const dataToFind = req.body || {};
        let options = {};
        let query = { companyId: companyId };

        // Role-based refId filtering
        if (userRole === 4 || userRole === 5) {
            query.refId = userId;
            query.companyId = companyId;
        } else if (userRole === 3) {
            // Master Distributor (3): Their own transactions + transactions of users reporting to them
            const reportingUsers = await dbService.findAll(model.user, {
                reportingTo: userId,
                companyId: companyId,
                isDeleted: false,
                userRole: { [Op.in]: [4, 5] } // Only distributors and retailers reporting to master distributor
            }, {
                attributes: ['id']
            });
            const reportingUserIds = reportingUsers.map(user => user.id);
            query.refId = { [Op.in]: [userId, ...reportingUserIds] };
        }

        // Build query from request body
        if (dataToFind && dataToFind.query) {
            query = { ...query, ...dataToFind.query };
        }

        // Handle options (pagination, sorting)
        if (dataToFind && dataToFind.options !== undefined) {
            options = { ...dataToFind.options };
        }

        // Handle customSearch (iLike search on multiple fields)
        if (dataToFind?.customSearch && typeof dataToFind.customSearch === 'object') {
            const keys = Object.keys(dataToFind.customSearch);
            const orConditions = [];

            keys.forEach((key) => {
                const value = dataToFind.customSearch[key];
                if (value === undefined || value === null || String(value).trim() === '') return;

                orConditions.push({
                    [key]: {
                        [Op.iLike]: `%${String(value).trim()}%`
                    }
                });
            });

            if (orConditions.length > 0) {
                query = {
                    ...query,
                    [Op.or]: orConditions
                };
            }
        }

        // Use paginate for consistent pagination response
        const result = await dbService.paginate(model.aepsHistory, query, options);

        return res.success({
            message: 'AEPS transaction history retrieved successfully',
            data: result?.data || [],
            total: result?.total || 0,
            paginator: result?.paginator
        });
    } catch (error) {
        console.error('AEPS transaction history error', error);
        return res.failure({ message: error.message || 'Unable to retrieve AEPS transaction history' });
    }
}

module.exports = {
    getOnboardingStatus,
    aepsOnboarding,
    validateAgentOtp,
    resendAgentOtp,
    bioMetricVerification,
    bankKycSendOtp,
    bankKycValidateOtp,
    bankKycBiometricValidate,
    aeps2FaAuthentication,
    aepsTransaction,
    checkStatus,
    recentBanks,
    getAllBankDetails,
    aepsTransactionHistory
};