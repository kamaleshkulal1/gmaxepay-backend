const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const { doubleEncrypt, decrypt } = require('../../../utils/doubleCheckUp');
const { generateTransactionID } = require('../../../utils/transactionID');
const ekycHub = require('../../../services/eKycHub');
const razorpayApi = require('../../../services/razorpayApi');
const { Op } = require('sequelize');

const round2 = (num) => {
    return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
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

const addCustomerBank = async (req, res) => {
    try {
        const { account_number, ifsc, isPayout, isFundTransfer } = req.body;
        const key = process.env.AES_KEY;

        // 1. Initial Checks & Validation
        if (![3, 4, 5].includes(req.user.userRole)) {
            return res.failure({ message: 'You are not authorized to add bank details' });
        }

        if (!account_number || !ifsc) {
            return res.validationError({
                message: !account_number ? 'Account number is required' : 'IFSC is required'
            });
        }

        const MAX_BANKS = 5;
        let existingBanks = await dbService.findAll(
            model.customerBank,
            {
                refId: req.user.id,
                companyId: req.user.companyId,
                isActive: true
            }
        );

        let duplicateBank = null;
        if (isPayout) {
            duplicateBank = existingBanks.find(
                bank => bank.accountNumber === account_number && bank.ifsc === ifsc && bank.isPayout === true
            );
        }

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

        // 2. Commercial Logic - Margin Based (Calculated BEFORE API call)
        // Same logic as Payout Controller refactor

        let commData = {
            isValid: false,
            role: req.user.userRole,
            users: {},
            wallets: {},
            slabs: {},
            amounts: {
                saBankCharge: 0,
                distSurcharge: 0,
                mdSurcharge: 0,
                companySurcharge: 0,
                adminSurcharge: 0,
                retailerSurcharge: 0,
                wlShortfall: 0,
                mdShortfall: 0,
                distShortfall: 0
            },
            scenario: null
        };

        // Fetch Common Users
        const [companyAdmin, superAdmin] = await Promise.all([
            dbService.findOne(model.user, { companyId: req.user.companyId, userRole: 2, isActive: true }),
            dbService.findOne(model.user, { id: 1, companyId: 1, userRole: 1, isActive: true })
        ]);

        if (!companyAdmin) return res.failure({ message: 'Company admin not found' });
        if (!superAdmin) return res.failure({ message: 'Super admin not found' });

        commData.users.companyAdmin = companyAdmin;
        commData.users.superAdmin = superAdmin;

        // Fetch Common Wallets
        const [companyWallet, superAdminWallet] = await Promise.all([
            dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: req.user.companyId }),
            dbService.findOne(model.wallet, { refId: 1, companyId: 1 })
        ]);

        commData.wallets.companyWallet = companyWallet;
        commData.wallets.superAdminWallet = superAdminWallet;

        // Fetch Payout Operator (Bank Verification)
        const payoutOperator = await dbService.findOne(model.operator, {
            operatorType: 'BANK VERIFICATION',
            isActive: true
        });

        if (payoutOperator) {
            commData.payoutOperator = payoutOperator;
            // Calculate SA Bank Charge (Cost)
            // Assuming Bank Verification is a Fixed Charge. Pass 0 as baseAmount.
            commData.amounts.saBankCharge = calcSlabAmount(payoutOperator, 0);
        }

        // Identify Current User & Wallet
        const currentUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId, isActive: true });
        const currentUserWallet = await dbService.findOne(model.wallet, { refId: req.user.id, companyId: req.user.companyId });

        if (!currentUser) return res.failure({ message: 'User not found' });
        if (!currentUserWallet) return res.failure({ message: 'User wallet not found' });

        // Logic branching based on role
        if (req.user.userRole === 3) {
            // Master Distributor logic
            commData.users.masterDistributor = currentUser;
            commData.wallets.masterDistributorWallet = currentUserWallet;
            commData.scenario = 'MD_DIRECT';

            const [SuperAdminSlabComm, companySlabComm] = await Promise.all([
                dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorType: 'BANK VERIFICATION' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: companyAdmin.id, operatorType: 'BANK VERIFICATION' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
            ]);

            commData.slabs.mdSlab = companySlabComm?.find(c => (c.roleType === 3 || c.roleName === 'MD'));
            commData.slabs.companySlab = companySlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));

            // SA->WL Slab
            const saToWlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
            const mdSlab = commData.slabs.mdSlab;

            const saToWlAmount = saToWlSlab ? calcSlabAmount(saToWlSlab, 0) : 0;
            const mdSlabAmount = mdSlab ? calcSlabAmount(mdSlab, 0) : 0;

            commData.amounts.adminSurcharge = saToWlAmount;
            commData.amounts.companySurcharge = Math.max(0, mdSlabAmount - saToWlAmount);
            commData.amounts.mdSurcharge = mdSlabAmount;

            if (saToWlAmount > mdSlabAmount) {
                commData.amounts.wlShortfall = parseFloat((saToWlAmount - mdSlabAmount).toFixed(2));
            }

        } else if (req.user.userRole === 4) {
            // Distributor Logic
            commData.users.distributor = currentUser;
            commData.wallets.distributorWallet = currentUserWallet;

            if (currentUser.reportingTo === companyAdmin.id || currentUser.reportingTo === null) {
                // DIST_DIRECT
                commData.scenario = 'DIST_DIRECT';
                const [SuperAdminSlabComm, companySlabComm] = await Promise.all([
                    dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorType: 'BANK VERIFICATION' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                    dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: companyAdmin.id, operatorType: 'BANK VERIFICATION' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                ]);

                commData.slabs.distSlab = companySlabComm?.find(c => (c.roleType === 4 || c.roleName === 'DI'));

                const saToWlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
                const distSlab = commData.slabs.distSlab;

                const saToWlAmount = saToWlSlab ? calcSlabAmount(saToWlSlab, 0) : 0;
                const distSlabAmount = distSlab ? calcSlabAmount(distSlab, 0) : 0;

                commData.amounts.adminSurcharge = saToWlAmount;
                commData.amounts.companySurcharge = Math.max(0, distSlabAmount - saToWlAmount);
                commData.amounts.distSurcharge = distSlabAmount;

                if (saToWlAmount > distSlabAmount) {
                    commData.amounts.wlShortfall = parseFloat((saToWlAmount - distSlabAmount).toFixed(2));
                }

            } else {
                // DIST_MD
                commData.scenario = 'DIST_MD';
                const masterDistributor = await dbService.findOne(model.user, { id: currentUser.reportingTo, companyId: req.user.companyId, isActive: true });
                if (!masterDistributor) return res.failure({ message: 'Master distributor not found' });
                commData.users.masterDistributor = masterDistributor;
                commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: req.user.companyId });

                const [SuperAdminSlabComm, companySlabComm, masterDistributorComm] = await Promise.all([
                    dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorType: 'BANK VERIFICATION' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                    dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: companyAdmin.id, operatorType: 'BANK VERIFICATION' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                    dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: masterDistributor.id, operatorType: 'BANK VERIFICATION' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                ]);

                commData.slabs.distSlab = masterDistributorComm?.find(c => (c.roleType === 4 || c.roleName === 'DI'));
                const saToWlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
                const wlToMdSlab = companySlabComm?.find(c => (c.roleType === 3 || c.roleName === 'MD'));

                const saToWlAmount = saToWlSlab ? calcSlabAmount(saToWlSlab, 0) : 0;
                const wlToMdAmount = wlToMdSlab ? calcSlabAmount(wlToMdSlab, 0) : 0;
                const distSlabAmount = commData.slabs.distSlab ? calcSlabAmount(commData.slabs.distSlab, 0) : 0;

                commData.amounts.adminSurcharge = saToWlAmount;
                commData.amounts.companySurcharge = Math.max(0, wlToMdAmount - saToWlAmount);
                commData.amounts.mdSurcharge = Math.max(0, distSlabAmount - wlToMdAmount);
                commData.amounts.distSurcharge = distSlabAmount;

                if (saToWlAmount > wlToMdAmount) commData.amounts.wlShortfall = parseFloat((saToWlAmount - wlToMdAmount).toFixed(2));
                if (wlToMdAmount > distSlabAmount) commData.amounts.mdShortfall = parseFloat((wlToMdAmount - distSlabAmount).toFixed(2));
            }

        } else if (req.user.userRole === 5) {
            // Retailer Logic
            commData.users.retailer = currentUser;
            commData.wallets.retailerWallet = currentUserWallet;

            let reportingUser = null;
            if (currentUser.reportingTo && currentUser.reportingTo !== companyAdmin.id) {
                reportingUser = await dbService.findOne(model.user, { id: currentUser.reportingTo, companyId: req.user.companyId, isActive: true });
            }

            if (!reportingUser || currentUser.reportingTo === companyAdmin.id || currentUser.reportingTo === null) {
                // RET_DIRECT
                commData.scenario = 'RET_DIRECT';
                const [SuperAdminSlabComm, companySlabComm] = await Promise.all([
                    dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorType: 'BANK VERIFICATION' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                    dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: companyAdmin.id, operatorType: 'BANK VERIFICATION' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                ]);

                commData.slabs.retailerSlab = companySlabComm?.find(c => (c.roleType === 5 || c.roleName === 'RT'));
                const saToWlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));

                const saToWlAmount = saToWlSlab ? calcSlabAmount(saToWlSlab, 0) : 0;
                const retSlabAmount = commData.slabs.retailerSlab ? calcSlabAmount(commData.slabs.retailerSlab, 0) : 0;

                commData.amounts.adminSurcharge = saToWlAmount;
                commData.amounts.companySurcharge = Math.max(0, retSlabAmount - saToWlAmount);
                commData.amounts.retailerSurcharge = retSlabAmount;

                if (saToWlAmount > retSlabAmount) commData.amounts.wlShortfall = parseFloat((saToWlAmount - retSlabAmount).toFixed(2));

            } else if (reportingUser.userRole === 3) {
                // RET_MD
                commData.scenario = 'RET_MD';
                commData.users.masterDistributor = reportingUser;
                commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: reportingUser.id, companyId: req.user.companyId });
                const [SuperAdminSlabComm, companySlabComm, masterDistributorComm] = await Promise.all([
                    dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorType: 'BANK VERIFICATION' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                    dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: companyAdmin.id, operatorType: 'BANK VERIFICATION' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                    dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: reportingUser.id, operatorType: 'BANK VERIFICATION' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                ]);

                commData.slabs.retailerSlab = masterDistributorComm?.find(c => (c.roleType === 5 || c.roleName === 'RT'));
                const saToWlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
                const wlToMdSlab = companySlabComm?.find(c => (c.roleType === 3 || c.roleName === 'MD'));

                const saToWlAmount = saToWlSlab ? calcSlabAmount(saToWlSlab, 0) : 0;
                const wlToMdAmount = wlToMdSlab ? calcSlabAmount(wlToMdSlab, 0) : 0;
                const retSlabAmount = commData.slabs.retailerSlab ? calcSlabAmount(commData.slabs.retailerSlab, 0) : 0;

                commData.amounts.adminSurcharge = saToWlAmount;
                commData.amounts.companySurcharge = Math.max(0, wlToMdAmount - saToWlAmount);
                commData.amounts.mdSurcharge = Math.max(0, retSlabAmount - wlToMdAmount);
                commData.amounts.retailerSurcharge = retSlabAmount;

                if (saToWlAmount > wlToMdAmount) commData.amounts.wlShortfall = parseFloat((saToWlAmount - wlToMdAmount).toFixed(2));
                if (wlToMdAmount > retSlabAmount) commData.amounts.mdShortfall = parseFloat((wlToMdAmount - retSlabAmount).toFixed(2));

            } else if (reportingUser.userRole === 4) {
                // Retailer reports to Dist.
                commData.users.distributor = reportingUser;
                commData.wallets.distributorWallet = await dbService.findOne(model.wallet, { refId: reportingUser.id, companyId: req.user.companyId });

                let masterDistributor = null;
                if (reportingUser.reportingTo && reportingUser.reportingTo !== companyAdmin.id) {
                    masterDistributor = await dbService.findOne(model.user, { id: reportingUser.reportingTo, companyId: req.user.companyId, isActive: true });
                }

                if (masterDistributor && masterDistributor.userRole === 3) {
                    // RET_DIST_MD
                    commData.scenario = 'RET_DIST_MD';
                    commData.users.masterDistributor = masterDistributor;
                    commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: req.user.companyId });

                    const [SuperAdminSlabComm, companySlabComm, masterDistributorComm, distributorComm] = await Promise.all([
                        dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorType: 'BANK VERIFICATION' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                        dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: companyAdmin.id, operatorType: 'BANK VERIFICATION' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                        dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: masterDistributor.id, operatorType: 'BANK VERIFICATION' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                        dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: reportingUser.id, operatorType: 'BANK VERIFICATION' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                    ]);

                    commData.slabs.retailerSlab = distributorComm?.find(c => (c.roleType === 5 || c.roleName === 'RT'));
                    const saToWlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
                    const wlToMdSlab = companySlabComm?.find(c => (c.roleType === 3 || c.roleName === 'MD'));
                    const mdToDistSlab = masterDistributorComm?.find(c => (c.roleType === 4 || c.roleName === 'DI'));

                    const saToWlAmount = saToWlSlab ? calcSlabAmount(saToWlSlab, 0) : 0;
                    const wlToMdAmount = wlToMdSlab ? calcSlabAmount(wlToMdSlab, 0) : 0;
                    const mdToDistAmount = mdToDistSlab ? calcSlabAmount(mdToDistSlab, 0) : 0;
                    const retSlabAmount = commData.slabs.retailerSlab ? calcSlabAmount(commData.slabs.retailerSlab, 0) : 0;

                    commData.amounts.adminSurcharge = saToWlAmount;
                    commData.amounts.companySurcharge = Math.max(0, wlToMdAmount - saToWlAmount);
                    commData.amounts.mdSurcharge = Math.max(0, mdToDistAmount - wlToMdAmount);
                    commData.amounts.distSurcharge = Math.max(0, retSlabAmount - mdToDistAmount);
                    commData.amounts.retailerSurcharge = retSlabAmount;

                    if (saToWlAmount > wlToMdAmount) commData.amounts.wlShortfall = parseFloat((saToWlAmount - wlToMdAmount).toFixed(2));
                    if (wlToMdAmount > mdToDistAmount) commData.amounts.mdShortfall = parseFloat((wlToMdAmount - mdToDistAmount).toFixed(2));
                    if (mdToDistAmount > retSlabAmount) commData.amounts.distShortfall = parseFloat((mdToDistAmount - retSlabAmount).toFixed(2));

                } else {
                    // RET_DIST_CO
                    commData.scenario = 'RET_DIST_CO';
                    const [SuperAdminSlabComm, companySlabComm, distributorComm] = await Promise.all([
                        dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorType: 'BANK VERIFICATION' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                        dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: companyAdmin.id, operatorType: 'BANK VERIFICATION' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                        dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: reportingUser.id, operatorType: 'BANK VERIFICATION' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                    ]);

                    commData.slabs.retailerSlab = distributorComm?.find(c => (c.roleType === 5 || c.roleName === 'RT'));
                    const saToWlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
                    const wlToDistSlab = companySlabComm?.find(c => (c.roleType === 4 || c.roleName === 'DI'));

                    const saToWlAmount = saToWlSlab ? calcSlabAmount(saToWlSlab, 0) : 0;
                    const wlToDistAmount = wlToDistSlab ? calcSlabAmount(wlToDistSlab, 0) : 0;
                    const retSlabAmount = commData.slabs.retailerSlab ? calcSlabAmount(commData.slabs.retailerSlab, 0) : 0;

                    commData.amounts.adminSurcharge = saToWlAmount;
                    commData.amounts.companySurcharge = Math.max(0, wlToDistAmount - saToWlAmount);
                    commData.amounts.distSurcharge = Math.max(0, retSlabAmount - wlToDistAmount);
                    commData.amounts.retailerSurcharge = retSlabAmount;

                    if (saToWlAmount > wlToDistAmount) commData.amounts.wlShortfall = parseFloat((saToWlAmount - wlToDistAmount).toFixed(2));
                    if (wlToDistAmount > retSlabAmount) commData.amounts.distShortfall = parseFloat((wlToDistAmount - retSlabAmount).toFixed(2));

                }
            }
        }

        // 3. Balance Validation (Fail Fast)
        let userDebit = 0;
        if (req.user.userRole === 3) userDebit = commData.amounts.mdSurcharge;
        if (req.user.userRole === 4) userDebit = commData.amounts.distSurcharge;
        if (req.user.userRole === 5) userDebit = commData.amounts.retailerSurcharge;

        if (userDebit <= 0) {
            return res.failure({ message: 'Invalid surcharge configuration' });
        }

        const userBalance = parseFloat(currentUserWallet.mainWallet || 0);
        if (userBalance < userDebit) {
            return res.failure({ message: `Insufficient wallet balance. Required: ${userDebit}, Available: ${userBalance}` });
        }

        // Calculate Surplus (if User Debit > Total Upstream Income)
        let totalIncome = commData.amounts.adminSurcharge + commData.amounts.companySurcharge;
        if (commData.users.masterDistributor && req.user.userRole !== 3) totalIncome += commData.amounts.mdSurcharge;
        if (commData.users.distributor && req.user.userRole === 5) totalIncome += commData.amounts.distSurcharge;

        const surplus = userDebit - totalIncome;
        if (surplus > 0) {
            commData.amounts.adminSurcharge += surplus;
        }

        // 4. Bank Verification (API Call) - Only proceeds if balance is sufficient
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
                            return decryptedResponse ? JSON.parse(decryptedResponse) : null;
                        }
                        return JSON.parse(existingBank.response);
                    } catch (e) {
                        return null;
                    }
                }
                return null;
            })(),
            razorpayApi.bankDetails(ifsc).catch(() => null)
        ]);

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

        // 5. Final Execution (Wallet Updates)

        const companyDetails = await dbService.findOne(model.company, { id: req.user.companyId });
        const transactionId = generateTransactionID(companyDetails?.companyName || 'BANK_VERIFY');
        const operatorName = 'Bank Verification';
        const remarkText = 'Bank verification charge';
        const bankName = (razorpayBankData?.BANK) || bankVerification.bank_name || bankVerification.bankName || null;
        const beneficiaryName = bankVerification.nameAtBank || bankVerification.beneficiary_name || bankVerification.beneficiaryName || bankVerification['nameAtBank'] || null;

        // --- Wallet Updates ---

        // 1. Debit User
        const userNewBalance = parseFloat((userBalance - userDebit).toFixed(2));
        await dbService.update(model.wallet, { id: currentUserWallet.id }, { mainWallet: userNewBalance, updatedBy: req.user.id });
        await dbService.createOne(model.walletHistory, {
            refId: req.user.id,
            companyId: req.user.companyId,
            walletType: 'mainWallet',
            operator: operatorName,
            remark: remarkText,
            amount: userDebit,
            comm: 0,
            surcharge: userDebit,
            openingAmt: userBalance,
            closingAmt: userNewBalance,
            credit: 0,
            debit: userDebit,
            transactionId,
            paymentStatus: 'SUCCESS',
            beneficiaryName,
            beneficiaryAccountNumber: account_number,
            beneficiaryBankName: bankName,
            beneficiaryIfsc: ifsc,
            paymentMode: 'WALLET',
            addedBy: req.user.id,
            updatedBy: req.user.id
        });

        // 2. Credit Distributor (If applicable)
        if (commData.users.distributor && req.user.userRole === 5) {
            // Credit Margin
            if (commData.amounts.distSurcharge > 0) {
                const dWallet = commData.wallets.distributorWallet;
                const dBal = parseFloat(dWallet.mainWallet || 0);
                const dNewBal = parseFloat((dBal + commData.amounts.distSurcharge).toFixed(2));

                await dbService.update(model.wallet, { id: dWallet.id }, { mainWallet: dNewBal, updatedBy: commData.users.distributor.id });
                await dbService.createOne(model.walletHistory, {
                    refId: commData.users.distributor.id,
                    companyId: req.user.companyId,
                    walletType: 'mainWallet',
                    operator: operatorName,
                    remark: `${remarkText} - distributor commission`,
                    amount: commData.amounts.distSurcharge,
                    comm: commData.amounts.distSurcharge,
                    surcharge: 0,
                    openingAmt: dBal,
                    closingAmt: dNewBal,
                    credit: commData.amounts.distSurcharge,
                    debit: 0,
                    transactionId,
                    paymentStatus: 'SUCCESS',
                    paymentMode: 'WALLET',
                    addedBy: commData.users.distributor.id,
                    updatedBy: commData.users.distributor.id
                });
            }
            // Debit Shortfall
            if (commData.amounts.distShortfall > 0) {
                const dWallet = await dbService.findOne(model.wallet, { id: commData.wallets.distributorWallet.id }); // Re-fetch to be safe
                const dBal = parseFloat(dWallet.mainWallet || 0);
                const dNewBal = parseFloat((dBal - commData.amounts.distShortfall).toFixed(2));

                await dbService.update(model.wallet, { id: dWallet.id }, { mainWallet: dNewBal, updatedBy: commData.users.distributor.id });
                await dbService.createOne(model.walletHistory, {
                    refId: commData.users.distributor.id,
                    companyId: req.user.companyId,
                    walletType: 'mainWallet',
                    operator: operatorName,
                    remark: `${remarkText} - shortfall`,
                    amount: commData.amounts.distShortfall,
                    comm: 0,
                    surcharge: 0, // It's a penalty
                    openingAmt: dBal,
                    closingAmt: dNewBal,
                    credit: 0,
                    debit: commData.amounts.distShortfall,
                    transactionId,
                    paymentStatus: 'SUCCESS',
                    paymentMode: 'WALLET',
                    addedBy: commData.users.distributor.id,
                    updatedBy: commData.users.distributor.id
                });
            }
        }

        // 3. Credit Master Distributor (If applicable)
        if (commData.users.masterDistributor && req.user.userRole !== 3) {
            // Credit Margin
            if (commData.amounts.mdSurcharge > 0) {
                const mWallet = commData.wallets.masterDistributorWallet;
                const mBal = parseFloat(mWallet.mainWallet || 0);
                const mNewBal = parseFloat((mBal + commData.amounts.mdSurcharge).toFixed(2));

                await dbService.update(model.wallet, { id: mWallet.id }, { mainWallet: mNewBal, updatedBy: commData.users.masterDistributor.id });
                await dbService.createOne(model.walletHistory, {
                    refId: commData.users.masterDistributor.id,
                    companyId: req.user.companyId,
                    walletType: 'mainWallet',
                    operator: operatorName,
                    remark: `${remarkText} - master distributor commission`,
                    amount: commData.amounts.mdSurcharge,
                    comm: commData.amounts.mdSurcharge,
                    surcharge: 0,
                    openingAmt: mBal,
                    closingAmt: mNewBal,
                    credit: commData.amounts.mdSurcharge,
                    debit: 0,
                    transactionId,
                    paymentStatus: 'SUCCESS',
                    paymentMode: 'WALLET',
                    addedBy: commData.users.masterDistributor.id,
                    updatedBy: commData.users.masterDistributor.id
                });
            }
            // Debit Shortfall
            if (commData.amounts.mdShortfall > 0) {
                const mWallet = await dbService.findOne(model.wallet, { id: commData.wallets.masterDistributorWallet.id });
                const mBal = parseFloat(mWallet.mainWallet || 0);
                const mNewBal = parseFloat((mBal - commData.amounts.mdShortfall).toFixed(2));

                await dbService.update(model.wallet, { id: mWallet.id }, { mainWallet: mNewBal, updatedBy: commData.users.masterDistributor.id });
                await dbService.createOne(model.walletHistory, {
                    refId: commData.users.masterDistributor.id,
                    companyId: req.user.companyId,
                    walletType: 'mainWallet',
                    operator: operatorName,
                    remark: `${remarkText} - shortfall`,
                    amount: commData.amounts.mdShortfall,
                    comm: 0,
                    surcharge: 0,
                    openingAmt: mBal,
                    closingAmt: mNewBal,
                    credit: 0,
                    debit: commData.amounts.mdShortfall,
                    transactionId,
                    paymentStatus: 'SUCCESS',
                    paymentMode: 'WALLET',
                    addedBy: commData.users.masterDistributor.id,
                    updatedBy: commData.users.masterDistributor.id
                });
            }
        }

        // 4. Credit Company Admin
        const cWallet = commData.wallets.companyWallet;
        const cBal = parseFloat(cWallet.mainWallet || 0);
        let cCredit = commData.amounts.companySurcharge;
        // Company receives shortfalls from MD/Dist as Credit
        cCredit += (commData.amounts.mdShortfall || 0) + (commData.amounts.distShortfall || 0);

        const cNewBal = parseFloat((cBal + cCredit).toFixed(2));

        if (cCredit > 0) {
            await dbService.update(model.wallet, { id: cWallet.id }, { mainWallet: cNewBal, updatedBy: companyAdmin.id });
            await dbService.createOne(model.walletHistory, {
                refId: companyAdmin.id,
                companyId: req.user.companyId,
                walletType: 'mainWallet',
                operator: operatorName,
                remark: `${remarkText} - company commission`,
                amount: cCredit,
                comm: cCredit,
                surcharge: 0,
                openingAmt: cBal,
                closingAmt: cNewBal,
                credit: cCredit,
                debit: 0,
                transactionId,
                paymentStatus: 'SUCCESS',
                paymentMode: 'WALLET',
                addedBy: companyAdmin.id,
                updatedBy: companyAdmin.id
            });
        }

        // Debit Shortfall (Company pays to SuperAdmin)
        if (commData.amounts.wlShortfall > 0) {
            const cWalletLatest = await dbService.findOne(model.wallet, { id: cWallet.id });
            const cBalLatest = parseFloat(cWalletLatest.mainWallet || 0);
            const cNewBalLatest = parseFloat((cBalLatest - commData.amounts.wlShortfall).toFixed(2));

            await dbService.update(model.wallet, { id: cWallet.id }, { mainWallet: cNewBalLatest, updatedBy: companyAdmin.id });
            await dbService.createOne(model.walletHistory, {
                refId: companyAdmin.id,
                companyId: req.user.companyId,
                walletType: 'mainWallet',
                operator: operatorName,
                remark: `${remarkText} - shortfall`,
                amount: commData.amounts.wlShortfall,
                comm: 0,
                surcharge: 0,
                openingAmt: cBalLatest,
                closingAmt: cNewBalLatest,
                credit: 0,
                debit: commData.amounts.wlShortfall,
                transactionId,
                paymentStatus: 'SUCCESS',
                paymentMode: 'WALLET',
                addedBy: companyAdmin.id,
                updatedBy: companyAdmin.id
            });
        }

        // 5. Credit Super Admin
        // 5. Credit Super Admin (Net Income = Surcharge - Bank Charge)
        const saWallet = commData.wallets.superAdminWallet;
        const saBal = parseFloat(saWallet.mainWallet || 0);
        let saCredit = commData.amounts.adminSurcharge;
        saCredit += (commData.amounts.wlShortfall || 0);

        // Calculate Mid Balance (After Income)
        const saMid = parseFloat((saBal + saCredit).toFixed(2));

        // Calculate Final Balance (After Bank Charge Deduction)
        const saNewBal = parseFloat((saMid - commData.amounts.saBankCharge).toFixed(2));

        // Update Wallet ONCE with Final Balance
        await dbService.update(model.wallet, { id: commData.wallets.superAdminWallet.id }, { mainWallet: saNewBal, updatedBy: commData.users.superAdmin.id });

        if (saCredit > 0) {
            await dbService.createOne(model.walletHistory, {
                refId: superAdmin.id,
                companyId: 1,
                walletType: 'mainWallet',
                operator: operatorName,
                remark: `${remarkText} - admin commission`,
                amount: saCredit,
                comm: saCredit,
                surcharge: 0,
                openingAmt: saBal,
                closingAmt: saMid,
                credit: saCredit,
                debit: 0,
                transactionId,
                paymentStatus: 'SUCCESS',
                paymentMode: 'WALLET',
                addedBy: superAdmin.id,
                updatedBy: superAdmin.id
            });
        }

        // 6. Handle SA Bank Charge (Debit Super Admin) & Create SurRecords
        if (commData.amounts.saBankCharge > 0) {
            // Wallet Update already done in Step 5 (Net Calculation)

            const pOpName = commData.payoutOperator?.operatorName || 'Unknown';

            // History for Operator Charge
            await dbService.createOne(model.walletHistory, {
                refId: commData.users.superAdmin.id,
                companyId: 1,
                walletType: 'mainWallet',
                operator: operatorName,
                remark: `${remarkText} - operator charge`,
                amount: commData.amounts.saBankCharge,
                comm: 0,
                surcharge: 0,
                openingAmt: saMid,
                closingAmt: saNewBal,
                credit: 0,
                debit: commData.amounts.saBankCharge,
                transactionId,
                paymentStatus: 'SUCCESS',
                paymentMode: 'WALLET',
                addedBy: commData.users.superAdmin.id,
                updatedBy: commData.users.superAdmin.id
            });

            // SurRecords Entry
            await dbService.createOne(model.surRecords, {
                refId: commData.users.superAdmin.id,
                companyId: 1,
                transactionId: transactionId,
                amount: commData.amounts.saBankCharge,
                service: 'BANK VERIFICATION',
                operatorType: pOpName,
                addedBy: commData.users.superAdmin.id
            });
        }

        // Add Customer Bank
        const city = (razorpayBankData?.CITY) || bankVerification.city || null;
        const branch = (razorpayBankData?.BRANCH) || bankVerification.branch || null;

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
            isPrimary: false,
            isPayout: req.body.isPayout,
            isFundTransfer: req.body.isFundTransfer
        });

        return res.success({ message: 'Bank details added successfully', data: customerBank });

    } catch (error) {
        console.log('Add bank details error:', error);
        return res.internalServerError({ message: error && error.message ? error.message : 'Internal server error' });
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

const deleteCustomerBank = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const customerBank = await dbService.findOne(model.customerBank, {
            id: id,
            refId: user.id,
            companyId: user.companyId,
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

const getAllCustomerBanks = async (req, res) => {
    try {
        const user = req.user;

        const customerBanks = await dbService.findAll(
            model.customerBank,
            {
                refId: user.id,
                companyId: user.companyId,
                isActive: true
            }
        );

        return res.success({
            message: 'Customer banks retrieved successfully',
            data: customerBanks
        });

    } catch (error) {
        console.log('Get all customer banks error:', error);
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

const getPrimaryCustomerBank = async (req, res) => {
    try {
        const user = req.user;
        const customerBank = await dbService.findOne(
            model.customerBank,
            {
                refId: user.id,
                companyId: user.companyId,
                isActive: true,
                isPrimary: true
            }
        );

        if (!customerBank) {
            return res.success({
                message: 'Primary bank account not found', // Changed to success to avoid 404 on frontend if just checking
                data: null
            });
        }

        return res.success({
            message: 'Primary customer bank retrieved successfully',
            data: customerBank
        });

    } catch (error) {
        console.log('Get primary customer bank error:', error);
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

const updateCustomerBank = async (req, res) => {
    try {
        if (![3, 4, 5].includes(req.user.userRole)) {
            return res.failure({ message: 'You are not authorized to update bank details' });
        }
        const { id } = req.params;
        const { isActive, isPayout } = req.body;
        const user = req.user;

        const customerBank = await dbService.findOne(model.customerBank, {
            id: id,
            refId: user.id,
            companyId: user.companyId
        });

        if (!customerBank) {
            return res.notFound({ message: 'Customer bank not found' });
        }

        const updateData = {};
        if (isActive !== undefined) updateData.isActive = isActive;
        if (isPayout !== undefined) updateData.isPayout = isPayout;

        if (Object.keys(updateData).length === 0) {
            return res.failure({ message: 'No fields to update' });
        }

        await dbService.update(model.customerBank, {
            id: id,
            refId: user.id,
            companyId: user.companyId
        }, updateData);

        return res.success({ message: 'Bank details updated successfully' });

    } catch (error) {
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

module.exports = {
    getAllCustomerBanks,
    getPrimaryCustomerBank,
    getCustomerBankById,
    addCustomerBank,
    deleteCustomerBank,
    updateCustomerBank
};
