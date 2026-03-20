const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const { generateTransactionID } = require('../../../utils/transactionID');

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
    if (amtType === 'per') {
        return round4((base * rawComm) / 100);
    }
    return round4(rawComm);
};

const processMatmTransaction = async (req, res) => {
    try {
        const { amount, txid, status, message, apiResponse } = req.body;

        if (![4, 5].includes(req.user.userRole)) {
            return res.failure({ message: 'Only Retailer and Distributor can perform mATM transactions' });
        }

        if (!amount) {
            return res.failure({ message: 'Amount is required' });
        }
        if (!txid) {
            return res.failure({ message: 'Hardware Transaction ID (txid) is required' });
        }
        if (!status) {
            return res.failure({ message: 'Transaction Status is required' });
        }

        const amountNumber = round4(parseFloat(amount));
        const user = req.user;

        // Fetch User and Company
        const [existingUser, existingCompany] = await Promise.all([
            dbService.findOne(model.user, { id: user.id, companyId: user.companyId }),
            dbService.findOne(model.company, { id: user.companyId })
        ]);

        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        // Dummy operator for mATM (You might want to fetch exact operator from DB, assuming MATM)
        let operator = await dbService.findOne(model.operator, { operatorType: "MATM" });
        if (!operator) {
            // Fallback or explicit failure
            return res.failure({ message: 'mATM Operator not found in database' });
        }

        const operatorType = operator.operatorType || 'MATM';
        const transactionId = generateTransactionID(existingCompany?.companyName || 'MATM');

        // Check Transaction Uniqueness (Checking the hardware's ID for uniqueness)
        const existingTxn = await dbService.findOne(model.matmHistory, { txid: txid });
        if (existingTxn) {
            return res.failure({ message: 'Hardware TXID already processed' });
        }

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

        let currentWallet = await model.wallet.findOne({
            where: { refId: user.id, companyId: user.companyId }
        });

        if (!currentWallet) {
            return res.failure({ message: 'Wallet not found' });
        }

        const isSuccess = status === 'SUCCESS' || status === 'Success' || status === 'APPROVED';
        const isPending = status === 'PENDING' || status === 'Pending';
        const paymentStatus = isSuccess ? 'SUCCESS' : (isPending ? 'PENDING' : 'FAILURE');

        if ([4, 5].includes(user.userRole)) {
            const [companyAdmin, superAdmin] = await Promise.all([
                dbService.findOne(model.user, { companyId: user.companyId, userRole: 2, isActive: true }),
                dbService.findOne(model.user, { id: 1, companyId: 1, userRole: 1, isActive: true })
            ]);

            if (companyAdmin && superAdmin) {
                commData.users.companyAdmin = companyAdmin;
                commData.users.superAdmin = superAdmin;

                const [companyWallet, superAdminWallet] = await Promise.all([
                    dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                    dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 })
                ]);
                commData.wallets.companyWallet = companyWallet;
                commData.wallets.superAdminWallet = superAdminWallet;

                if (user.userRole === 4) {
                    const distributor = await dbService.findOne(model.user, { id: user.id, companyId: user.companyId, isActive: true });
                    commData.users.distributor = distributor;
                    commData.wallets.distributorWallet = currentWallet;

                    if (distributor.reportingTo === companyAdmin.id || distributor.reportingTo === null) {
                        commData.scenario = 'DIST_DIRECT';
                        const [SuperAdminSlabComm, companySlabComm] = await Promise.all([
                            dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
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
                                dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: masterDistributor.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                            ]);

                            commData.slabs.saSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'AD'));
                            commData.slabs.wlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
                            commData.slabs.mdSlab = companySlabComm?.find(c => c.roleType === 3);
                            commData.slabs.distSlab = mdSlabComm?.find(c => c.roleType === 4);
                        }
                    }
                } else if (user.userRole === 5) {
                    const retailer = await dbService.findOne(model.user, { id: user.id, companyId: user.companyId, isActive: true });
                    commData.users.retailer = retailer;
                    commData.wallets.retailerWallet = currentWallet;

                    let reportingUser = null;
                    if (retailer.reportingTo && retailer.reportingTo !== companyAdmin.id) {
                        reportingUser = await dbService.findOne(model.user, { id: retailer.reportingTo, companyId: user.companyId, isActive: true });
                    }

                    if (!reportingUser || retailer.reportingTo === companyAdmin.id || retailer.reportingTo === null) {
                        commData.scenario = 'RET_DIRECT';
                        const [SuperAdminSlabComm, companySlabComm] = await Promise.all([
                            dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                        ]);

                        commData.slabs.saSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'AD'));
                        commData.slabs.wlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
                        commData.slabs.retSlab = companySlabComm?.find(c => c.roleType === 5);
                    } else if (reportingUser.userRole === 3) {
                        commData.scenario = 'RET_MD';
                        commData.users.masterDistributor = reportingUser;
                        commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: reportingUser.id, companyId: user.companyId });

                        const [SuperAdminSlabComm, companySlabComm, masterDistributorComm] = await Promise.all([
                            dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: reportingUser.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
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
                                dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: reportingUser.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
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
                                    dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                    dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                    dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: masterDistributor.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                    dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: reportingUser.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
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

                const operatorCommissionAmount = operator.comm ? calcSlabAmount({ amtType: operator.amtType, commAmt: operator.comm }, amountNumber) : 0;
                const saSlabAmount = commData.slabs.saSlab ? calcSlabAmount(commData.slabs.saSlab, amountNumber) : 0;
                const wlSlabAmount = commData.slabs.wlSlab ? calcSlabAmount(commData.slabs.wlSlab, amountNumber) : 0;
                let mdSlabAmount = commData.slabs.mdSlab ? calcSlabAmount(commData.slabs.mdSlab, amountNumber) : 0;
                let distSlabAmount = commData.slabs.distSlab ? calcSlabAmount(commData.slabs.distSlab, amountNumber) : 0;
                let retSlabAmount = commData.slabs.retSlab ? calcSlabAmount(commData.slabs.retSlab, amountNumber) : 0;

                let companyCost = 0;
                if (commData.users.masterDistributor) companyCost = mdSlabAmount;
                else if (commData.users.distributor) companyCost = distSlabAmount;
                else companyCost = retSlabAmount;

                commData.amounts.superAdminComm = Math.max(0, round4(operatorCommissionAmount - wlSlabAmount));
                if (wlSlabAmount > operatorCommissionAmount) {
                    commData.amounts.saShortfall = parseFloat((wlSlabAmount - operatorCommissionAmount).toFixed(4));
                } else {
                    commData.amounts.saShortfall = 0;
                }

                commData.amounts.companyComm = Math.max(0, round4(wlSlabAmount - companyCost));
                if (companyCost > wlSlabAmount) {
                    commData.amounts.wlShortfall = parseFloat((companyCost - wlSlabAmount).toFixed(4));
                }

                if (commData.users.masterDistributor) {
                    let mdCost = commData.users.distributor ? distSlabAmount : retSlabAmount;
                    commData.amounts.mdComm = Math.max(0, round4(mdSlabAmount - mdCost));
                    if (mdCost > mdSlabAmount) {
                        commData.amounts.mdShortfall = parseFloat((mdCost - mdSlabAmount).toFixed(4));
                    }
                }

                if (commData.users.distributor) {
                    commData.amounts.distComm = Math.max(0, round4(distSlabAmount - retSlabAmount));
                    if (retSlabAmount > distSlabAmount) {
                        commData.amounts.distShortfall = parseFloat((retSlabAmount - distSlabAmount).toFixed(4));
                    }
                }

                commData.amounts.retailerComm = retSlabAmount;
            }
        }

        let retailerComm = 0;
        let distributorComm = 0;
        let masterDistributorComm = 0;
        let companyComm = 0;
        let superAdminComm = 0;

        if (isSuccess || isPending) {
            const openingMainWallet = round4(currentWallet.mainWallet || 0);

            if ([4, 5].includes(user.userRole)) {
                retailerComm = commData.amounts.retailerComm;
                distributorComm = commData.amounts.distComm;
                masterDistributorComm = commData.amounts.mdComm;
                companyComm = commData.amounts.companyComm;
                superAdminComm = commData.amounts.superAdminComm;

                const historyPromises = [];
                const walletUpdates = [];
                const remarkStatus = isPending ? ` Pending-mATM Cash Withdrawal` : `-mATM Cash Withdrawal`;
                const remarkText = `mATM${remarkStatus}`;

                if (commData.users.retailer && commData.wallets.retailerWallet) {
                    const retailerOpening = round4(commData.wallets.retailerWallet.mainWallet);
                    // For mATM Cash Withdrawal, wallet is loaded/credited
                    const retailerClosing = round4(retailerOpening + amountNumber + commData.amounts.retailerComm);

                    walletUpdates.push(
                        dbService.update(model.wallet, { id: commData.wallets.retailerWallet.id }, { mainWallet: retailerClosing, updatedBy: user.id })
                    );

                    historyPromises.push(dbService.createOne(model.walletHistory, {
                        refId: user.id,
                        companyId: user.companyId,
                        walletType: 'mainWallet',
                        operator: operator.operatorName,
                        remark: remarkText,
                        amount: amountNumber,
                        comm: commData.amounts.retailerComm,
                        surcharge: 0,
                        openingAmt: retailerOpening,
                        closingAmt: retailerClosing,
                        credit: amountNumber + commData.amounts.retailerComm,
                        debit: 0,
                        transactionId: transactionId,
                        paymentStatus: paymentStatus,
                        addedBy: user.id,
                        updatedBy: user.id
                    }));
                }

                if (commData.users.distributor && commData.wallets.distributorWallet) {
                    const dWallet = commData.wallets.distributorWallet;
                    const dOpening = round4(dWallet.mainWallet);
                    let dClosing;
                    let dDebit = 0;
                    let dCredit = 0;
                    let dRemark = `${remarkText} - dist comm`;

                    if (user.userRole === 4) {
                        dClosing = round4(dOpening + amountNumber + commData.amounts.distComm);
                        dCredit = amountNumber + commData.amounts.distComm;
                        dRemark = remarkText;
                    } else {
                        const dNet = commData.amounts.distComm - commData.amounts.distShortfall;
                        dClosing = round4(dOpening + dNet);
                        dCredit = commData.amounts.distComm;
                        dDebit = commData.amounts.distShortfall;
                    }

                    walletUpdates.push(
                        dbService.update(model.wallet, { id: dWallet.id }, { mainWallet: dClosing, updatedBy: commData.users.distributor.id })
                    );

                    historyPromises.push(dbService.createOne(model.walletHistory, {
                        refId: commData.users.distributor.id,
                        companyId: user.companyId,
                        walletType: 'mainWallet',
                        operator: operator.operatorName,
                        remark: dRemark,
                        amount: amountNumber,
                        comm: commData.amounts.distComm,
                        surcharge: 0,
                        openingAmt: dOpening,
                        closingAmt: dClosing,
                        credit: dCredit,
                        debit: dDebit,
                        transactionId: transactionId,
                        paymentStatus: paymentStatus,
                        addedBy: commData.users.distributor.id,
                        updatedBy: commData.users.distributor.id
                    }));
                }

                if (commData.users.masterDistributor) {
                    const mWallet = commData.wallets.masterDistributorWallet;
                    const mOpening = round4(mWallet.mainWallet);
                    const mNet = commData.amounts.mdComm - commData.amounts.mdShortfall;
                    const mClosing = round4(mOpening + mNet);

                    walletUpdates.push(
                        dbService.update(model.wallet, { id: mWallet.id }, { mainWallet: mClosing, updatedBy: commData.users.masterDistributor.id })
                    );

                    historyPromises.push(dbService.createOne(model.walletHistory, {
                        refId: commData.users.masterDistributor.id,
                        companyId: user.companyId,
                        walletType: 'mainWallet',
                        operator: operator.operatorName,
                        remark: `${remarkText} - md comm`,
                        amount: amountNumber,
                        comm: commData.amounts.mdComm,
                        surcharge: 0,
                        openingAmt: mOpening,
                        closingAmt: mClosing,
                        credit: commData.amounts.mdComm,
                        debit: commData.amounts.mdShortfall,
                        transactionId: transactionId,
                        paymentStatus: paymentStatus,
                        addedBy: commData.users.masterDistributor.id,
                        updatedBy: commData.users.masterDistributor.id
                    }));
                }

                const cWallet = commData.wallets.companyWallet;
                const cOpening = round4(cWallet.mainWallet);
                const cNet = commData.amounts.companyComm - commData.amounts.wlShortfall;
                const cClosing = round4(cOpening + cNet);

                walletUpdates.push(
                    dbService.update(model.wallet, { id: cWallet.id }, { mainWallet: cClosing, updatedBy: commData.users.companyAdmin.id })
                );

                historyPromises.push(dbService.createOne(model.walletHistory, {
                    refId: commData.users.companyAdmin.id,
                    companyId: user.companyId,
                    walletType: 'mainWallet',
                    operator: operator.operatorName,
                    remark: `${remarkText} - company comm`,
                    amount: amountNumber,
                    comm: commData.amounts.companyComm,
                    surcharge: 0,
                    openingAmt: cOpening,
                    closingAmt: cClosing,
                    credit: commData.amounts.companyComm,
                    debit: commData.amounts.wlShortfall,
                    transactionId: transactionId,
                    paymentStatus: paymentStatus,
                    addedBy: commData.users.companyAdmin.id,
                    updatedBy: commData.users.companyAdmin.id
                }));

                const saWallet = commData.wallets.superAdminWallet;
                const saOpening = round4(saWallet.mainWallet);
                const saNet = commData.amounts.superAdminComm - commData.amounts.saShortfall;
                const saClosing = round4(saOpening + saNet);

                walletUpdates.push(
                    dbService.update(model.wallet, { id: saWallet.id }, { mainWallet: saClosing, updatedBy: commData.users.superAdmin.id })
                );

                historyPromises.push(dbService.createOne(model.walletHistory, {
                    refId: commData.users.superAdmin.id,
                    companyId: 1,
                    walletType: 'mainWallet',
                    operator: operator.operatorName,
                    remark: `${remarkText} - admin comm`,
                    amount: amountNumber,
                    comm: commData.amounts.superAdminComm,
                    surcharge: 0,
                    openingAmt: saOpening,
                    closingAmt: saClosing,
                    credit: commData.amounts.superAdminComm,
                    debit: commData.amounts.saShortfall,
                    transactionId: transactionId,
                    paymentStatus: paymentStatus,
                    addedBy: commData.users.superAdmin.id,
                    updatedBy: commData.users.superAdmin.id
                }));

                await Promise.all([...walletUpdates, ...historyPromises]);

            } else {
                const closing = round4(openingMainWallet + amountNumber);
                await dbService.update(model.wallet, { id: currentWallet.id }, { mainWallet: closing, updatedBy: user.id });

                const remarkStatus = isPending ? ` Pending-mATM Cash Withdrawal` : `-mATM Cash Withdrawal`;
                await dbService.createOne(model.walletHistory, {
                    refId: user.id,
                    companyId: user.companyId,
                    walletType: 'mainWallet',
                    operator: operator.operatorName || 'MATM',
                    remark: `mATM${remarkStatus}`,
                    amount: amountNumber,
                    comm: 0,
                    surcharge: 0,
                    openingAmt: openingMainWallet,
                    closingAmt: closing,
                    credit: amountNumber,
                    debit: 0,
                    transactionId: transactionId,
                    paymentStatus: paymentStatus,
                    addedBy: user.id,
                    updatedBy: user.id
                });
            }
        }

        const serviceTransactionData = {
            refId: user.id,
            companyId: user.companyId,
            serviceType: 'MATM',
            amount: amountNumber,
            orderid: transactionId,
            transactionId: transactionId,
            txid: txid,
            status: paymentStatus,
            message: message || (isSuccess ? 'Transaction Successful' : 'Transaction Failed'),
            superadminComm: superAdminComm,
            whitelabelComm: companyComm,
            masterDistributorCom: masterDistributorComm,
            distributorCom: distributorComm,
            retailerCom: retailerComm,
            isActive: true,
            addedBy: user.id
        };

        const matmHistoryData = {
            ...serviceTransactionData,
            superadminSurcharge: 0,
            whitelabelSurcharge: 0,
            masterDistributorSurcharge: 0,
            distributorSurcharge: 0,
            retailerSurcharge: 0,
            apiResponse: apiResponse || null
        };
        delete matmHistoryData.serviceType;
        delete matmHistoryData.isActive;
        
        const createdTxn = await dbService.createOne(model.matmHistory, matmHistoryData);

        if (isSuccess) {
            return res.success({ message: 'mATM Transaction successful', data: createdTxn });
        } else if (isPending) {
            return res.success({ message: 'mATM Transaction pending', data: createdTxn });
        } else {
            return res.failure({ message: 'mATM Transaction failed', data: createdTxn });
        }
    } catch (error) {
        console.error('mATM error:', error);
        return res.internalServerError({ message: error.message });
    }
};

module.exports = {
    processMatmTransaction
};
