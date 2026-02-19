const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const inspayService = require('../../../services/inspayService');
const { Op, Sequelize } = require('sequelize');
const { generateTransactionID } = require('../../../utils/transactionID');

const round2 = (num) => {
    const n = Number(num);
    return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
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

const recharge = async (req, res) => {
    try {
        const { mobileNumber, opcode, amount, circle, value1, value2, value3, value4 } = req.body;

        if (!mobileNumber) {
            return res.failure({ message: 'Mobile number is required' });
        }
        if (!opcode) {
            return res.failure({ message: 'Operator code is required' });
        }
        if (!amount) {
            return res.failure({ message: 'Amount is required' });
        }
        if (!circle) {
            return res.failure({ message: 'Circle is required' });
        }

        const amountNumber = round2(parseFloat(amount));
        const user = req.user;

        const [existingUser, operator, existingCompany] = await Promise.all([
            dbService.findOne(model.user, { id: user.id, companyId: user.companyId }),
            dbService.findOne(model.operator, { operatorCode: opcode }),
            dbService.findOne(model.company, { id: user.companyId })
        ]);

        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        if (!operator) {
            return res.failure({ message: 'Operator not found' });
        }

        const operatorType = operator.operatorType || 'RECHARGE';

        // Our own custom transaction ID (separate from provider orderid / txid)
        const transactionId = generateTransactionID(existingCompany?.companyName);

        // Use Dummy Response for Testing - Using transactionId as orderid to prevent duplicates
        const response = {
            txid: 54028212,
            status: 'Success',
            opid: '346451228',
            number: mobileNumber,
            amount: amount,
            dr_amount: 21.78,
            orderid: transactionId, // Use generated transactionId to ensure uniqueness
            operatorName: operator.operatorName
        };

        const wallet = await model.wallet.findOne({
            where: { refId: user.id, companyId: user.companyId }
        });

        // const [response, wallet] = await Promise.all([
        //     inspayService.Recharge(mobileNumber, opcode, amount, value1, value2, value3, value4, transactionId), // Passing transactionId if supported/needed
        //     model.wallet.findOne({
        //         where: { refId: user.id, companyId: user.companyId }
        //     })
        // ]);

        // DEBUG: Log the full response to understand what we are getting
        console.log('Recharge API Response:', JSON.stringify(response, null, 2));

        // Use response.orderid if present, otherwise fallback to our transactionId if response doesn't provide a unique order ref
        // adapting to prevent NULL unique violation if API fails to return orderid
        const orderid = response.orderid || transactionId;

        const isSuccess = response.status === 'Success' || response.status === 'SUCCESS';
        const isPending = response.status === 'Pending' || response.status === 'PENDING';
        const paymentStatus = isSuccess ? 'SUCCESS' : (isPending ? 'PENDING' : 'FAILURE');

        // Create wallet if doesn't exist
        let currentWallet = wallet;
        if (!currentWallet) {
            currentWallet = await model.wallet.create({
                refId: user.id,
                companyId: user.companyId,
                roleType: user.userType,
                mainWallet: 0,
                apes1Wallet: 0,
                apes2Wallet: 0,
                addedBy: user.id,
                updatedBy: user.id
            });
        }

        const openingMainWallet = round2(currentWallet.mainWallet || 0);

        let retailerComm = 0;
        let distributorComm = 0;
        let masterDistributorComm = 0;
        let companyComm = 0;
        let superAdminComm = 0;

        // Log Inputs for Commission Calculation
        console.log('Commission Input:', {
            userRole: user.userRole,
            companyId: user.companyId,
            operatorId: operator.id,
            operatorType,
            amount: amountNumber
        });

        if (isSuccess && [4, 5].includes(user.userRole)) {
            // New Margin-Based Commission Logic
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

            // 1. Fetch Company Admin and Super Admin
            const [companyAdmin, superAdmin] = await Promise.all([
                dbService.findOne(model.user, { companyId: user.companyId, userRole: 2, isActive: true }),
                dbService.findOne(model.user, { id: 1, companyId: 1, userRole: 1, isActive: true })
            ]);

            if (!companyAdmin || !superAdmin) {
                console.error('CRITICAL: Company Admin or Super Admin not found for commission calculation', { userId: user.id });
            } else {
                commData.users.companyAdmin = companyAdmin;
                commData.users.superAdmin = superAdmin;

                // 2. Fetch Common Wallets
                const [companyWallet, superAdminWallet] = await Promise.all([
                    dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                    dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 })
                ]);
                commData.wallets.companyWallet = companyWallet;
                commData.wallets.superAdminWallet = superAdminWallet;

                // 3. Scenario Identification & Slab Fetching
                if (user.userRole === 4) {
                    // Distributor
                    const distributor = await dbService.findOne(model.user, { id: user.id, companyId: user.companyId, isActive: true });
                    commData.users.distributor = distributor;
                    commData.wallets.distributorWallet = wallet;

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

                            commData.slabs.saSlab = SuperAdminSlabComm?.find(c => c.roleType === 1);
                            commData.slabs.wlSlab = SuperAdminSlabComm?.find(c => c.roleType === 2);
                            commData.slabs.mdSlab = companySlabComm?.find(c => c.roleType === 3);
                            commData.slabs.distSlab = mdSlabComm?.find(c => c.roleType === 4);
                        }
                    }

                } else if (user.userRole === 5) {
                    // Retailer
                    const retailer = await dbService.findOne(model.user, { id: user.id, companyId: user.companyId, isActive: true });
                    commData.users.retailer = retailer;
                    commData.wallets.retailerWallet = wallet;

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
                        commData.slabs.saSlab = SuperAdminSlabComm?.find(c => c.roleType === 1);
                        commData.slabs.wlSlab = SuperAdminSlabComm?.find(c => c.roleType === 2);
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
                        commData.slabs.saSlab = SuperAdminSlabComm?.find(c => c.roleType === 1);
                        commData.slabs.wlSlab = SuperAdminSlabComm?.find(c => c.roleType === 2);
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
                            commData.slabs.saSlab = SuperAdminSlabComm?.find(c => c.roleType === 1);
                            commData.slabs.wlSlab = SuperAdminSlabComm?.find(c => c.roleType === 2);
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
                                commData.slabs.saSlab = SuperAdminSlabComm?.find(c => c.roleType === 1);
                                commData.slabs.wlSlab = SuperAdminSlabComm?.find(c => c.roleType === 2);
                                commData.slabs.mdSlab = companySlabComm?.find(c => c.roleType === 3);
                                commData.slabs.distSlab = mdSlabComm?.find(c => c.roleType === 4);
                                commData.slabs.retSlab = distSlabComm?.find(c => c.roleType === 5);
                            }
                        }
                    }
                }

                // DEBUG: Log Fetched Slabs
                console.log('Fetched Slabs:', {
                    scenario: commData.scenario,
                    saSlab: commData.slabs.saSlab ? { id: commData.slabs.saSlab.id, comm: commData.slabs.saSlab.commAmt, type: commData.slabs.saSlab.amtType } : 'MISSING',
                    wlSlab: commData.slabs.wlSlab ? { id: commData.slabs.wlSlab.id, comm: commData.slabs.wlSlab.commAmt, type: commData.slabs.wlSlab.amtType } : 'MISSING',
                    mdSlab: commData.slabs.mdSlab ? { id: commData.slabs.mdSlab.id, comm: commData.slabs.mdSlab.commAmt, type: commData.slabs.mdSlab.amtType } : 'MISSING',
                    distSlab: commData.slabs.distSlab ? { id: commData.slabs.distSlab.id, comm: commData.slabs.distSlab.commAmt, type: commData.slabs.distSlab.amtType } : 'MISSING',
                    retSlab: commData.slabs.retSlab ? { id: commData.slabs.retSlab.id, comm: commData.slabs.retSlab.commAmt, type: commData.slabs.retSlab.amtType } : 'MISSING'
                });

                // 4. Calculate Amounts & Margins
                const saSlabAmount = commData.slabs.saSlab ? calcSlabAmount(commData.slabs.saSlab, amountNumber) : 0;
                const wlSlabAmount = commData.slabs.wlSlab ? calcSlabAmount(commData.slabs.wlSlab, amountNumber) : 0;
                let mdSlabAmount = commData.slabs.mdSlab ? calcSlabAmount(commData.slabs.mdSlab, amountNumber) : 0;
                let distSlabAmount = commData.slabs.distSlab ? calcSlabAmount(commData.slabs.distSlab, amountNumber) : 0;
                let retSlabAmount = commData.slabs.retSlab ? calcSlabAmount(commData.slabs.retSlab, amountNumber) : 0;

                console.log(`Commission Calculation [${commData.scenario}]: SA(${saSlabAmount}) -> WL(${wlSlabAmount}) -> MD(${mdSlabAmount}) -> Dist(${distSlabAmount}) -> Ret(${retSlabAmount})`);

                // Margins & Shortfalls

                // Super Admin
                // Super Admin
                commData.amounts.superAdminComm = Math.max(0, saSlabAmount - wlSlabAmount);
                if (wlSlabAmount > saSlabAmount) {
                    commData.amounts.saShortfall = parseFloat((wlSlabAmount - saSlabAmount).toFixed(2));
                }

                // Company (WL)
                let companyCost = 0;
                if (commData.users.masterDistributor) companyCost = mdSlabAmount;
                else if (commData.users.distributor) companyCost = distSlabAmount;
                else companyCost = retSlabAmount;

                commData.amounts.companyComm = Math.max(0, wlSlabAmount - companyCost);
                if (companyCost > wlSlabAmount) {
                    commData.amounts.wlShortfall = parseFloat((companyCost - wlSlabAmount).toFixed(2));
                }

                // Master Distributor
                if (commData.users.masterDistributor) {
                    let mdCost = commData.users.distributor ? distSlabAmount : retSlabAmount;
                    commData.amounts.mdComm = Math.max(0, mdSlabAmount - mdCost);
                    if (mdCost > mdSlabAmount) {
                        commData.amounts.mdShortfall = parseFloat((mdCost - mdSlabAmount).toFixed(2));
                    }
                }

                // Distributor
                if (commData.users.distributor) {
                    commData.amounts.distComm = Math.max(0, distSlabAmount - retSlabAmount);
                    if (retSlabAmount > distSlabAmount) {
                        commData.amounts.distShortfall = parseFloat((retSlabAmount - distSlabAmount).toFixed(2));
                    }
                }

                // Retailer (User)
                commData.amounts.retailerComm = retSlabAmount;

                // 5. Update Wallets & Create History
                const historyPromises = [];
                const walletUpdates = [];
                const remarkText = `Recharge-${operator.operatorName}`;

                // A. Retailer Update (User)
                const retailerOpening = round2(commData.wallets.retailerWallet.mainWallet);
                const retailerClosing = round2(retailerOpening - amountNumber + commData.amounts.retailerComm);

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
                    credit: commData.amounts.retailerComm,
                    debit: amountNumber, // Full Debit here, credit separate just for logic check. Actually net change is important.
                    transactionId: orderid,
                    paymentStatus: 'SUCCESS',
                    addedBy: user.id,
                    updatedBy: user.id
                }));

                // B. Distributor Update
                if (commData.users.distributor) {
                    const dWallet = commData.wallets.distributorWallet;
                    const dOpening = round2(dWallet.mainWallet);
                    const dNet = commData.amounts.distComm - commData.amounts.distShortfall;
                    const dClosing = round2(dOpening + dNet);

                    walletUpdates.push(
                        dbService.update(model.wallet, { id: dWallet.id }, { mainWallet: dClosing, updatedBy: commData.users.distributor.id })
                    );

                    historyPromises.push(dbService.createOne(model.walletHistory, {
                        refId: commData.users.distributor.id,
                        companyId: user.companyId,
                        walletType: 'mainWallet',
                        operator: operator.operatorName,
                        remark: `${remarkText} - dist comm`,
                        amount: amountNumber,
                        comm: commData.amounts.distComm,
                        surcharge: 0,
                        openingAmt: dOpening,
                        closingAmt: dClosing,
                        credit: commData.amounts.distComm,
                        debit: commData.amounts.distShortfall,
                        transactionId: orderid,
                        paymentStatus: 'SUCCESS',
                        addedBy: commData.users.distributor.id,
                        updatedBy: commData.users.distributor.id
                    }));
                }

                // C. Master Distributor Update
                if (commData.users.masterDistributor) {
                    const mWallet = commData.wallets.masterDistributorWallet;
                    const mOpening = round2(mWallet.mainWallet);
                    const mNet = commData.amounts.mdComm - commData.amounts.mdShortfall;
                    const mClosing = round2(mOpening + mNet);

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
                        transactionId: orderid,
                        paymentStatus: 'SUCCESS',
                        addedBy: commData.users.masterDistributor.id,
                        updatedBy: commData.users.masterDistributor.id
                    }));
                }

                // D. Company Update
                const cWallet = commData.wallets.companyWallet;
                const cOpening = round2(cWallet.mainWallet);
                const cNet = commData.amounts.companyComm - commData.amounts.wlShortfall;
                const cClosing = round2(cOpening + cNet);

                walletUpdates.push(
                    dbService.update(model.wallet, { id: cWallet.id }, { mainWallet: cClosing, updatedBy: companyAdmin.id })
                );

                historyPromises.push(dbService.createOne(model.walletHistory, {
                    refId: companyAdmin.id,
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
                    transactionId: orderid,
                    paymentStatus: 'SUCCESS',
                    addedBy: companyAdmin.id,
                    updatedBy: companyAdmin.id
                }));

                // E. Super Admin Update
                const saWallet = commData.wallets.superAdminWallet;
                const saOpening = round2(saWallet.mainWallet);
                const saNet = commData.amounts.superAdminComm - commData.amounts.saShortfall;
                const saClosing = round2(saOpening + saNet);

                walletUpdates.push(
                    dbService.update(model.wallet, { id: saWallet.id }, { mainWallet: saClosing, updatedBy: superAdmin.id })
                );

                historyPromises.push(dbService.createOne(model.walletHistory, {
                    refId: superAdmin.id,
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
                    transactionId: orderid,
                    paymentStatus: 'SUCCESS',
                    addedBy: superAdmin.id,
                    updatedBy: superAdmin.id
                }));

                // Execute Updates
                await Promise.all([...walletUpdates, ...historyPromises]);

                // Update outer variables for response structure if needed
                retailerComm = commData.amounts.retailerComm;
                distributorComm = commData.amounts.distComm;
                masterDistributorComm = commData.amounts.mdComm;
                companyComm = commData.amounts.companyComm;
                superAdminComm = commData.amounts.superAdminComm;
            }
        }

        // 6. Generic Logic for Non-Roles (Fallback)
        if (isSuccess && ![4, 5].includes(user.userRole)) {
            const opening = round2(wallet.mainWallet);
            const closing = round2(opening - amountNumber);
            await dbService.update(model.wallet, { id: wallet.id }, { mainWallet: closing, updatedBy: user.id });

            await dbService.createOne(model.walletHistory, {
                refId: user.id,
                companyId: user.companyId,
                walletType: 'mainWallet',
                operator: operator.operatorName,
                remark: `Recharge-${operator.operatorName}`,
                amount: amountNumber,
                comm: 0,
                surcharge: 0,
                openingAmt: opening,
                closingAmt: closing,
                credit: 0,
                debit: amountNumber,
                transactionId: orderid,
                paymentStatus: 'SUCCESS',
                addedBy: user.id,
                updatedBy: user.id
            });
        }

        if (isSuccess) response.operatorName = operator?.operatorName;

        const serviceTransactionData = {
            refId: user.id,
            companyId: user.companyId,
            serviceType: 'MobileRecharge',
            mobileNumber,
            opcode,
            circle: circle || null,
            amount: amountNumber,
            orderid,
            transactionId,
            txid: response.txid || null,
            status: paymentStatus,
            opid: response.opid || null,
            message: response.message || null,
            value1: value1 || null,
            value2: value2 || null,
            value3: value3 || null,
            value4: value4 || null,
            apiResponse: response,
            superadminComm: paymentStatus === 'SUCCESS' ? superAdminComm : 0,
            whitelabelComm: paymentStatus === 'SUCCESS' ? companyComm : 0,
            masterDistributorCom: paymentStatus === 'SUCCESS' ? masterDistributorComm : 0,
            distributorCom: paymentStatus === 'SUCCESS' ? distributorComm : 0,
            retailerCom: paymentStatus === 'SUCCESS' ? retailerComm : 0,
            isActive: true,
            addedBy: user.id
        };

        const rechargeRecord = await dbService.createOne(model.serviceTransaction, serviceTransactionData);

        const responseData = {
            orderid,
            transactionId,
            apiResponse: response
        };

        if (isSuccess) {
            return res.success({
                message: response.message || 'Recharge successful',
                data: responseData
            });
        } else if (isPending) {
            return res.success({
                message: response.message || 'Recharge in process',
                data: responseData
            });
        } else {
            return res.failure({
                message: response.message || 'Recharge failed',
                data: responseData
            });
        }
    } catch (error) {
        console.error('Recharge error:', error);
        return res.internalServerError({ message: error.message });
    }
};

const findMobileNumberOperator = async (req, res) => {
    try {
        const { mobileNumber } = req.body;
        if (!mobileNumber) {
            return res.failure({ message: 'Mobile number is required' });
        }

        let existingRecord = await dbService.findOne(model.findMobileOperators, { mobileNumber });

        if (existingRecord) {
            const response = existingRecord.response;
            const operatorName = response?.company || response?.operatorName;

            if (operatorName) {
                const operatorNameUpper = operatorName.toUpperCase();
                if (operatorNameUpper !== 'BSNL') {
                    const operator = await dbService.findOne(model.operator, { operatorName: operatorNameUpper });
                    if (operator) {
                        response.operatorCode = operator.operatorCode;
                    }
                }
            }

            return res.success({ message: 'Operator retrieved successfully', data: response });
        }

        const response = await inspayService.operatorFetch(mobileNumber);

        console.log('response', response);
        if (!response) {
            return res.failure({ message: 'Failed to fetch operator information' });
        }

        const operatorName = response?.company || response?.operatorName;
        if (!operatorName) {
            return res.failure({ message: response.message || 'Operator name not found in response' });
        }

        const operatorNameUpper = operatorName.toUpperCase();
        if (operatorNameUpper !== 'BSNL') {
            const operator = await dbService.findOne(model.operator, { operatorName: operatorNameUpper });
            if (!operator) {
                return res.failure({ message: 'Operator not found' });
            }
            response.operatorCode = operator.operatorCode;
        }

        // Store in database
        await dbService.createOne(model.findMobileOperators, {
            mobileNumber,
            response
        });

        if (response.status === 'Success' || response.status.toUpperCase() === 'SUCCESS') {
            return res.success({ message: 'Operator retrieved successfully', data: response });
        } else {
            return res.failure({ message: response.message || 'Failed to fetch operator' });
        }
    } catch (error) {
        console.log(error);
        return res.failure({ message: error.message });
    }
};

const findAllRechargePlanFetch = async (req, res) => {
    try {
        const { mobileNumber, opCode, circle } = req.body;
        if (!mobileNumber) {
            return res.failure({ message: 'Mobile number is required' });
        }
        if (!opCode) {
            return res.failure({ message: 'Operator code is required' });
        }
        if (!circle) {
            return res.failure({ message: 'Circle is required' });
        }
        const operator = await dbService.findOne(model.operator, { operatorCode: opCode });
        if (!operator) {
            return res.failure({ message: 'Operator not found' });
        }

        // Check if recharge plan exists in database for this opCode
        let existingPlan = await dbService.findOne(model.rechargePlanFetch, { opCode });

        if (existingPlan) {
            // Return from database
            return res.success({
                message: 'Recharge plan retrieved successfully',
                data: existingPlan.response
            });
        }

        // Fetch from API if not in database
        const response = await inspayService.rechargePlanFetch(mobileNumber, opCode, circle);
        console.log('response', response);

        if (response.status === 'Success') {
            // Store in database
            await dbService.createOne(model.rechargePlanFetch, {
                opCode,
                response
            });
            return res.success({ message: 'Recharge plan retrieved successfully', data: response });
        } else {
            return res.failure({ message: response.message || 'Failed to fetch recharge plan' });
        }
    } catch (error) {
        console.log(error);
        return res.failure({ message: error.message });
    }
};

const findRechargeOfferFetch = async (req, res) => {
    try {
        const { mobileNumber, opCode, circle } = req.body;
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        if (!mobileNumber) {
            return res.failure({ message: 'Mobile number is required' });
        }
        if (!opCode) {
            return res.failure({ message: 'Operator code is required' });
        }
        if (!circle) {
            return res.failure({ message: 'Circle is required' });
        }
        const operator = await dbService.findOne(model.operator, { operatorCode: opCode });
        if (!operator) {
            return res.failure({ message: 'Operator not found' });
        }

        // Check if recharge offer exists in database for this opCode
        let existingOffer = await dbService.findOne(model.rechargeOfferFetch, { opCode });

        if (existingOffer) {
            // Return from database
            return res.success({
                message: 'Recharge offer retrieved successfully',
                data: existingOffer.response
            });
        }

        // Fetch from API if not in database
        const response = await inspayService.RechargeOfferFetch(mobileNumber, opCode, circle);
        console.log('response', response);

        if (response.status === 'Success') {
            // Store in database
            await dbService.createOne(model.rechargeOfferFetch, {
                opCode,
                response
            });
            return res.success({ message: 'Recharge offer retrieved successfully', data: response });
        } else {
            return res.failure({ message: response.message || 'Failed to fetch recharge offer' });
        }
    } catch (error) {
        console.log(error);
        return res.failure({ message: error.message });
    }
};

const getRechargeHistory = async (req, res) => {
    try {
        if (![4, 5].includes(req.user.userRole)) {
            return res.failure({ message: 'You are not authorized to access this resource' });
        }
        const rechargeHistory = await dbService.findAll(model.serviceTransaction, {
            refId: req.user?.id,
            companyId: req.user?.companyId,
            serviceType: 'MobileRecharge'
        }, {
            order: [['createdAt', 'DESC']]
        });
        if (!rechargeHistory || rechargeHistory.length === 0) {
            return res.success({ message: 'No recharge history found', data: [] });
        }
        return res.success({ message: 'Recharge history retrieved successfully', data: rechargeHistory });
    } catch (error) {
        console.log(error);
        return res.internalServerError({ message: error.message });
    }
};

const recentRechargeHistory = async (req, res) => {
    try {
        if (!req.user.companyId) {
            return res.failure({ message: 'Company ID is required' });
        }

        const dataToFind = req.body || {};
        let options = {};
        let query = {
            refId: req.user.id,
            companyId: req.user.companyId
        };

        if (dataToFind.query) {
            Object.keys(dataToFind.query).forEach(key => {
                if (key !== 'refId' && key !== 'companyId') {
                    query[key] = dataToFind.query[key];
                }
            });
        }

        if (dataToFind.options !== undefined) {
            options = { ...dataToFind.options };

            if (dataToFind.options.sort) {
                const sortEntries = Object.entries(dataToFind.options.sort);
                options.order = sortEntries.map(([field, direction]) => {
                    return [field, direction === -1 ? 'DESC' : 'ASC'];
                });
            } else {
                options.order = [['createdAt', 'DESC']];
            }
        } else {
            options.order = [['createdAt', 'DESC']];
        }

        if (dataToFind.customSearch && Object.keys(dataToFind.customSearch).length > 0) {
            const searchConditions = [];
            const customSearch = dataToFind.customSearch;

            if (customSearch.transactionId) {
                const searchValue = String(customSearch.transactionId).trim();
                if (searchValue) {
                    searchConditions.push({
                        transactionId: {
                            [Op.iLike]: `%${searchValue}%`
                        }
                    });
                }
            }

            if (customSearch.mobileNumber) {
                const searchValue = String(customSearch.mobileNumber).trim();
                if (searchValue) {
                    searchConditions.push({
                        mobileNumber: {
                            [Op.iLike]: `%${searchValue}%`
                        }
                    });
                }
            }

            if (customSearch.name) {
                const searchName = String(customSearch.name).trim();
                if (searchName) {
                    const matchingUsers = await dbService.findAll(model.user, {
                        id: req.user.id,
                        companyId: req.user.companyId,
                        name: {
                            [Op.iLike]: `%${searchName}%`
                        },
                        isDeleted: false
                    }, {
                        attributes: ['id']
                    });

                    const matchingUserIds = matchingUsers.map(u => u.id);
                    if (matchingUserIds.length > 0 && matchingUserIds.includes(req.user.id)) {
                        searchConditions.push({
                            refId: req.user.id
                        });
                    }
                }
            }

            if (searchConditions.length > 0) {
                query = {
                    ...query,
                    [Op.and]: [
                        { [Op.or]: searchConditions }
                    ]
                };
            } else {
                return res.status(200).send({
                    status: 'SUCCESS',
                    message: 'Recharge history retrieved successfully',
                    data: [],
                    total: 0,
                    paginator: {
                        page: options.page || 1,
                        paginate: options.paginate || 10,
                        totalPages: 0
                    }
                });
            }
        }

        const result = await dbService.paginate(model.serviceTransaction, query, options);

        if (!result || !result.data || result.data.length === 0) {
            return res.status(200).send({
                status: 'SUCCESS',
                message: 'No recharge history found',
                data: [],
                total: result?.total || 0,
                paginator: result?.paginator || {
                    page: options.page || 1,
                    paginate: options.paginate || 10,
                    totalPages: 0
                }
            });
        }

        const formattedData = result.data.map(transaction => {
            const transactionData = transaction.toJSON ? transaction.toJSON() : transaction;
            const serviceType = transactionData.serviceType;

            if (serviceType === 'MobileRecharge') {
                return {
                    mobileNumber: transactionData.mobileNumber || null,
                    amount: transactionData.amount || null,
                    opcode: transactionData.opcode || null,
                    status: transactionData.status || null,
                    transactionId: transactionData.transactionId || null,
                    createdAt: transactionData.createdAt || null,
                };
            }

            if (serviceType === 'DTHRecharge') {
                return {
                    dthNumber: transactionData.dthNumber || null,
                    amount: transactionData.amount || null,
                    opcode: transactionData.opcode || null,
                    status: transactionData.status || null,
                    transactionId: transactionData.transactionId || null,
                    createdAt: transactionData.createdAt || null,
                };
            }

            if (serviceType === 'Pan') {
                return {
                    mobileNumber: transactionData.mobile_number || null,
                    redirect_url: transactionData.redirect_url || null,
                    action: transactionData.action || null,
                    status: transactionData.status || null,
                    transactionId: transactionData.transactionId || null,
                    createdAt: transactionData.createdAt || null,
                };
            }

            return {
                mobileNumber: transactionData.mobileNumber || transactionData.mobile_number || null,
                amount: transactionData.amount || null,
                opcode: transactionData.opcode || null,
                status: transactionData.status || null,
                transactionId: transactionData.transactionId || null,
                createdAt: transactionData.createdAt || null,
            };
        });

        return res.status(200).send({
            status: 'SUCCESS',
            message: 'Recharge history retrieved successfully',
            data: formattedData,
            total: result.total || 0,
            paginator: result.paginator
        });
    } catch (error) {
        console.log(error);
        return res.internalServerError({ message: error.message });
    }
};

const getDownlineRechargeReports = async (req, res) => {
    try {
        if (![3, 4].includes(req.user.userRole)) {
            return res.failure({ message: 'You are not authorized to access this resource' });
        }

        if (!req.user.companyId) {
            return res.failure({ message: 'Company ID is required' });
        }

        const getAllDownlineUserIds = async (userId, userRole, companyId) => {
            const allUserIds = new Set();
            const allowedRoles = userRole === 3 ? [4, 5] : [5];
            let currentLevelUsers = [{ id: userId, userRole }];

            while (currentLevelUsers.length > 0) {
                const currentLevelIds = currentLevelUsers.map(u => u.id);
                const nextLevelUsers = await dbService.findAll(model.user, {
                    reportingTo: { [Op.in]: currentLevelIds },
                    companyId: companyId,
                    userRole: { [Op.in]: allowedRoles },
                    isDeleted: false
                }, {
                    attributes: ['id', 'userRole']
                });

                nextLevelUsers.forEach(user => {
                    if (user.id !== userId) {
                        allUserIds.add(user.id);
                    }
                });

                currentLevelUsers = nextLevelUsers;
            }

            return Array.from(allUserIds);
        };

        const downlineUserIds = await getAllDownlineUserIds(req.user.id, req.user.userRole, req.user.companyId);

        if (!downlineUserIds || downlineUserIds.length === 0) {
            return res.status(200).send({
                status: 'SUCCESS',
                message: 'No downline users found',
                data: [],
                total: 0,
                paginator: {
                    page: 1,
                    paginate: 10,
                    totalPages: 0
                }
            });
        }

        const dataToFind = req.body || {};
        let options = {};
        let query = {
            refId: { [Op.in]: downlineUserIds },
            companyId: req.user.companyId
        };

        if (dataToFind.query) {
            Object.keys(dataToFind.query).forEach(key => {
                if (key !== 'refId' && key !== 'companyId') {
                    query[key] = dataToFind.query[key];
                }
            });
        }

        if (dataToFind.options !== undefined) {
            options = { ...dataToFind.options };

            if (dataToFind.options.sort) {
                const sortEntries = Object.entries(dataToFind.options.sort);
                options.order = sortEntries.map(([field, direction]) => {
                    return [field, direction === -1 ? 'DESC' : 'ASC'];
                });
            } else {
                options.order = [['createdAt', 'DESC']];
            }
        } else {
            options.order = [['createdAt', 'DESC']];
        }

        if (dataToFind.customSearch && Object.keys(dataToFind.customSearch).length > 0) {
            const searchConditions = [];
            const customSearch = dataToFind.customSearch;

            if (customSearch.transactionId) {
                const searchValue = String(customSearch.transactionId).trim();
                if (searchValue) {
                    searchConditions.push({
                        transactionId: {
                            [Op.iLike]: `%${searchValue}%`
                        }
                    });
                }
            }

            if (customSearch.mobileNumber) {
                const searchValue = String(customSearch.mobileNumber).trim();
                if (searchValue) {
                    searchConditions.push({
                        mobileNumber: {
                            [Op.iLike]: `%${searchValue}%`
                        }
                    });
                }
            }

            if (customSearch.name) {
                const searchName = String(customSearch.name).trim();
                if (searchName) {
                    const matchingUsers = await dbService.findAll(model.user, {
                        id: { [Op.in]: downlineUserIds },
                        companyId: req.user.companyId,
                        name: {
                            [Op.iLike]: `%${searchName}%`
                        },
                        isDeleted: false
                    }, {
                        attributes: ['id']
                    });

                    const matchingUserIds = matchingUsers.map(u => u.id);
                    if (matchingUserIds.length > 0) {
                        searchConditions.push({
                            refId: { [Op.in]: matchingUserIds }
                        });
                    } else {
                        // If user search found no matching users, return empty result
                        return res.status(200).send({
                            status: 'SUCCESS',
                            message: 'Recharge reports retrieved successfully',
                            data: [],
                            total: 0,
                            paginator: {
                                page: options.page || 1,
                                paginate: options.paginate || 10,
                                totalPages: 0
                            }
                        });
                    }
                }
            }

            // Only apply search conditions if there are any valid conditions
            if (searchConditions.length > 0) {
                query = {
                    ...query,
                    [Op.and]: [
                        { [Op.or]: searchConditions }
                    ]
                };
            }
            // If no search conditions found, continue with base query (will return all records)
        }

        options.include = [
            {
                model: model.user,
                as: 'user',
                attributes: ['id', 'name', 'userId', 'mobileNo'],
                required: false
            }
        ];

        const result = await dbService.paginate(model.serviceTransaction, query, options);

        if (!result || !result.data || result.data.length === 0) {
            return res.status(200).send({
                status: 'SUCCESS',
                message: 'No recharge reports found',
                data: [],
                total: result?.total || 0,
                paginator: result?.paginator || {
                    page: options.page || 1,
                    paginate: options.paginate || 10,
                    totalPages: 0
                }
            });
        }

        return res.status(200).send({
            status: 'SUCCESS',
            message: 'Recharge reports retrieved successfully',
            data: result.data,
            total: result.total || 0,
            paginator: result.paginator
        });
    } catch (error) {
        console.log(error);
        return res.internalServerError({ message: error.message });
    }
};

const getRechargeReports = async (req, res) => {
    try {
        if (!req.user.companyId) {
            return res.failure({ message: 'Company ID is required' });
        }

        const dataToFind = req.body || {};
        let options = {};
        let query = {
            refId: req.user.id,
            companyId: req.user.companyId
        };

        if (dataToFind.query) {
            Object.keys(dataToFind.query).forEach(key => {
                if (key !== 'refId' && key !== 'companyId') {
                    query[key] = dataToFind.query[key];
                }
            });
        }

        if (dataToFind.options !== undefined) {
            options = { ...dataToFind.options };

            if (dataToFind.options.sort) {
                const sortEntries = Object.entries(dataToFind.options.sort);
                options.order = sortEntries.map(([field, direction]) => {
                    return [field, direction === -1 ? 'DESC' : 'ASC'];
                });
            } else {
                options.order = [['createdAt', 'DESC']];
            }
        } else {
            options.order = [['createdAt', 'DESC']];
        }

        if (dataToFind.customSearch && Object.keys(dataToFind.customSearch).length > 0) {
            const searchConditions = [];
            const customSearch = dataToFind.customSearch;

            if (customSearch.transactionId) {
                const searchValue = String(customSearch.transactionId).trim();
                if (searchValue) {
                    searchConditions.push({
                        transactionId: {
                            [Op.iLike]: `%${searchValue}%`
                        }
                    });
                }
            }

            if (customSearch.mobileNumber) {
                const searchValue = String(customSearch.mobileNumber).trim();
                if (searchValue) {
                    searchConditions.push({
                        mobileNumber: {
                            [Op.iLike]: `%${searchValue}%`
                        }
                    });
                }
            }

            // Only apply search conditions if there are any valid conditions
            if (searchConditions.length > 0) {
                query = {
                    ...query,
                    [Op.and]: [
                        { [Op.or]: searchConditions }
                    ]
                };
            }
            // If no search conditions found, continue with base query (will return all records)
        }

        options.include = [
            {
                model: model.user,
                as: 'user',
                attributes: ['id', 'name', 'userId', 'mobileNo'],
                required: false
            }
        ];

        const result = await dbService.paginate(model.serviceTransaction, query, options);

        if (!result || !result.data || result.data.length === 0) {
            return res.status(200).send({
                status: 'SUCCESS',
                message: 'No recharge reports found',
                data: [],
                total: result?.total || 0,
                paginator: result?.paginator || {
                    page: options.page || 1,
                    paginate: options.paginate || 10,
                    totalPages: 0
                }
            });
        }

        return res.status(200).send({
            status: 'SUCCESS',
            message: 'Recharge reports retrieved successfully',
            data: result.data,
            total: result.total || 0,
            paginator: result.paginator
        });
    } catch (error) {
        console.log(error);
        return res.internalServerError({ message: error.message });
    }
};

const deleteOldRechargePlan = async (req, res) => {
    try {
        const { opCode } = req.body;

        if (!opCode) {
            return res.failure({ message: 'Operator code is required' });
        }

        // Check if recharge plan exists
        const existingPlan = await dbService.findOne(model.rechargePlanFetch, { opCode });

        if (!existingPlan) {
            return res.failure({ message: 'Recharge plan not found for this operator code' });
        }

        // Delete the recharge plan
        await dbService.destroy(model.rechargePlanFetch, { opCode });

        return res.success({
            message: 'Old recharge plan deleted successfully',
            data: { opCode }
        });
    } catch (error) {
        console.log(error);
        return res.failure({ message: error.message });
    }
};

module.exports = {
    recharge,
    findMobileNumberOperator,
    getRechargeHistory,
    findAllRechargePlanFetch,
    findRechargeOfferFetch,
    getDownlineRechargeReports,
    getRechargeReports,
    recentRechargeHistory,
    deleteOldRechargePlan
};