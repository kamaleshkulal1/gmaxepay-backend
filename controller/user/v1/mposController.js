const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const { generateTransactionID } = require('../../../utils/transactionID');

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

const processMposTransaction = async (req, res) => {
    try {
        const { amount, txid, status, message, apiResponse } = req.body;

        if (![4, 5].includes(req.user.userRole)) {
            return res.failure({ message: 'Only Retailer and Distributor can perform mPOS transactions' });
        }

        if (!amount) return res.failure({ message: 'Amount is required' });
        if (!txid) return res.failure({ message: 'Hardware Transaction ID (txid) is required' });
        if (!status) return res.failure({ message: 'Transaction Status is required' });

        const amountNumber = round2(parseFloat(amount));
        const user = req.user;

        // Fetch User and Company first so we can generate the ID
        const [existingUser, existingCompany] = await Promise.all([
            dbService.findOne(model.user, { id: user.id, companyId: user.companyId }),
            dbService.findOne(model.company, { id: user.companyId })
        ]);

        if (!existingUser) return res.failure({ message: 'User not found' });

        const transactionId = generateTransactionID(existingCompany?.companyName || 'MPOS');

        const isSuccess = status === 'SUCCESS' || status === 'Success' || status === 'APPROVED';
        if (!isSuccess) {
            // Log failing transaction
            await dbService.createOne(model.mposHistory, {
                refId: user.id,
                companyId: user.companyId,
                amount: amountNumber,
                orderid: transactionId,
                transactionId: transactionId,
                txid: txid,
                status: 'FAILURE',
                message: message || 'Transaction Failed',
                apiResponse: apiResponse || null,
                addedBy: user.id
            });
            return res.failure({ message: 'mPOS Transaction Failed' });
        }

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
                saComm: 0,
                saSurcharge: 0,
                wlShortfall: 0,
                mdShortfall: 0,
                distShortfall: 0
            },
            scenario: null
        };

        const [companyAdmin, superAdmin] = await Promise.all([
            dbService.findOne(model.user, { companyId: req.user.companyId, userRole: 2, isActive: true }),
            dbService.findOne(model.user, { id: 1, companyId: 1, userRole: 1, isActive: true })
        ]);

        if (!companyAdmin) return res.failure({ message: 'Company admin not found' });
        if (!superAdmin) return res.failure({ message: 'Super admin not found' });

        commData.users.companyAdmin = companyAdmin;
        commData.users.superAdmin = superAdmin;

        const [companyWallet, superAdminWallet] = await Promise.all([
            dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: req.user.companyId }),
            dbService.findOne(model.wallet, { refId: 1, companyId: 1 })
        ]);

        commData.wallets.companyWallet = companyWallet;
        commData.wallets.superAdminWallet = superAdminWallet;

        const mposOperator = await dbService.findOne(model.operator, {
            operatorType: 'MPOS',
            isActive: true
        });

        if (mposOperator) {
            commData.mposOperator = mposOperator;
            commData.amounts.saBankCharge = calcSlabAmount(mposOperator, amountNumber);
        }

        const currentUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId, isActive: true });
        const currentUserWallet = await dbService.findOne(model.wallet, { refId: req.user.id, companyId: req.user.companyId });

        if (!currentUser) return res.failure({ message: 'User not found' });
        if (!currentUserWallet) return res.failure({ message: 'User wallet not found' });

        if (req.user.userRole === 4) {
            commData.users.distributor = currentUser;
            commData.wallets.distributorWallet = currentUserWallet;

            if (currentUser.reportingTo === companyAdmin.id || currentUser.reportingTo === null) {
                commData.scenario = 'DIST_DIRECT';
                const [SuperAdminSlabComm, companySlabComm] = await Promise.all([
                    dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorType: 'MPOS' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                    dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: companyAdmin.id, operatorType: 'MPOS' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                ]);

                commData.slabs.distSlab = companySlabComm?.find(c => (c.roleType === 4 || c.roleName === 'DI'));
                const saToWlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
                const saSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'SA'));
                
                const saToWlAmount = saToWlSlab ? calcSlabAmount(saToWlSlab, amountNumber) : 0;
                const saCommAmount = saSlab ? calcSlabAmount(saSlab, amountNumber) : 0;
                const distSlabAmount = commData.slabs.distSlab ? calcSlabAmount(commData.slabs.distSlab, amountNumber) : 0;

                commData.amounts.adminSurcharge = saToWlAmount;
                commData.amounts.saComm = saCommAmount;
                commData.amounts.saSurcharge = Math.max(0, saToWlAmount - saCommAmount);
                commData.amounts.companySurcharge = Math.max(0, distSlabAmount - saToWlAmount);
                commData.amounts.distSurcharge = distSlabAmount;

                if (saToWlAmount > distSlabAmount) {
                    commData.amounts.wlShortfall = parseFloat((saToWlAmount - distSlabAmount).toFixed(2));
                }
            } else {
                commData.scenario = 'DIST_MD';
                const masterDistributor = await dbService.findOne(model.user, { id: currentUser.reportingTo, companyId: req.user.companyId, isActive: true });
                if (!masterDistributor) return res.failure({ message: 'Master distributor not found' });
                commData.users.masterDistributor = masterDistributor;
                commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: req.user.companyId });

                const [SuperAdminSlabComm, companySlabComm, masterDistributorComm] = await Promise.all([
                    dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorType: 'MPOS' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                    dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: companyAdmin.id, operatorType: 'MPOS' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                    dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: masterDistributor.id, operatorType: 'MPOS' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                ]);

                commData.slabs.distSlab = masterDistributorComm?.find(c => (c.roleType === 4 || c.roleName === 'DI'));
                const saToWlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
                const saSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'SA'));
                const wlToMdSlab = companySlabComm?.find(c => (c.roleType === 3 || c.roleName === 'MD'));

                const saToWlAmount = saToWlSlab ? calcSlabAmount(saToWlSlab, amountNumber) : 0;
                const saCommAmount = saSlab ? calcSlabAmount(saSlab, amountNumber) : 0;
                const wlToMdAmount = wlToMdSlab ? calcSlabAmount(wlToMdSlab, amountNumber) : 0;
                const distSlabAmount = commData.slabs.distSlab ? calcSlabAmount(commData.slabs.distSlab, amountNumber) : 0;

                commData.amounts.adminSurcharge = saToWlAmount;
                commData.amounts.saComm = saCommAmount;
                commData.amounts.saSurcharge = Math.max(0, saToWlAmount - saCommAmount);
                commData.amounts.companySurcharge = Math.max(0, wlToMdAmount - saToWlAmount);
                commData.amounts.mdSurcharge = Math.max(0, distSlabAmount - wlToMdAmount);
                commData.amounts.distSurcharge = distSlabAmount;

                if (saToWlAmount > wlToMdAmount) commData.amounts.wlShortfall = parseFloat((saToWlAmount - wlToMdAmount).toFixed(2));
                if (wlToMdAmount > distSlabAmount) commData.amounts.mdShortfall = parseFloat((wlToMdAmount - distSlabAmount).toFixed(2));
            }
        } else if (req.user.userRole === 5) {
            commData.users.retailer = currentUser;
            commData.wallets.retailerWallet = currentUserWallet;

            let reportingUser = null;
            if (currentUser.reportingTo && currentUser.reportingTo !== companyAdmin.id) {
                reportingUser = await dbService.findOne(model.user, { id: currentUser.reportingTo, companyId: req.user.companyId, isActive: true });
            }

            if (!reportingUser || currentUser.reportingTo === companyAdmin.id || currentUser.reportingTo === null) {
                commData.scenario = 'RET_DIRECT';
                const [SuperAdminSlabComm, companySlabComm] = await Promise.all([
                    dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorType: 'MPOS' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                    dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: companyAdmin.id, operatorType: 'MPOS' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                ]);

                commData.slabs.retailerSlab = companySlabComm?.find(c => (c.roleType === 5 || c.roleName === 'RT'));
                const saToWlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
                const saSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'SA'));

                const saToWlAmount = saToWlSlab ? calcSlabAmount(saToWlSlab, amountNumber) : 0;
                const saCommAmount = saSlab ? calcSlabAmount(saSlab, amountNumber) : 0;
                const retSlabAmount = commData.slabs.retailerSlab ? calcSlabAmount(commData.slabs.retailerSlab, amountNumber) : 0;

                commData.amounts.adminSurcharge = saToWlAmount;
                commData.amounts.saComm = saCommAmount;
                commData.amounts.saSurcharge = Math.max(0, saToWlAmount - saCommAmount);
                commData.amounts.companySurcharge = Math.max(0, retSlabAmount - saToWlAmount);
                commData.amounts.retailerSurcharge = retSlabAmount;

                if (saToWlAmount > retSlabAmount) commData.amounts.wlShortfall = parseFloat((saToWlAmount - retSlabAmount).toFixed(2));
            } else if (reportingUser.userRole === 3) {
                commData.scenario = 'RET_MD';
                commData.users.masterDistributor = reportingUser;
                commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: reportingUser.id, companyId: req.user.companyId });
                
                const [SuperAdminSlabComm, companySlabComm, masterDistributorComm] = await Promise.all([
                    dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorType: 'MPOS' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                    dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: companyAdmin.id, operatorType: 'MPOS' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                    dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: reportingUser.id, operatorType: 'MPOS' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                ]);

                commData.slabs.retailerSlab = masterDistributorComm?.find(c => (c.roleType === 5 || c.roleName === 'RT'));
                const saToWlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
                const saSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'SA'));
                const wlToMdSlab = companySlabComm?.find(c => (c.roleType === 3 || c.roleName === 'MD'));

                const saToWlAmount = saToWlSlab ? calcSlabAmount(saToWlSlab, amountNumber) : 0;
                const saCommAmount = saSlab ? calcSlabAmount(saSlab, amountNumber) : 0;
                const wlToMdAmount = wlToMdSlab ? calcSlabAmount(wlToMdSlab, amountNumber) : 0;
                const retSlabAmount = commData.slabs.retailerSlab ? calcSlabAmount(commData.slabs.retailerSlab, amountNumber) : 0;

                commData.amounts.adminSurcharge = saToWlAmount;
                commData.amounts.saComm = saCommAmount;
                commData.amounts.saSurcharge = Math.max(0, saToWlAmount - saCommAmount);
                commData.amounts.companySurcharge = Math.max(0, wlToMdAmount - saToWlAmount);
                commData.amounts.mdSurcharge = Math.max(0, retSlabAmount - wlToMdAmount);
                commData.amounts.retailerSurcharge = retSlabAmount;

                if (saToWlAmount > wlToMdAmount) commData.amounts.wlShortfall = parseFloat((saToWlAmount - wlToMdAmount).toFixed(2));
                if (wlToMdAmount > retSlabAmount) commData.amounts.mdShortfall = parseFloat((wlToMdAmount - retSlabAmount).toFixed(2));
            } else if (reportingUser.userRole === 4) {
                commData.users.distributor = reportingUser;
                commData.wallets.distributorWallet = await dbService.findOne(model.wallet, { refId: reportingUser.id, companyId: req.user.companyId });

                let masterDistributor = null;
                if (reportingUser.reportingTo && reportingUser.reportingTo !== companyAdmin.id) {
                    masterDistributor = await dbService.findOne(model.user, { id: reportingUser.reportingTo, companyId: req.user.companyId, isActive: true });
                }

                if (masterDistributor && masterDistributor.userRole === 3) {
                    commData.scenario = 'RET_DIST_MD';
                    commData.users.masterDistributor = masterDistributor;
                    commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: req.user.companyId });

                    const [SuperAdminSlabComm, companySlabComm, masterDistributorComm, distributorComm] = await Promise.all([
                        dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorType: 'MPOS' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                        dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: companyAdmin.id, operatorType: 'MPOS' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                        dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: masterDistributor.id, operatorType: 'MPOS' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                        dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: reportingUser.id, operatorType: 'MPOS' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                    ]);

                    commData.slabs.retailerSlab = distributorComm?.find(c => (c.roleType === 5 || c.roleName === 'RT'));
                    const saToWlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
                    const saSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'SA'));
                    const wlToMdSlab = companySlabComm?.find(c => (c.roleType === 3 || c.roleName === 'MD'));
                    const mdToDistSlab = masterDistributorComm?.find(c => (c.roleType === 4 || c.roleName === 'DI'));

                    const saToWlAmount = saToWlSlab ? calcSlabAmount(saToWlSlab, amountNumber) : 0;
                    const saCommAmount = saSlab ? calcSlabAmount(saSlab, amountNumber) : 0;
                    const wlToMdAmount = wlToMdSlab ? calcSlabAmount(wlToMdSlab, amountNumber) : 0;
                    const mdToDistAmount = mdToDistSlab ? calcSlabAmount(mdToDistSlab, amountNumber) : 0;
                    const retSlabAmount = commData.slabs.retailerSlab ? calcSlabAmount(commData.slabs.retailerSlab, amountNumber) : 0;

                    commData.amounts.adminSurcharge = saToWlAmount;
                    commData.amounts.saComm = saCommAmount;
                    commData.amounts.saSurcharge = Math.max(0, saToWlAmount - saCommAmount);
                    commData.amounts.companySurcharge = Math.max(0, wlToMdAmount - saToWlAmount);
                    commData.amounts.mdSurcharge = Math.max(0, mdToDistAmount - wlToMdAmount);
                    commData.amounts.distSurcharge = Math.max(0, retSlabAmount - mdToDistAmount);
                    commData.amounts.retailerSurcharge = retSlabAmount;

                    if (saToWlAmount > wlToMdAmount) commData.amounts.wlShortfall = parseFloat((saToWlAmount - wlToMdAmount).toFixed(2));
                    if (wlToMdAmount > mdToDistAmount) commData.amounts.mdShortfall = parseFloat((wlToMdAmount - mdToDistAmount).toFixed(2));
                    if (mdToDistAmount > retSlabAmount) commData.amounts.distShortfall = parseFloat((mdToDistAmount - retSlabAmount).toFixed(2));
                } else {
                    commData.scenario = 'RET_DIST_CO';
                    const [SuperAdminSlabComm, companySlabComm, distributorComm] = await Promise.all([
                        dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorType: 'MPOS' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                        dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: companyAdmin.id, operatorType: 'MPOS' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                        dbService.findAll(model.commSlab, { companyId: req.user.companyId, addedBy: reportingUser.id, operatorType: 'MPOS' }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                    ]);

                    commData.slabs.retailerSlab = distributorComm?.find(c => (c.roleType === 5 || c.roleName === 'RT'));
                    const saToWlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
                    const saSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'SA'));
                    const wlToDistSlab = companySlabComm?.find(c => (c.roleType === 4 || c.roleName === 'DI'));

                    const saToWlAmount = saToWlSlab ? calcSlabAmount(saToWlSlab, amountNumber) : 0;
                    const saCommAmount = saSlab ? calcSlabAmount(saSlab, amountNumber) : 0;
                    const wlToDistAmount = wlToDistSlab ? calcSlabAmount(wlToDistSlab, amountNumber) : 0;
                    const retSlabAmount = commData.slabs.retailerSlab ? calcSlabAmount(commData.slabs.retailerSlab, amountNumber) : 0;

                    commData.amounts.adminSurcharge = saToWlAmount;
                    commData.amounts.saComm = saCommAmount;
                    commData.amounts.saSurcharge = Math.max(0, saToWlAmount - saCommAmount);
                    commData.amounts.companySurcharge = Math.max(0, wlToDistAmount - saToWlAmount);
                    commData.amounts.distSurcharge = Math.max(0, retSlabAmount - wlToDistAmount);
                    commData.amounts.retailerSurcharge = retSlabAmount;

                    if (saToWlAmount > wlToDistAmount) commData.amounts.wlShortfall = parseFloat((saToWlAmount - wlToDistAmount).toFixed(2));
                    if (wlToDistAmount > retSlabAmount) commData.amounts.distShortfall = parseFloat((wlToDistAmount - retSlabAmount).toFixed(2));
                }
            }
        }

        let userDebit = 0; // The surcharge amount deducted from the user
        if (req.user.userRole === 4) userDebit = commData.amounts.distSurcharge;
        if (req.user.userRole === 5) userDebit = commData.amounts.retailerSurcharge;

        let totalIncome = commData.amounts.adminSurcharge + commData.amounts.companySurcharge;
        if (commData.users.masterDistributor) totalIncome += commData.amounts.mdSurcharge;
        if (commData.users.distributor && req.user.userRole === 5) totalIncome += commData.amounts.distSurcharge;

        const surplus = userDebit - totalIncome;
        if (surplus > 0) {
            commData.amounts.adminSurcharge += surplus;
        }

        const operatorName = 'mPOS Sale';
        const remarkText = 'mPOS Sale Transaction';
        const userBalance = parseFloat(currentUserWallet.mainWallet || 0);

        // Wallet Update for User (Merchant) -> Credit Amount, Debit Surcharge
        const userNewBalance = parseFloat((userBalance + amountNumber - userDebit).toFixed(2));
        await dbService.update(model.wallet, { id: currentUserWallet.id }, { mainWallet: userNewBalance, updatedBy: req.user.id });
        
        await dbService.createOne(model.walletHistory, {
            refId: req.user.id,
            companyId: req.user.companyId,
            walletType: 'mainWallet',
            operator: operatorName,
            remark: remarkText,
            amount: amountNumber, // Transaction Amount
            comm: 0,
            surcharge: userDebit, // Surcharge deduction
            openingAmt: userBalance,
            closingAmt: userNewBalance,
            credit: amountNumber, // Sales Proceeds
            debit: userDebit, // Surcharge Paid
            transactionId: transactionId,
            paymentStatus: 'SUCCESS',
            addedBy: req.user.id,
            updatedBy: req.user.id
        });

        if (commData.users.distributor && req.user.userRole === 5) {
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
                    addedBy: commData.users.distributor.id,
                    updatedBy: commData.users.distributor.id
                });
            }
            if (commData.amounts.distShortfall > 0) {
                const dWallet = await dbService.findOne(model.wallet, { id: commData.wallets.distributorWallet.id });
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
                    surcharge: 0,
                    openingAmt: dBal,
                    closingAmt: dNewBal,
                    credit: 0,
                    debit: commData.amounts.distShortfall,
                    transactionId,
                    paymentStatus: 'SUCCESS',
                    addedBy: commData.users.distributor.id,
                    updatedBy: commData.users.distributor.id
                });
            }
        }

        if (commData.users.masterDistributor) {
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
                    addedBy: commData.users.masterDistributor.id,
                    updatedBy: commData.users.masterDistributor.id
                });
            }
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
                    addedBy: commData.users.masterDistributor.id,
                    updatedBy: commData.users.masterDistributor.id
                });
            }
        }

        const cWallet = commData.wallets.companyWallet;
        const cBal = parseFloat(cWallet.mainWallet || 0);
        let cCredit = commData.amounts.companySurcharge;
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
                addedBy: companyAdmin.id,
                updatedBy: companyAdmin.id
            });
        }

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
                addedBy: companyAdmin.id,
                updatedBy: companyAdmin.id
            });
        }

        const saWallet = commData.wallets.superAdminWallet;
        const saBal = parseFloat(saWallet.mainWallet || 0);

        let saCredit = (commData.amounts.saComm || 0);
        saCredit += (commData.amounts.wlShortfall || 0);

        const saMid = parseFloat((saBal + saCredit).toFixed(2));
        const saNewBal = parseFloat((saMid - commData.amounts.saBankCharge).toFixed(2));

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
                addedBy: superAdmin.id,
                updatedBy: superAdmin.id
            });
        }

        if (commData.amounts.saSurcharge > 0) {
            await dbService.createOne(model.surRecords, {
                refId: commData.users.superAdmin.id,
                companyId: 1,
                transactionId: transactionId,
                amount: commData.amounts.saSurcharge,
                service: 'MPOS',
                operatorType: commData.mposOperator?.operatorName || 'MPOS',
                addedBy: commData.users.superAdmin.id
            });
        }

        if (commData.amounts.saBankCharge > 0) {
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
                addedBy: commData.users.superAdmin.id,
                updatedBy: commData.users.superAdmin.id
            });

            await dbService.createOne(model.surRecords, {
                refId: commData.users.superAdmin.id,
                companyId: 1,
                transactionId: transactionId,
                amount: commData.amounts.saBankCharge,
                service: 'MPOS',
                operatorType: commData.mposOperator?.operatorName || 'MPOS',
                addedBy: commData.users.superAdmin.id
            });
        }

        const mposHistoryData = {
            refId: user.id,
            companyId: user.companyId,
            amount: amountNumber,
            orderid: transactionId,
            transactionId: transactionId,
            txid: txid,
            status: 'SUCCESS',
            message: message || 'Transaction Successful',
            superadminComm: commData.amounts.saComm,
            whitelabelComm: 0,
            masterDistributorCom: 0,
            distributorCom: 0,
            retailerCom: 0,
            superadminSurcharge: commData.amounts.adminSurcharge,
            whitelabelSurcharge: commData.amounts.companySurcharge,
            masterDistributorSurcharge: commData.amounts.mdSurcharge,
            distributorSurcharge: commData.amounts.distSurcharge,
            retailerSurcharge: commData.amounts.retailerSurcharge,
            surchargeAmt: userDebit,
            apiResponse: apiResponse || null,
            addedBy: user.id
        };

        const createdTxn = await dbService.createOne(model.mposHistory, mposHistoryData);
        return res.success({ message: 'mPOS Transaction successful', data: createdTxn });
    } catch (error) {
        console.error('mPOS error:', error);
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

module.exports = {
    processMposTransaction
};
