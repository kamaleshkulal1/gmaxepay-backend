const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const inspayService = require('../../../services/inspayService');
const { Op, Sequelize } = require('sequelize');
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

        const amountNumber = round4(parseFloat(amount));
        const user = req.user;


        // 1. Fetch User, Operator, Company
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

        // 2. Pre-calculate Commission Data (only for roles 4 & 5)
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

        let currentWallet = null;

        // Fetch User Wallet First
        currentWallet = await model.wallet.findOne({
            where: { refId: user.id, companyId: user.companyId }
        });

        if (!currentWallet) {
            return res.failure({ message: 'Wallet not found' });
        }

        // Initial check for balance
        if (currentWallet.mainWallet < amountNumber) {
            return res.failure({ message: 'Insufficient balance' });
        }

        if ([4, 5].includes(user.userRole)) {
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

                // C. Scenario Identification & Slab Fetching
                if (user.userRole === 4) {
                    // Distributor
                    const distributor = await dbService.findOne(model.user, { id: user.id, companyId: user.companyId, isActive: true });
                    commData.users.distributor = distributor;
                    commData.wallets.distributorWallet = currentWallet;

                    if (distributor.reportingTo === companyAdmin.id || distributor.reportingTo === null) {
                        commData.scenario = 'DIST_DIRECT';
                        const [SuperAdminSlabComm, companySlabComm] = await Promise.all([
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: superAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
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
                                dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: superAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
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
                    // Retailer
                    const retailer = await dbService.findOne(model.user, { id: user.id, companyId: user.companyId, isActive: true });
                    commData.users.retailer = retailer;
                    commData.wallets.retailerWallet = currentWallet;

                    let reportingUser = null;
                    if (retailer.reportingTo && retailer.reportingTo !== companyAdmin.id) {
                        reportingUser = await dbService.findOne(model.user, { id: retailer.reportingTo, companyId: user.companyId, isActive: true });
                    }
                    console.log("operatorType", operatorType);

                    if (!reportingUser || retailer.reportingTo === companyAdmin.id || retailer.reportingTo === null) {
                        commData.scenario = 'RET_DIRECT';
                        console.log("superAdmin.slabId", superAdmin.slabId);
                        console.log("companyAdmin.slabId", companyAdmin.slabId);
                        const [SuperAdminSlabComm, companySlabComm] = await Promise.all([
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: superAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                        ]);

                        commData.slabs.saSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'AD'));
                        commData.slabs.wlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
                        commData.slabs.retSlab = companySlabComm?.find(c => c.roleType === 5);
                        console.log("commData.slabs.saSlab", commData.slabs.saSlab);
                        console.log("commData.slabs.wlSlab", commData.slabs.wlSlab);
                        console.log("commData.slabs.retSlab", commData.slabs.retSlab);

                    } else if (reportingUser.userRole === 3) {
                        commData.scenario = 'RET_MD';
                        commData.users.masterDistributor = reportingUser;
                        commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: reportingUser.id, companyId: user.companyId });

                        const [SuperAdminSlabComm, companySlabComm, masterDistributorComm] = await Promise.all([
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: superAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
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
                                dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: superAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
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
                                    dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: superAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
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

                // D. Calculate Amounts
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

                // Super Admin
                commData.amounts.superAdminComm = Math.max(0, operatorCommissionAmount - wlSlabAmount);
                if (wlSlabAmount > operatorCommissionAmount) {
                    commData.amounts.saShortfall = parseFloat((wlSlabAmount - operatorCommissionAmount).toFixed(4));
                } else {
                    commData.amounts.saShortfall = 0;
                }

                // Company (WL)
                commData.amounts.companyComm = Math.max(0, wlSlabAmount - companyCost);
                if (companyCost > wlSlabAmount) {
                    commData.amounts.wlShortfall = parseFloat((companyCost - wlSlabAmount).toFixed(4));
                }

                // Master Distributor
                if (commData.users.masterDistributor) {
                    let mdCost = commData.users.distributor ? distSlabAmount : retSlabAmount;
                    commData.amounts.mdComm = Math.max(0, mdSlabAmount - mdCost);
                    if (mdCost > mdSlabAmount) {
                        commData.amounts.mdShortfall = parseFloat((mdCost - mdSlabAmount).toFixed(4));
                    }
                }

                // Distributor
                if (commData.users.distributor) {
                    commData.amounts.distComm = Math.max(0, distSlabAmount - retSlabAmount);
                    if (retSlabAmount > distSlabAmount) {
                        commData.amounts.distShortfall = parseFloat((retSlabAmount - distSlabAmount).toFixed(4));
                    }
                }

                // Retailer (User)
                commData.amounts.retailerComm = retSlabAmount;

                console.log('[Recharge] Final Distribution Amounts:', JSON.stringify(commData.amounts, null, 2));
            }
        }

        // // 3. Call API
        // console.log('Initiating Recharge API Call for TransactionID:', transactionId);
        // const response = await inspayService.Recharge(mobileNumber, opcode, amount, value1, value2, value3, value4, transactionId);

        const response = {
            txid: 54028212,
            status: 'Success',
            opid: '346451228',
            number: mobileNumber,
            amount: amount,
            dr_amount: 21.78,
            orderid: transactionId,
            operatorName: operator.operatorName
        };

        // DEBUG: Log the full response to understand what we are getting
        // console.log('Recharge API Response:', JSON.stringify(response, null, 2));

        // Use response.orderid if present, otherwise fallback to our transactionId if response doesn't provide a unique order ref
        // adapting to prevent NULL unique violation if API fails to return orderid
        const orderid = response.orderid || transactionId;

        const isSuccess = response.status === 'Success' || response.status === 'SUCCESS';
        const isPending = response.status === 'Pending' || response.status === 'PENDING';
        const paymentStatus = isSuccess ? 'SUCCESS' : (isPending ? 'PENDING' : 'FAILURE');

        // 4. Update Wallets & Create History (Post-API Success/Pending)
        let retailerComm = 0;
        let distributorComm = 0;
        let masterDistributorComm = 0;
        let companyComm = 0;
        let superAdminComm = 0;

        if (isSuccess || isPending) { // Usually comm is given on success or pending (pending to hold funds) - actually purely SUCCESS for comms usually. Let's stick to SUCCESS for comm distribution to fail-safe? Actually standard is SUCCESS.
            // However, for user wallet debit, it must happen on Success OR Pending.

            // Base Debit Logic first
            const openingMainWallet = round4(currentWallet.mainWallet || 0);

            if ([4, 5].includes(user.userRole)) {
                if (isSuccess) {
                    // Update outer variables for response structure
                    retailerComm = commData.amounts.retailerComm;
                    distributorComm = commData.amounts.distComm;
                    masterDistributorComm = commData.amounts.mdComm;
                    companyComm = commData.amounts.companyComm;
                    superAdminComm = commData.amounts.superAdminComm;

                    const historyPromises = [];
                    const walletUpdates = [];
                    const remarkText = `Recharge-${operator.operatorName}`;

                    // A. Retailer Update (User)
                    const retailerOpening = round4(commData.wallets.retailerWallet.mainWallet);
                    // Debit Amount AND Credit Commission (Net effect)
                    // If we want separate entries, we do separate. But typically wallet is updated net.
                    // The old code did: opening - amount + comm.
                    const retailerClosing = round4(retailerOpening - amountNumber + commData.amounts.retailerComm);

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
                        debit: amountNumber,
                        transactionId: orderid,
                        paymentStatus: paymentStatus,
                        addedBy: user.id,
                        updatedBy: user.id
                    }));

                    // B. Distributor Update
                    if (commData.users.distributor) {
                        const dWallet = commData.wallets.distributorWallet;
                        const dOpening = round4(dWallet.mainWallet);
                        const dNet = commData.amounts.distComm - commData.amounts.distShortfall;
                        const dClosing = round4(dOpening + dNet);

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
                            transactionId: orderid,
                            paymentStatus: 'SUCCESS',
                            addedBy: commData.users.masterDistributor.id,
                            updatedBy: commData.users.masterDistributor.id
                        }));
                    }

                    // D. Company Update
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
                        transactionId: orderid,
                        paymentStatus: 'SUCCESS',
                        addedBy: commData.users.companyAdmin.id,
                        updatedBy: commData.users.companyAdmin.id
                    }));

                    // E. Super Admin Update
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
                        transactionId: orderid,
                        paymentStatus: 'SUCCESS',
                        addedBy: commData.users.superAdmin.id,
                        updatedBy: commData.users.superAdmin.id
                    }));

                    // Execute Updates
                    await Promise.all([...walletUpdates, ...historyPromises]);

                } else if (isPending) {
                    // Pending State: Only Deduct Amount from User. NO Commission yet.
                    const closing = round4(openingMainWallet - amountNumber);
                    await dbService.update(model.wallet, { id: currentWallet.id }, { mainWallet: closing, updatedBy: user.id });

                    await dbService.createOne(model.walletHistory, {
                        refId: user.id,
                        companyId: user.companyId,
                        walletType: 'mainWallet',
                        operator: operator.operatorName,
                        remark: `Recharge Pending-${operator.operatorName}`,
                        amount: amountNumber,
                        comm: 0,
                        surcharge: 0,
                        openingAmt: openingMainWallet,
                        closingAmt: closing,
                        credit: 0,
                        debit: amountNumber,
                        transactionId: orderid,
                        paymentStatus: 'PENDING',
                        addedBy: user.id,
                        updatedBy: user.id
                    });
                }
            } else {
                // Non-Role 4/5 Logic (Fallback)
                const closing = round4(openingMainWallet - amountNumber);
                await dbService.update(model.wallet, { id: currentWallet.id }, { mainWallet: closing, updatedBy: user.id });

                await dbService.createOne(model.walletHistory, {
                    refId: user.id,
                    companyId: user.companyId,
                    walletType: 'mainWallet',
                    operator: operator.operatorName,
                    remark: `Recharge-${operator.operatorName}`,
                    amount: amountNumber,
                    comm: 0,
                    surcharge: 0,
                    openingAmt: openingMainWallet,
                    closingAmt: closing,
                    credit: 0,
                    debit: amountNumber,
                    transactionId: orderid,
                    paymentStatus: paymentStatus,
                    addedBy: user.id,
                    updatedBy: user.id
                });
            }
        }

        if (isSuccess || isPending) { // Service Transaction always created
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

            await dbService.createOne(model.serviceTransaction, serviceTransactionData);
        } else {
            // Failed Transaction - Log it? Or just return?
            // Usually good to log failures too, but without financial impact.
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
                status: 'FAILURE',
                opid: response.opid || null,
                message: response.message || 'Transaction Failed',
                value1: value1 || null,
                value2: value2 || null,
                value3: value3 || null,
                value4: value4 || null,
                apiResponse: response,
                superadminComm: 0,
                whitelabelComm: 0,
                masterDistributorCom: 0,
                distributorCom: 0,
                retailerCom: 0,
                isActive: true,
                addedBy: user.id
            };
            await dbService.createOne(model.serviceTransaction, serviceTransactionData);
        }

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

        // console.log('response', response);
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
        // console.log('response', response);

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
        // console.log('response', response);

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
        // console.log(error);
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