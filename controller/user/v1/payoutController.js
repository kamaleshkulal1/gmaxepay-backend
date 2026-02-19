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
        if (![3, 4, 5].includes(req.user.userRole)) {
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
        console.log('Request Details:', {
            userId: user.id,
            role: user.userRole,
            amount,
            mode,
            aepsType,
            paymentMode
        });

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
        console.log('Wallet Type:', walletType);

        // Parallel fetch: company and wallet
        const [company, wallet] = await Promise.all([
            dbService.findOne(model.company, { id: user.companyId }),
            dbService.findOne(model.wallet, { refId: user.id, companyId: user.companyId })
        ]);

        if (!company) return res.failure({ message: 'Company not found' });
        if (!wallet) return res.failure({ message: 'Wallet not found' });

        // Check AEPS wallet balance based on type
        const currentAepsBalance = parseFloat(wallet[walletType] || 0);
        console.log(`Current ${normalizedAepsType} Balance:`, currentAepsBalance);

        if (currentAepsBalance < payoutAmount) {
            console.log('Insufficient Main Balance Check Failed');
            return res.failure({
                message: `Insufficient ${normalizedAepsType} wallet balance`,
                currentBalance: currentAepsBalance,
                requiredAmount: payoutAmount
            });
        }

        // ==========================================
        // PRE-CALCULATION & VALIDATION LOGIC START
        // ==========================================
        let commData = {
            isValid: false,
            role: user.userRole,
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
                mdShortfall: 0
            },
            scenario: null // 'DIST_DIRECT', 'DIST_MD', 'RET_DIRECT', 'RET_MD', 'RET_DIST_MD', 'RET_DIST_CO'
        };

        // Only process for MasterDistributor (3), Distributor (4) and Retailer (5)
        if ([3, 4, 5].includes(user.userRole)) {
            console.log('--- Starting Commercial Calculation ---');
            console.log(`Fetching Payout Operator for Slab ID: ${user.slabId}`);

            // Fetch Payout Operator for Bank Charge Calculation
            const payoutOperator = await dbService.findOne(model.operator, {
                operatorType: 'PAYOUT1',
                minValue: { [Op.lte]: payoutAmount },
                maxValue: { [Op.gte]: payoutAmount }
            });
            console.log('Payout Operator:', payoutOperator);

            if (payoutOperator) {
                const opAmtType = (payoutOperator.amtType || 'fix').toLowerCase();
                const opRawComm = Number(payoutOperator.comm || 0);
                if (opAmtType === 'per') {
                    commData.amounts.saBankCharge = round2((payoutAmount * opRawComm) / 100);
                } else {
                    commData.amounts.saBankCharge = round2(opRawComm);
                }
                console.log('Payout Operator Found:', { name: payoutOperator.operatorName, charge: commData.amounts.saBankCharge });
            } else {
                console.log('No Payout Operator Found for amount:', payoutAmount);
            }
            commData.payoutOperator = payoutOperator;

            // Fetch Common Users
            const [companyAdmin, superAdmin] = await Promise.all([
                dbService.findOne(model.user, { companyId: user.companyId, userRole: 2, isActive: true }),
                dbService.findOne(model.user, { id: 1, companyId: 1, userRole: 1, isActive: true })
            ]);

            if (!companyAdmin) return res.failure({ message: 'Company admin not found' });
            if (!superAdmin) return res.failure({ message: 'Super admin not found' });

            commData.users.companyAdmin = companyAdmin;
            commData.users.superAdmin = superAdmin;

            // Fetch Common Wallets
            const [companyWallet, superAdminWallet] = await Promise.all([
                dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 })
            ]);

            commData.wallets.companyWallet = companyWallet;
            commData.wallets.superAdminWallet = superAdminWallet;

            // Master Distributor Logic
            if (user.userRole === 3) {
                const masterDistributor = await dbService.findOne(model.user, { id: user.id, companyId: user.companyId, isActive: true });
                if (!masterDistributor) return res.failure({ message: 'Master Distributor not found' });
                commData.users.masterDistributor = masterDistributor;

                const mdWallet = await dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: user.companyId });
                commData.wallets.masterDistributorWallet = mdWallet;

                // Scenario: Master Distributor -> Company (Direct)
                commData.scenario = 'MD_DIRECT';
                const [SuperAdminSlabComm, companySlabComm] = await Promise.all([
                    dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorType: 'PAYOUT1' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                    dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorType: 'PAYOUT1' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                ]);

                // Correction: MD uses slab assigned by company. So we look in companySlabComm for role 3/MD.
                // Wait, MD assigns slab to itself? No. MD has a slab assigned by Company.
                // Re-fetching slabs correctly:
                // adminSlab (Role 1), companySlab (Role 2), mdSlab (Role 3 - this is the slab for MD)

                commData.slabs.mdSlab = companySlabComm?.find(c => (c.roleType === 3 || c.roleName === 'MD') && c.operatorId === commData.payoutOperator?.id);
                commData.slabs.adminSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'AD') && c.operatorId === commData.payoutOperator?.id);
                commData.slabs.companySlab = companySlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU') && c.operatorId === commData.payoutOperator?.id);

                // --- Commercial Logic Refactor (Margin Separation) ---
                // We determine what each upstream party EARNS based on the slabs they assigned.

                // 1. Identify Slabs
                // saToWlSlab: What Super Admin Charges White Label (Role 2)
                const saToWlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU') && c.operatorId === commData.payoutOperator?.id);
                // mdSlab: What White Label Charges Master Distributor (Role 3)
                const mdSlab = commData.slabs.mdSlab;

                // 2. Calculate Amounts
                const saToWlAmount = saToWlSlab ? calcSlabAmount(saToWlSlab, payoutAmount) : 0;
                const mdSlabAmount = mdSlab ? calcSlabAmount(mdSlab, payoutAmount) : 0;

                console.log(`Margin Calc: SA->WL Cost (${saToWlAmount}) vs WL->MD Cost (${mdSlabAmount})`);

                // 3. Determine Margins (Surcharges/Revenue)

                // Admin Surcharge = What SA collects from WL (Total SA Revenue)
                commData.amounts.adminSurcharge = saToWlAmount;

                // Company Surcharge = What WL collects from MD - What WL pays to SA (WL Margin)
                // If WL charges MD less than SA charges WL (Shortfall), Margin is 0 (Shortfall handled separately)
                commData.amounts.companySurcharge = Math.max(0, mdSlabAmount - saToWlAmount);

                // MD Surcharge = What MD pays to WL
                commData.amounts.mdSurcharge = mdSlabAmount;

                // 4. Handle Shortfall
                if (saToWlAmount > mdSlabAmount) {
                    commData.amounts.wlShortfall = parseFloat((saToWlAmount - mdSlabAmount).toFixed(2));
                    console.log(`Shortfall Detected: ${commData.amounts.wlShortfall}. Debited from WL, Credited to SA.`);
                } else {
                    commData.amounts.wlShortfall = 0;
                }

                console.log('--- Final Commercial Breakdown ---');
                console.log(`MD Pays (Debit): ${commData.amounts.mdSurcharge}`);
                console.log(`WL Margin (Credit): ${commData.amounts.companySurcharge}`);
                console.log(`SA Revenue (Credit): ${commData.amounts.adminSurcharge}`);
                console.log(`WL Shortfall (Debit WL/Credit SA): ${commData.amounts.wlShortfall}`);
                console.log(`Operator Charge (Cost to SA): ${commData.amounts.saBankCharge}`);

                // Balance Check
                const totalRequired = payoutAmount + commData.amounts.mdSurcharge;
                const mdBalance = parseFloat(commData.wallets.masterDistributorWallet[walletType] || 0);
                console.log(`MD Balance Check (${walletType}): Required ${totalRequired}, Available ${mdBalance}`);

                if (mdBalance < totalRequired) {
                    return res.failure({ message: `Insufficient MD wallet balance for payout + surcharge. Required: ${totalRequired}, Available: ${mdBalance}` });
                }

            } else if (user.userRole === 4) {
                // Distributor Logic
                const distributor = await dbService.findOne(model.user, { id: user.id, companyId: user.companyId, isActive: true });
                if (!distributor) return res.failure({ message: 'Distributor not found' });
                commData.users.distributor = distributor;

                const distributorWallet = await dbService.findOne(model.wallet, { refId: distributor.id, companyId: user.companyId });
                commData.wallets.distributorWallet = distributorWallet;

                if (distributor.reportingTo === companyAdmin.id || distributor.reportingTo === null) {
                    // Scenario 1: Distributor -> Company (Direct)
                    commData.scenario = 'DIST_DIRECT';
                    const [SuperAdminSlabComm, companySlabComm] = await Promise.all([
                        dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorType: 'PAYOUT1' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                        dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorType: 'PAYOUT1' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                    ]);

                    commData.slabs.distSlab = companySlabComm?.find(c => (c.roleType === 4 || c.roleName === 'DI') && c.operatorId === commData.payoutOperator?.id);
                    commData.slabs.adminSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'AD') && c.operatorId === commData.payoutOperator?.id);
                    commData.slabs.companySlab = companySlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU') && c.operatorId === commData.payoutOperator?.id);

                    // --- Commercial Logic Refactor (Margin Separation) - DIST_DIRECT ---
                    // 1. Identify Slabs & Amounts
                    const saToWlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU') && c.operatorId === commData.payoutOperator?.id);
                    const distSlab = commData.slabs.distSlab;

                    const saToWlAmount = saToWlSlab ? calcSlabAmount(saToWlSlab, payoutAmount) : 0;
                    const distSlabAmount = distSlab ? calcSlabAmount(distSlab, payoutAmount) : 0;

                    console.log(`Margin Calc (DIST_DIRECT): SA->WL Cost (${saToWlAmount}) vs WL->Dist Cost (${distSlabAmount})`);

                    // 2. Determine Margins
                    commData.amounts.adminSurcharge = saToWlAmount; // SA Revenue
                    commData.amounts.companySurcharge = Math.max(0, distSlabAmount - saToWlAmount); // WL Margin
                    commData.amounts.distSurcharge = distSlabAmount; // Dist Debit

                    // 3. Handle Shortfall 
                    if (saToWlAmount > distSlabAmount) {
                        commData.amounts.wlShortfall = parseFloat((saToWlAmount - distSlabAmount).toFixed(2));
                        console.log(`Shortfall Detected (DIST_DIRECT): ${commData.amounts.wlShortfall}. Debited from WL, Credited to SA.`);
                    } else {
                        commData.amounts.wlShortfall = 0;
                    }

                } else {
                    // Scenario 2: Distributor -> Master Distributor
                    commData.scenario = 'DIST_MD';
                    const masterDistributor = await dbService.findOne(model.user, { id: distributor.reportingTo, companyId: user.companyId, isActive: true });
                    if (!masterDistributor) return res.failure({ message: 'Master distributor not found' });
                    commData.users.masterDistributor = masterDistributor;

                    const mdWallet = await dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: user.companyId });
                    commData.wallets.masterDistributorWallet = mdWallet;

                    const [SuperAdminSlabComm, companySlabComm, masterDistributorComm] = await Promise.all([
                        dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorType: 'PAYOUT1' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                        dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorType: 'PAYOUT1' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                        dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: masterDistributor.id, operatorType: 'PAYOUT1' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                    ]);

                    commData.slabs.distSlab = masterDistributorComm?.find(c => (c.roleType === 4 || c.roleName === 'DI') && c.operatorId === commData.payoutOperator?.id);
                    commData.slabs.adminSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'AD') && c.operatorId === commData.payoutOperator?.id);
                    commData.slabs.companySlab = companySlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU') && c.operatorId === commData.payoutOperator?.id);
                    commData.slabs.mdSlab = masterDistributorComm?.find(c => (c.roleType === 3 || c.roleName === 'MD') && c.operatorId === commData.payoutOperator?.id);
                    // MD Slab Logic Correction: In DIST_MD, MD assigns slab to Dist.
                    // But we also need to know what WL charges MD to calculate MD Margin.
                    // WL charges MD using companySlabComm (Role 3).
                    const wlToMdSlab = companySlabComm?.find(c => (c.roleType === 3 || c.roleName === 'MD') && c.operatorId === commData.payoutOperator?.id);

                    // --- Commercial Logic Refactor (Margin Separation) - DIST_MD ---
                    // 1. Identify Slabs & Amounts
                    const saToWlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU') && c.operatorId === commData.payoutOperator?.id);
                    const distSlab = commData.slabs.distSlab; // What MD charges Dist

                    const saToWlAmount = saToWlSlab ? calcSlabAmount(saToWlSlab, payoutAmount) : 0;
                    const wlToMdAmount = wlToMdSlab ? calcSlabAmount(wlToMdSlab, payoutAmount) : 0;
                    const distSlabAmount = distSlab ? calcSlabAmount(distSlab, payoutAmount) : 0;

                    console.log(`Margin Calc (DIST_MD): SA->WL (${saToWlAmount}) vs WL->MD (${wlToMdAmount}) vs MD->Dist (${distSlabAmount})`);

                    // 2. Determine Margins
                    commData.amounts.adminSurcharge = saToWlAmount; // SA Revenue
                    commData.amounts.companySurcharge = Math.max(0, wlToMdAmount - saToWlAmount); // WL Margin
                    commData.amounts.mdSurcharge = Math.max(0, distSlabAmount - wlToMdAmount); // MD Margin
                    commData.amounts.distSurcharge = distSlabAmount; // Dist Debit

                    // 3. Handle Shortfalls
                    // WL Shortfall (SA charges WL more than WL charges MD)
                    if (saToWlAmount > wlToMdAmount) {
                        commData.amounts.wlShortfall = parseFloat((saToWlAmount - wlToMdAmount).toFixed(2));
                        console.log(`WL Shortfall Detected (DIST_MD): ${commData.amounts.wlShortfall}`);
                    } else {
                        commData.amounts.wlShortfall = 0;
                    }

                    // MD Shortfall (WL charges MD more than MD charges Dist)
                    // Note: If MD charges Dist LESS than what WL charges MD, MD takes a hit.
                    // This creates a situation where MD Margin is 0, and we need to debit the difference from MD Wallet.
                    // Let's call it mdShortfall.
                    if (wlToMdAmount > distSlabAmount) {
                        commData.amounts.mdShortfall = parseFloat((wlToMdAmount - distSlabAmount).toFixed(2));
                        console.log(`MD Shortfall Detected (DIST_MD): ${commData.amounts.mdShortfall}. Debited from MD, Credited to WL.`);
                    } else {
                        commData.amounts.mdShortfall = 0;
                    }
                }

                console.log('--- Final Commercial Breakdown (Distributor) ---');
                console.log(`Dist Pays (Debit): ${commData.amounts.distSurcharge}`);
                console.log(`MD Margin (Credit): ${commData.amounts.mdSurcharge}`);
                console.log(`WL Margin (Credit): ${commData.amounts.companySurcharge}`);
                console.log(`SA Revenue (Credit): ${commData.amounts.adminSurcharge}`);
                console.log(`WL Shortfall: ${commData.amounts.wlShortfall}`);
                console.log(`MD Shortfall: ${commData.amounts.mdShortfall}`);
                console.log(`Operator Charge: ${commData.amounts.saBankCharge}`);

                // Balance Check (From AEPS Wallet for Source)
                // Source: Payout Amount + Surcharge must be available
                const totalRequired = payoutAmount + commData.amounts.distSurcharge;
                const distBalance = parseFloat(commData.wallets.distributorWallet[walletType] || 0); // AEPS Wallet Check
                console.log(`Distributor Balance Check (${walletType}): Required ${totalRequired}, Available ${distBalance}`);

                if (distBalance < totalRequired) {
                    return res.failure({ message: `Insufficient distributor wallet balance for payout + surcharge. Required: ${totalRequired}, Available: ${distBalance}` });
                }

            } else if (user.userRole === 5) {
                // Retailer Logic
                const retailer = await dbService.findOne(model.user, { id: user.id, companyId: user.companyId, isActive: true });
                if (!retailer) return res.failure({ message: 'Retailer not found' });
                commData.users.retailer = retailer;

                const retailerWallet = await dbService.findOne(model.wallet, { refId: retailer.id, companyId: user.companyId });
                commData.wallets.retailerWallet = retailerWallet;

                let reportingUser = null;
                if (retailer.reportingTo && retailer.reportingTo !== companyAdmin.id) {
                    reportingUser = await dbService.findOne(model.user, { id: retailer.reportingTo, companyId: user.companyId, isActive: true });
                }

                if (!reportingUser || retailer.reportingTo === companyAdmin.id || retailer.reportingTo === null) {
                    // Scenario 1: Retailer -> Company (Direct)
                    commData.scenario = 'RET_DIRECT';
                    const [SuperAdminSlabComm, companySlabComm] = await Promise.all([
                        dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorType: 'PAYOUT1' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                        dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorType: 'PAYOUT1' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                    ]);
                    commData.slabs.retailerSlab = companySlabComm?.find(c => (c.roleType === 5 || c.roleName === 'RT') && c.operatorId === commData.payoutOperator?.id);
                    commData.slabs.adminSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'AD') && c.operatorId === commData.payoutOperator?.id);
                    commData.slabs.companySlab = companySlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU') && c.operatorId === commData.payoutOperator?.id);

                    // --- Margin Calc (RET_DIRECT) ---
                    const saToWlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU') && c.operatorId === commData.payoutOperator?.id);
                    const retSlab = commData.slabs.retailerSlab;

                    const saToWlAmount = saToWlSlab ? calcSlabAmount(saToWlSlab, payoutAmount) : 0;
                    const retSlabAmount = retSlab ? calcSlabAmount(retSlab, payoutAmount) : 0;

                    console.log(`Margin Calc (RET_DIRECT): SA->WL (${saToWlAmount}) vs WL->Ret (${retSlabAmount})`);

                    commData.amounts.adminSurcharge = saToWlAmount;
                    commData.amounts.companySurcharge = Math.max(0, retSlabAmount - saToWlAmount);
                    commData.amounts.retailerSurcharge = retSlabAmount;

                    if (saToWlAmount > retSlabAmount) {
                        commData.amounts.wlShortfall = parseFloat((saToWlAmount - retSlabAmount).toFixed(2));
                    } else {
                        commData.amounts.wlShortfall = 0;
                    }


                } else if (reportingUser.userRole === 3) {
                    // Scenario 2: Retailer -> Master Distributor
                    commData.scenario = 'RET_MD';
                    commData.users.masterDistributor = reportingUser;
                    commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: reportingUser.id, companyId: user.companyId });

                    const [SuperAdminSlabComm, companySlabComm, masterDistributorComm] = await Promise.all([
                        dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorType: 'PAYOUT1' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                        dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorType: 'PAYOUT1' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                        dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: reportingUser.id, operatorType: 'PAYOUT1' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                    ]);
                    commData.slabs.retailerSlab = masterDistributorComm?.find(c => (c.roleType === 5 || c.roleName === 'RT') && c.operatorId === commData.payoutOperator?.id);
                    commData.slabs.adminSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'AD') && c.operatorId === commData.payoutOperator?.id);
                    commData.slabs.companySlab = companySlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU') && c.operatorId === commData.payoutOperator?.id);
                    commData.slabs.mdSlab = masterDistributorComm?.find(c => (c.roleType === 3 || c.roleName === 'MD') && c.operatorId === commData.payoutOperator?.id);

                    // --- Margin Calc (RET_MD) ---
                    const saToWlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU') && c.operatorId === commData.payoutOperator?.id);
                    const wlToMdSlab = companySlabComm?.find(c => (c.roleType === 3 || c.roleName === 'MD') && c.operatorId === commData.payoutOperator?.id);
                    const retSlab = commData.slabs.retailerSlab; // MD -> Ret

                    const saToWlAmount = saToWlSlab ? calcSlabAmount(saToWlSlab, payoutAmount) : 0;
                    const wlToMdAmount = wlToMdSlab ? calcSlabAmount(wlToMdSlab, payoutAmount) : 0;
                    const retSlabAmount = retSlab ? calcSlabAmount(retSlab, payoutAmount) : 0;

                    console.log(`Margin Calc (RET_MD): SA->WL (${saToWlAmount}) vs WL->MD (${wlToMdAmount}) vs MD->Ret (${retSlabAmount})`);

                    commData.amounts.adminSurcharge = saToWlAmount;
                    commData.amounts.companySurcharge = Math.max(0, wlToMdAmount - saToWlAmount);
                    commData.amounts.mdSurcharge = Math.max(0, retSlabAmount - wlToMdAmount);
                    commData.amounts.retailerSurcharge = retSlabAmount;

                    if (saToWlAmount > wlToMdAmount) {
                        commData.amounts.wlShortfall = parseFloat((saToWlAmount - wlToMdAmount).toFixed(2));
                    } else {
                        commData.amounts.wlShortfall = 0;
                    }
                    if (wlToMdAmount > retSlabAmount) {
                        commData.amounts.mdShortfall = parseFloat((wlToMdAmount - retSlabAmount).toFixed(2));
                    } else {
                        commData.amounts.mdShortfall = 0;
                    }


                } else if (reportingUser.userRole === 4) {
                    // Retailer reports to Distributor. Need to check if Dist reports to MD or Company.
                    commData.users.distributor = reportingUser;
                    commData.wallets.distributorWallet = await dbService.findOne(model.wallet, { refId: reportingUser.id, companyId: user.companyId });

                    let masterDistributor = null;
                    if (reportingUser.reportingTo && reportingUser.reportingTo !== companyAdmin.id) {
                        masterDistributor = await dbService.findOne(model.user, { id: reportingUser.reportingTo, companyId: user.companyId, isActive: true });
                    }

                    if (masterDistributor && masterDistributor.userRole === 3) {
                        // Scenario 4: Retailer -> Dist -> MD
                        commData.scenario = 'RET_DIST_MD';
                        commData.users.masterDistributor = masterDistributor;
                        commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: user.companyId });

                        const [SuperAdminSlabComm, companySlabComm, masterDistributorComm, distributorComm] = await Promise.all([
                            dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorType: 'PAYOUT1' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorType: 'PAYOUT1' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: masterDistributor.id, operatorType: 'PAYOUT1' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: reportingUser.id, operatorType: 'PAYOUT1' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                        ]);
                        commData.slabs.retailerSlab = distributorComm?.find(c => (c.roleType === 5 || c.roleName === 'RT') && c.operatorId === commData.payoutOperator?.id);
                        commData.slabs.adminSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'AD') && c.operatorId === commData.payoutOperator?.id);
                        commData.slabs.companySlab = companySlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU') && c.operatorId === commData.payoutOperator?.id);
                        commData.slabs.mdSlab = masterDistributorComm?.find(c => (c.roleType === 3 || c.roleName === 'MD') && c.operatorId === commData.payoutOperator?.id);
                        commData.slabs.distSlab = distributorComm?.find(c => (c.roleType === 4 || c.roleName === 'DI') && c.operatorId === commData.payoutOperator?.id);

                        // --- Margin Calc (RET_DIST_MD) ---
                        const saToWlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU') && c.operatorId === commData.payoutOperator?.id);
                        const wlToMdSlab = companySlabComm?.find(c => (c.roleType === 3 || c.roleName === 'MD') && c.operatorId === commData.payoutOperator?.id);
                        const mdToDistSlab = masterDistributorComm?.find(c => (c.roleType === 4 || c.roleName === 'DI') && c.operatorId === commData.payoutOperator?.id);
                        const retSlab = commData.slabs.retailerSlab; // Dist -> Ret

                        const saToWlAmount = saToWlSlab ? calcSlabAmount(saToWlSlab, payoutAmount) : 0;
                        const wlToMdAmount = wlToMdSlab ? calcSlabAmount(wlToMdSlab, payoutAmount) : 0;
                        const mdToDistAmount = mdToDistSlab ? calcSlabAmount(mdToDistSlab, payoutAmount) : 0;
                        const retSlabAmount = retSlab ? calcSlabAmount(retSlab, payoutAmount) : 0;

                        console.log(`Margin Calc (RET_DIST_MD): SA->WL (${saToWlAmount}) vs WL->MD (${wlToMdAmount}) vs MD->Dist (${mdToDistAmount}) vs Dist->Ret (${retSlabAmount})`);

                        commData.amounts.adminSurcharge = saToWlAmount;
                        commData.amounts.companySurcharge = Math.max(0, wlToMdAmount - saToWlAmount);
                        commData.amounts.mdSurcharge = Math.max(0, mdToDistAmount - wlToMdAmount);
                        commData.amounts.distSurcharge = Math.max(0, retSlabAmount - mdToDistAmount);
                        commData.amounts.retailerSurcharge = retSlabAmount;

                        if (saToWlAmount > wlToMdAmount) commData.amounts.wlShortfall = parseFloat((saToWlAmount - wlToMdAmount).toFixed(2));
                        else commData.amounts.wlShortfall = 0;

                        if (wlToMdAmount > mdToDistAmount) commData.amounts.mdShortfall = parseFloat((wlToMdAmount - mdToDistAmount).toFixed(2));
                        else commData.amounts.mdShortfall = 0;

                        if (mdToDistAmount > retSlabAmount) {
                            commData.amounts.distShortfall = parseFloat((mdToDistAmount - retSlabAmount).toFixed(2));
                        } else {
                            commData.amounts.distShortfall = 0;
                        }

                    } else {
                        // Scenario 3: Retailer -> Dist -> Company
                        commData.scenario = 'RET_DIST_CO';
                        const [SuperAdminSlabComm, companySlabComm, distributorComm] = await Promise.all([
                            dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorType: 'PAYOUT1' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorType: 'PAYOUT1' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: reportingUser.id, operatorType: 'PAYOUT1' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                        ]);
                        commData.slabs.retailerSlab = distributorComm?.find(c => (c.roleType === 5 || c.roleName === 'RT') && c.operatorId === commData.payoutOperator?.id);
                        commData.slabs.adminSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'AD') && c.operatorId === commData.payoutOperator?.id);
                        commData.slabs.companySlab = companySlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU') && c.operatorId === commData.payoutOperator?.id);
                        commData.slabs.distSlab = distributorComm?.find(c => (c.roleType === 4 || c.roleName === 'DI') && c.operatorId === commData.payoutOperator?.id);

                        // --- Margin Calc (RET_DIST_CO) ---
                        const saToWlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU') && c.operatorId === commData.payoutOperator?.id);
                        const wlToDistSlab = companySlabComm?.find(c => (c.roleType === 4 || c.roleName === 'DI') && c.operatorId === commData.payoutOperator?.id);
                        const retSlab = commData.slabs.retailerSlab; // Dist -> Ret

                        const saToWlAmount = saToWlSlab ? calcSlabAmount(saToWlSlab, payoutAmount) : 0;
                        const wlToDistAmount = wlToDistSlab ? calcSlabAmount(wlToDistSlab, payoutAmount) : 0;
                        const retSlabAmount = retSlab ? calcSlabAmount(retSlab, payoutAmount) : 0;

                        console.log(`Margin Calc (RET_DIST_CO): SA->WL (${saToWlAmount}) vs WL->Dist (${wlToDistAmount}) vs Dist->Ret (${retSlabAmount})`);

                        commData.amounts.adminSurcharge = saToWlAmount;
                        commData.amounts.companySurcharge = Math.max(0, wlToDistAmount - saToWlAmount);
                        commData.amounts.distSurcharge = Math.max(0, retSlabAmount - wlToDistAmount);
                        commData.amounts.retailerSurcharge = retSlabAmount;

                        if (saToWlAmount > wlToDistAmount) commData.amounts.wlShortfall = parseFloat((saToWlAmount - wlToDistAmount).toFixed(2));
                        else commData.amounts.wlShortfall = 0;

                        if (wlToDistAmount > retSlabAmount) {
                            commData.amounts.distShortfall = parseFloat((wlToDistAmount - retSlabAmount).toFixed(2));
                        } else {
                            commData.amounts.distShortfall = 0;
                        }
                    }
                }

                console.log('Retailer Scenario:', commData.scenario);
                console.log('Calculated Surcharges (Margin Based):', commData.amounts);

                // Balance Check (From AEPS Wallet for Source)
                // Source: Payout Amount + Surcharge must be available
                const totalRequired = payoutAmount + commData.amounts.retailerSurcharge;
                const retBalance = parseFloat(commData.wallets.retailerWallet[walletType] || 0); // AEPS Wallet Check
                console.log(`Retailer Balance Check (${walletType}): Required ${totalRequired}, Available ${retBalance}`);

                if (retBalance < totalRequired) {
                    return res.failure({ message: `Insufficient retailer wallet balance for payout + surcharge. Required: ${totalRequired}, Available: ${retBalance}` });
                }
            }

            // Common Validation for Surcharges validation
            let debitAmount = 0;
            if (user.userRole === 3) debitAmount = commData.amounts.mdSurcharge;
            else if (user.userRole === 4) debitAmount = commData.amounts.distSurcharge;
            else if (user.userRole === 5) debitAmount = commData.amounts.retailerSurcharge;

            if (debitAmount <= 0) {
                console.log('Invalid Surcharge Config (<=0)');
                return res.failure({ message: 'Invalid surcharge configuration' });
            }

            let totalIncomes = commData.amounts.adminSurcharge + commData.amounts.companySurcharge;
            if (commData.users.masterDistributor && user.userRole !== 3) totalIncomes += commData.amounts.mdSurcharge;
            if (commData.users.distributor && user.userRole === 5) totalIncomes += commData.amounts.distSurcharge;

            console.log('Total Upstream Income:', totalIncomes, 'Debit Amount:', debitAmount);

            // Allocate any surplus surcharge (Debit - Income) to Super Admin to cover operator charges or as extra profit
            const surplus = debitAmount - totalIncomes;
            if (surplus > 0) {
                console.log(`Allocating surplus surcharge (${surplus}) to Super Admin.`);
                commData.amounts.adminSurcharge += surplus;
                totalIncomes += surplus; // Update totalIncomes for the check below
                console.log(`New Admin Surcharge: ${commData.amounts.adminSurcharge}`);
            }

            if (totalIncomes > (debitAmount + (commData.amounts.wlShortfall || 0) + (commData.amounts.mdShortfall || 0) + (commData.amounts.distShortfall || 0))) {
                console.log('Invalid Surcharge Config (Income > Debit + Shortfall)');
                return res.failure({ message: `Invalid surcharge configuration: total upstream income exceeds user surcharge debit. Income: ${totalIncomes}, Debit: ${debitAmount}, WL Shortfall: ${commData.amounts.wlShortfall}, MD Shortfall: ${commData.amounts.mdShortfall}, Dist Shortfall: ${commData.amounts.distShortfall}` });
            }

            commData.isValid = true;
        }
        // ==========================================
        // PRE-CALCULATION LOGIC END
        // ==========================================

        // Generate transaction ID and calculate balances
        const transactionID = generateTransactionID(company.companyName || company.name);
        // ... (existing balance calc logic)
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
            } else if (accountNumber && ifscCode) {
                customerBank = await dbService.findOne(model.customerBank, {
                    accountNumber: accountNumber,
                    ifsc: ifscCode,
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

            console.log('Sending Request to ASL API (MOCKED)');
            // Call ASL API for bank payout
            /*
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
            */
            aslResponse = {
                status: 'SUCCESS',
                orderid: 'PAY1723565406',
                bankref: '604221395191',
                remark: 'Transaction was Successfull',
                agentTransactionId: transactionID
            };
            console.log('ASL API Response:', aslResponse);

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
                if (aslResponse.utrn) payoutHistoryData.utrn = aslResponse.utrn;
                if (aslResponse.orderId) payoutHistoryData.orderId = aslResponse.orderId;
                if (aslResponse.referenceId) payoutHistoryData.referenceId = aslResponse.referenceId;
                if (aslResponse.message) payoutHistoryData.statusMessage = aslResponse.message;
            }
        }

        // Create payout history record
        const payoutHistory = await dbService.createOne(model.payoutHistory, payoutHistoryData);

        // Update wallet balance and Commercials if SUCCESS
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

                await Promise.all([
                    dbService.update(model.wallet, { refId: user.id, companyId: user.companyId }, walletUpdate),
                    dbService.createOne(model.walletHistory, walletHistories[0]),
                    dbService.createOne(model.walletHistory, walletHistories[1])
                ]);

            } else {
                // External bank transfer: Debit User AEPS Wallet
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

                await Promise.all([
                    dbService.update(model.wallet, { refId: user.id, companyId: user.companyId }, { [walletType]: aepsClosingBalance, updatedBy: user.id }),
                    dbService.createOne(model.walletHistory, walletHistoryData)
                ]);

                // Apply Commercial Updates using Pre-Calculated commData
                if (commData.isValid) {
                    const operatorName = 'Payout1';
                    const remarkText = `Bank payout via ${paymentMode} charge`;

                    // Helper: Create Wallet History Entry
                    const createHistory = async (u, wType, rem, amt, cred, deb, opBalance, clBalance, isSurcharge = false, isComm = false) => {
                        await dbService.createOne(model.walletHistory, {
                            refId: u.id,
                            companyId: (u.userRole === 1) ? 1 : user.companyId,
                            walletType: wType,
                            operator: operatorName,
                            remark: rem,
                            amount: amt,
                            comm: isComm ? amt : 0,
                            surcharge: isSurcharge ? amt : 0,
                            openingAmt: opBalance,
                            closingAmt: clBalance,
                            credit: cred,
                            debit: deb,
                            transactionId: transactionID,
                            paymentStatus: 'SUCCESS',
                            paymentMode: 'WALLET',
                            addedBy: u.id,
                            updatedBy: u.id
                        });
                    };

                    // --- Update Company Admin ---
                    const coOpen = parseFloat(commData.wallets.companyWallet[walletType] || 0);
                    const coClose = parseFloat((coOpen + commData.amounts.companySurcharge).toFixed(2));

                    console.log('--- Debug: Company Admin Wallet Update ---');
                    console.log(`Wallet Type: ${walletType}`);
                    console.log(`Opening Balance: ${coOpen}, Amount: ${commData.amounts.companySurcharge}, Closing: ${coClose}`);

                    await dbService.update(model.wallet, { id: commData.wallets.companyWallet.id }, { [walletType]: coClose, updatedBy: commData.users.companyAdmin.id });
                    await createHistory(commData.users.companyAdmin, walletType, `${remarkText} - company commission`, commData.amounts.companySurcharge, commData.amounts.companySurcharge, 0, coOpen, coClose, false, true);

                    // Handle WL Shortfall (Debit WL)
                    if (commData.amounts.wlShortfall > 0) {
                        const shortFall = commData.amounts.wlShortfall;
                        const coOpenSF = coClose;
                        const coCloseSF = parseFloat((coOpenSF - shortFall).toFixed(2));

                        console.log(`--- Debug: Dedcuting WL Shortfall from Company Admin ---`);
                        console.log(`Opening: ${coOpenSF}, Shortfall Debit: ${shortFall}, Closing: ${coCloseSF}`);

                        await dbService.update(model.wallet, { id: commData.wallets.companyWallet.id }, { [walletType]: coCloseSF, updatedBy: commData.users.companyAdmin.id });
                        await createHistory(commData.users.companyAdmin, walletType, `${remarkText} - shortfall penalty (SA charge > MD charge)`, shortFall, 0, shortFall, coOpenSF, coCloseSF, true, false);
                    }

                    // --- Update Super Admin (Income First) ---
                    const saOpen = parseFloat(commData.wallets.superAdminWallet[walletType] || 0);
                    const saMid = parseFloat((saOpen + commData.amounts.adminSurcharge).toFixed(2));
                    const saClose = parseFloat((saMid - commData.amounts.saBankCharge).toFixed(2));

                    console.log('--- Debug: Super Admin Wallet Update ---');
                    console.log(`Wallet Type: ${walletType}`);
                    console.log(`Opening: ${saOpen}, Surcharge Income: ${commData.amounts.adminSurcharge}, Operator Charge: ${commData.amounts.saBankCharge}, Closing: ${saClose}`);

                    // Update SA Wallet Final
                    await dbService.update(model.wallet, { id: commData.wallets.superAdminWallet.id }, { [walletType]: saClose, updatedBy: commData.users.superAdmin.id });

                    // SA History 1: Surcharge/Comm Income
                    await createHistory(commData.users.superAdmin, walletType, `${remarkText} - surcharge profit`, commData.amounts.adminSurcharge, commData.amounts.adminSurcharge, 0, saOpen, saMid, false, true);

                    // SA History 2: Bank Charge
                    if (commData.amounts.saBankCharge > 0) {
                        console.log('--- Debug: Payout Operator Charge ---');
                        const pOpName = commData.payoutOperator?.operatorName || 'Unknown';
                        console.log(`Operator Name: ${pOpName}`);

                        await createHistory(commData.users.superAdmin, walletType, `${remarkText} - operator charge`, commData.amounts.saBankCharge, 0, commData.amounts.saBankCharge, saMid, saClose, false, false);
                        await dbService.createOne(model.surRecords, {
                            refId: commData.users.superAdmin.id,
                            companyId: 1,
                            transactionId: transactionID,
                            amount: commData.amounts.saBankCharge,
                            service: 'PAYOUT1',
                            operatorType: pOpName,
                            addedBy: commData.users.superAdmin.id
                        });
                    }





                    // --- Update Master Distributor (If exists) ---
                    if (commData.users.masterDistributor) {
                        console.log('--- Debug: Master Distributor Wallet Update ---');
                        console.log(`Wallet Type: ${walletType}`);
                        if (user.userRole === 3) {
                            // MD is the Source (Debit) - USE AEPS WALLET
                            // Note: Payout amount is already deducted from AEPS wallet above.
                            const mdMid = aepsClosingBalance; // After payout deduction
                            const mdClose = parseFloat((mdMid - commData.amounts.mdSurcharge).toFixed(2));

                            console.log(`Role 3 (Source): Opening (Post-Payout): ${mdMid}, Surcharge Debit: ${commData.amounts.mdSurcharge}, Closing: ${mdClose}`);

                            await dbService.update(model.wallet, { id: commData.wallets.masterDistributorWallet.id }, { [walletType]: mdClose, updatedBy: commData.users.masterDistributor.id });
                            await createHistory(commData.users.masterDistributor, walletType, remarkText, commData.amounts.mdSurcharge, 0, commData.amounts.mdSurcharge, mdMid, mdClose, true, false);
                        } else {
                            // MD is an Intermediary (Income) - USE AEPS WALLET
                            const mdOpen = parseFloat(commData.wallets.masterDistributorWallet[walletType] || 0);
                            const mdClose = parseFloat((mdOpen + commData.amounts.mdSurcharge).toFixed(2));

                            console.log(`Role != 3 (Intermediary): Opening: ${mdOpen}, Surcharge Income: ${commData.amounts.mdSurcharge}, Closing: ${mdClose}`);

                            await dbService.update(model.wallet, { id: commData.wallets.masterDistributorWallet.id }, { [walletType]: mdClose, updatedBy: commData.users.masterDistributor.id });
                            await createHistory(commData.users.masterDistributor, walletType, `${remarkText} - master distributor commission`, commData.amounts.mdSurcharge, commData.amounts.mdSurcharge, 0, mdOpen, mdClose, false, true);

                            // Handle MD Shortfall (Debit MD)
                            if (commData.amounts.mdShortfall > 0) {
                                const shortFall = commData.amounts.mdShortfall;
                                const mdOpenSF = mdClose;
                                const mdCloseSF = parseFloat((mdOpenSF - shortFall).toFixed(2));

                                console.log(`--- Debug: Deducting MD Shortfall from Master Distributor ---`);
                                console.log(`Opening: ${mdOpenSF}, Shortfall Debit: ${shortFall}, Closing: ${mdCloseSF}`);

                                await dbService.update(model.wallet, { id: commData.wallets.masterDistributorWallet.id }, { [walletType]: mdCloseSF, updatedBy: commData.users.masterDistributor.id });
                                await createHistory(commData.users.masterDistributor, walletType, `${remarkText} - shortfall penalty (WL charge > MD charge)`, shortFall, 0, shortFall, mdOpenSF, mdCloseSF, true, false);
                            }
                        }
                    }

                    // --- Update Distributor ---
                    if (commData.users.distributor) {
                        // Check which wallet to use based on role. If Dist is Source (Role 4), use AEPS Wallet. If Upline, use AEPS Wallet (as requested).
                        if (user.userRole === 4) {
                            // Dist is the Source (Debit) - USE AEPS WALLET
                            const distOpen = parseFloat(commData.wallets.distributorWallet[walletType] || 0);
                            // Note: Payout amount is already deducted from AEPS wallet above. We only deduct Surcharge here from AEPS wallet.
                            // But wait, the AEPS deduction above set aepsClosingBalance = aepsOpeningBalance - payoutAmount.
                            // We need to deduct surcharge from the closing balance of the previous step.
                            const distMid = aepsClosingBalance; // After payout deduction
                            const distClose = parseFloat((distMid - commData.amounts.distSurcharge).toFixed(2));

                            await dbService.update(model.wallet, { id: commData.wallets.distributorWallet.id }, { [walletType]: distClose, updatedBy: commData.users.distributor.id });
                            await createHistory(commData.users.distributor, walletType, remarkText, commData.amounts.distSurcharge, 0, commData.amounts.distSurcharge, distMid, distClose, true, false);
                        } else {
                            // Dist is an Intermediary (Income) - USE AEPS WALLET (Changed from Main Wallet)
                            const distOpen = parseFloat(commData.wallets.distributorWallet[walletType] || 0);
                            const distClose = parseFloat((distOpen + commData.amounts.distSurcharge).toFixed(2));
                            await dbService.update(model.wallet, { id: commData.wallets.distributorWallet.id }, { [walletType]: distClose, updatedBy: commData.users.distributor.id });
                            await createHistory(commData.users.distributor, walletType, `${remarkText} - distributor commission`, commData.amounts.distSurcharge, commData.amounts.distSurcharge, 0, distOpen, distClose, false, true);

                            // Handle Dist Shortfall (Debit Dist)
                            // This happens in RET_DIST_MD or RET_DIST_CO scenarios where MD/WL charges Dist > Dist charges Retailer
                            if (commData.amounts.distShortfall > 0) {
                                const shortFall = commData.amounts.distShortfall;
                                const distOpenSF = distClose;
                                const distCloseSF = parseFloat((distOpenSF - shortFall).toFixed(2));

                                console.log(`--- Debug: Deducting Dist Shortfall from Distributor ---`);
                                console.log(`Opening: ${distOpenSF}, Shortfall Debit: ${shortFall}, Closing: ${distCloseSF}`);

                                await dbService.update(model.wallet, { id: commData.wallets.distributorWallet.id }, { [walletType]: distCloseSF, updatedBy: commData.users.distributor.id });
                                await createHistory(commData.users.distributor, walletType, `${remarkText} - shortfall penalty (Upline charge > Dist charge)`, shortFall, 0, shortFall, distOpenSF, distCloseSF, true, false);
                            }
                        }
                    }

                    // --- Update Retailer (If Source) ---
                    if (user.userRole === 5) {
                        // Ret is the Source (Debit) - USE AEPS WALLET
                        // Note: Payout amount is already deducted from AEPS wallet above.
                        const retMid = aepsClosingBalance; // After payout deduction
                        const retClose = parseFloat((retMid - commData.amounts.retailerSurcharge).toFixed(2));

                        await dbService.update(model.wallet, { id: commData.wallets.retailerWallet.id }, { [walletType]: retClose, updatedBy: commData.users.retailer.id });
                        await createHistory(commData.users.retailer, walletType, remarkText, commData.amounts.retailerSurcharge, 0, commData.amounts.retailerSurcharge, retMid, retClose, true, false);
                    }
                }
            }
        }

        // Prepare response data
        const responseData = {
            transactionID: transactionID,
            status: payoutHistoryData?.status || aslResponse?.status,
            orderId: aslResponse?.orderid,
            bankref: aslResponse?.bankref || aslResponse?.txid || aslResponse?.referenceId || aslResponse?.utrn,
            bankName: customerBank?.bankName || null,
            beneficiaryName: customerBank?.beneficiaryName || null,
            aepsType: normalizedAepsType,
            remark: aslResponse?.remark,
            [normalizedAepsType.toLowerCase()]: {
                openingBalance: aepsOpeningBalance,
                closingBalance: aepsClosingBalance
            }
        };

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

        if (mode === 'wallet' && payoutHistoryData.status === 'SUCCESS') {
            responseData.mainWallet = {
                openingBalance: mainWalletOpeningBalance,
                closingBalance: mainWalletClosingBalance
            };
        }

        if (payoutHistoryData.status === 'SUCCESS') {
            return res.success(responseData);
        } else {
            return res.failure({
                message: payoutHistoryData.apiResponse?.remark || 'Payout request failed',
                data: responseData
            });
        }

    } catch (error) {
        console.error('Payout Error:', error);
        return res.failure({ message: error.message || 'Internal Server Error' });
    }
};

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
                isActive: true,
                isPayout: true
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
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

const getAllPayoutHistory = async (req, res) => {
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

        // Only Master Distributor (3), Distributor (4), and Retailer (5) can access this endpoint
        if (![3, 4, 5].includes(userRole)) {
            return res.failure({ message: 'You are not authorized to get all payout history' });
        }

        const dataToFind = req.body || {};
        let options = {};
        let query = { companyId };

        // Role-based refId filtering
        if (userRole === 4 || userRole === 5) {
            // Distributor (4) and Retailer (5): Only their own payouts
            query.refId = userId;
        } else if (userRole === 3) {
            // Master Distributor (3): Their own payouts + payouts of users reporting to them
            const reportingUsers = await dbService.findAll(
                model.user,
                {
                    reportingTo: userId,
                    companyId,
                    isDeleted: false,
                    userRole: { [Op.in]: [4, 5] }
                },
                {
                    attributes: ['id']
                }
            );

            const reportingUserIds = reportingUsers.map((user) => user.id);
            query.refId = { [Op.in]: [userId, ...reportingUserIds] };
        }

        // Build query from request body
        if (dataToFind && dataToFind.query) {
            const { startDate, endDate, type, walletType, aepsType, ...restQuery } = dataToFind.query;

            // Merge other query filters
            query = { ...query, ...restQuery };

            // Date range (handled by dbService.paginate via startDate/endDate)
            if (startDate) {
                query.startDate = startDate;
            }
            if (endDate) {
                query.endDate = endDate;
            }

            // Type filter (internal/external). If 'all' or not provided, do not filter.
            if (type && typeof type === 'string' && type.toLowerCase() !== 'all') {
                query.type = type.toLowerCase();
            }

            // Wallet type filter
            if (walletType && typeof walletType === 'string') {
                // Accept both direct walletType (apes1Wallet/apes2Wallet) or AEPS1/AEPS2
                const normalizedWalletType = walletType.toUpperCase();
                if (normalizedWalletType === 'AEPS1') {
                    query.walletType = 'apes1Wallet';
                } else if (normalizedWalletType === 'AEPS2') {
                    query.walletType = 'apes2Wallet';
                } else {
                    query.walletType = walletType;
                }
            } else if (aepsType && typeof aepsType === 'string') {
                // Map AEPS type to walletType if provided
                const normalizedAepsType = aepsType.toUpperCase();
                if (normalizedAepsType === 'AEPS1') {
                    query.walletType = 'apes1Wallet';
                } else if (normalizedAepsType === 'AEPS2') {
                    query.walletType = 'apes2Wallet';
                }
            }
        }

        // Handle options (pagination, sorting)
        if (dataToFind && dataToFind.options !== undefined) {
            options = { ...dataToFind.options };
            // sort will be handled by dbService.paginate via options.sort
        }

        // Handle customSearch (transactionID or beneficiaryName)
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
}

module.exports = {
    payout,
    getPayoutBankList,
    getAllPayoutHistory
};
