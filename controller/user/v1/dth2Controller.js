const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const a1topService = require('../../../services/a1topService');
const { Op } = require('sequelize');
const { generateTransactionID } = require('../../../utils/transactionID');

const round4 = (num) => { const n = Number(num); return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 10000) / 10000 : 0; };
const calcSlabAmount = (slab, baseAmount) => { if (!slab) return 0; const base = Number(baseAmount || 0); const rc = Number(slab.commAmt || 0); if (!Number.isFinite(base) || !Number.isFinite(rc)) return 0; return (slab.amtType || 'fix').toLowerCase() === 'per' ? round4((base * rc) / 100) : round4(rc); };

const dthPlanFetch = async (req, res) => {
    try {
        const { dth_number, opcode } = req.body;
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) return res.failure({ message: 'User not found' });
        const operator = await dbService.findOne(model.operator, { operatorCode: opcode });
        if (!operator) return res.failure({ message: 'Operator not found' });
        const response = await a1topService.DTHPlanFetch(dth_number, opcode);
        if (response.status === 'Success') return res.success({ message: 'DTH plan fetched successfully', data: response });
        return res.failure({ message: response.message || 'Failed to fetch DTH plan' });
    } catch (error) {
        console.error('[DTH2] dthPlanFetch error:', error);
        return res.failure({ message: error.message });
    }
};

const customerInfo = async (req, res) => {
    try {
        const { dth_number, opcode } = req.body;
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) return res.failure({ message: 'User not found' });
        const operator = await dbService.findOne(model.operator, { operatorCode: opcode });
        if (!operator) return res.failure({ message: 'Operator not found' });
        const response = await a1topService.DTHCustomerInfo(dth_number, opcode);
        if (response.status === 'Success') return res.success({ message: 'Customer info fetched successfully', data: response });
        return res.failure({ message: response.message || 'Failed to fetch customer info' });
    } catch (error) {
        console.error('[DTH2] customerInfo error:', error);
        return res.failure({ message: error.message });
    }
};

const dthRecharge = async (req, res) => {
    try {
        const { dth_number, opcode, amount } = req.body;
        if (!dth_number) return res.failure({ message: 'DTH number is required' });
        if (!opcode) return res.failure({ message: 'Operator code is required' });
        if (!amount) return res.failure({ message: 'Amount is required' });

        const amountNumber = round4(parseFloat(amount));
        const user = req.user;

        const [existingUser, operator, existingCompany] = await Promise.all([
            dbService.findOne(model.user, { id: user.id, companyId: user.companyId }),
            dbService.findOne(model.operator, { operatorCode: opcode }),
            dbService.findOne(model.company, { id: user.companyId })
        ]);
        if (!existingUser) return res.failure({ message: 'User not found' });
        if (!operator) return res.failure({ message: 'Operator not found' });

        const operatorType = operator.operatorType || 'DTH2';
        const transactionId = generateTransactionID(existingCompany?.companyName);

        const commData = { users: {}, wallets: {}, slabs: {}, amounts: { retailerComm: 0, distComm: 0, mdComm: 0, companyComm: 0, superAdminComm: 0, wlShortfall: 0, mdShortfall: 0, distShortfall: 0, saShortfall: 0 }, scenario: '' };
        const commonParams = { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] };

        const currentWallet = await model.wallet.findOne({ where: { refId: user.id, companyId: user.companyId } });
        if (!currentWallet) return res.failure({ message: 'Wallet not found' });
        if (currentWallet.mainWallet < amountNumber) return res.failure({ message: 'Insufficient balance' });

        if ([4, 5].includes(user.userRole)) {
            const [companyAdmin, superAdmin] = await Promise.all([
                dbService.findOne(model.user, { companyId: user.companyId, userRole: 2, isActive: true }),
                dbService.findOne(model.user, { id: 1, companyId: 1, userRole: 1, isActive: true })
            ]);
            if (companyAdmin && superAdmin) {
                commData.users.companyAdmin = companyAdmin; commData.users.superAdmin = superAdmin;
                const [cw, saw] = await Promise.all([dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }), dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 })]);
                commData.wallets.companyWallet = cw; commData.wallets.superAdminWallet = saw;
                const saQuery = { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType };
                const coQuery = { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType };

                if (user.userRole === 4) {
                    const dist = await dbService.findOne(model.user, { id: user.id, companyId: user.companyId, isActive: true });
                    commData.users.distributor = dist; commData.wallets.distributorWallet = currentWallet;
                    if (dist.reportingTo === companyAdmin.id || dist.reportingTo === null) {
                        commData.scenario = 'DIST_DIRECT';
                        const [sa, co] = await Promise.all([dbService.findAll(model.commSlab, saQuery, commonParams), dbService.findAll(model.commSlab, coQuery, commonParams)]);
                        commData.slabs.saSlab = sa?.find(c => c.roleType === 1 || c.roleName === 'AD');
                        commData.slabs.wlSlab = sa?.find(c => c.roleType === 2 || c.roleName === 'WU');
                        commData.slabs.distSlab = co?.find(c => c.roleType === 4);
                    } else {
                        commData.scenario = 'DIST_MD';
                        const md = await dbService.findOne(model.user, { id: dist.reportingTo, companyId: user.companyId, isActive: true });
                        if (md) {
                            commData.users.masterDistributor = md; commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: md.id, companyId: user.companyId });
                            const [sa, co, mdS] = await Promise.all([dbService.findAll(model.commSlab, saQuery, commonParams), dbService.findAll(model.commSlab, coQuery, commonParams), dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: md.id, operatorId: operator.id, operatorType }, commonParams)]);
                            commData.slabs.saSlab = sa?.find(c => c.roleType === 1 || c.roleName === 'AD'); commData.slabs.wlSlab = sa?.find(c => c.roleType === 2 || c.roleName === 'WU'); commData.slabs.mdSlab = co?.find(c => c.roleType === 3); commData.slabs.distSlab = mdS?.find(c => c.roleType === 4);
                        }
                    }
                } else if (user.userRole === 5) {
                    const retailer = await dbService.findOne(model.user, { id: user.id, companyId: user.companyId, isActive: true });
                    commData.users.retailer = retailer; commData.wallets.retailerWallet = currentWallet;
                    let reportingUser = null;
                    if (retailer.reportingTo && retailer.reportingTo !== companyAdmin.id) reportingUser = await dbService.findOne(model.user, { id: retailer.reportingTo, companyId: user.companyId, isActive: true });
                    if (!reportingUser || retailer.reportingTo === companyAdmin.id || retailer.reportingTo === null) {
                        commData.scenario = 'RET_DIRECT';
                        const [sa, co] = await Promise.all([dbService.findAll(model.commSlab, saQuery, commonParams), dbService.findAll(model.commSlab, coQuery, commonParams)]);
                        commData.slabs.saSlab = sa?.find(c => c.roleType === 1 || c.roleName === 'AD'); commData.slabs.wlSlab = sa?.find(c => c.roleType === 2 || c.roleName === 'WU'); commData.slabs.retSlab = co?.find(c => c.roleType === 5);
                    } else if (reportingUser.userRole === 3) {
                        commData.scenario = 'RET_MD';
                        commData.users.masterDistributor = reportingUser; commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: reportingUser.id, companyId: user.companyId });
                        const [sa, co, ru] = await Promise.all([dbService.findAll(model.commSlab, saQuery, commonParams), dbService.findAll(model.commSlab, coQuery, commonParams), dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: reportingUser.id, operatorId: operator.id, operatorType }, commonParams)]);
                        commData.slabs.saSlab = sa?.find(c => c.roleType === 1 || c.roleName === 'AD'); commData.slabs.wlSlab = sa?.find(c => c.roleType === 2 || c.roleName === 'WU'); commData.slabs.mdSlab = co?.find(c => c.roleType === 3); commData.slabs.retSlab = ru?.find(c => c.roleType === 5);
                    } else if (reportingUser.userRole === 4) {
                        commData.users.distributor = reportingUser; commData.wallets.distributorWallet = await dbService.findOne(model.wallet, { refId: reportingUser.id, companyId: user.companyId });
                        if (reportingUser.reportingTo === companyAdmin.id || reportingUser.reportingTo === null) {
                            commData.scenario = 'RET_DIST_CO';
                            const [sa, co, ru] = await Promise.all([dbService.findAll(model.commSlab, saQuery, commonParams), dbService.findAll(model.commSlab, coQuery, commonParams), dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: reportingUser.id, operatorId: operator.id, operatorType }, commonParams)]);
                            commData.slabs.saSlab = sa?.find(c => c.roleType === 1 || c.roleName === 'AD'); commData.slabs.wlSlab = sa?.find(c => c.roleType === 2 || c.roleName === 'WU'); commData.slabs.distSlab = co?.find(c => c.roleType === 4); commData.slabs.retSlab = ru?.find(c => c.roleType === 5);
                        } else {
                            commData.scenario = 'RET_DIST_MD';
                            const md = await dbService.findOne(model.user, { id: reportingUser.reportingTo, companyId: user.companyId, isActive: true });
                            if (md) {
                                commData.users.masterDistributor = md; commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: md.id, companyId: user.companyId });
                                const [sa, co, mdS, distS] = await Promise.all([dbService.findAll(model.commSlab, saQuery, commonParams), dbService.findAll(model.commSlab, coQuery, commonParams), dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: md.id, operatorId: operator.id, operatorType }, commonParams), dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: reportingUser.id, operatorId: operator.id, operatorType }, commonParams)]);
                                commData.slabs.saSlab = sa?.find(c => c.roleType === 1 || c.roleName === 'AD'); commData.slabs.wlSlab = sa?.find(c => c.roleType === 2 || c.roleName === 'WU'); commData.slabs.mdSlab = co?.find(c => c.roleType === 3); commData.slabs.distSlab = mdS?.find(c => c.roleType === 4); commData.slabs.retSlab = distS?.find(c => c.roleType === 5);
                            }
                        }
                    }
                }

                const opAmt = operator.comm ? calcSlabAmount({ amtType: operator.amtType, commAmt: operator.comm }, amountNumber) : 0;
                const saAmt = calcSlabAmount(commData.slabs.saSlab, amountNumber); const wlAmt = calcSlabAmount(commData.slabs.wlSlab, amountNumber);
                const mdAmt = calcSlabAmount(commData.slabs.mdSlab, amountNumber); const distAmt = calcSlabAmount(commData.slabs.distSlab, amountNumber); const retAmt = calcSlabAmount(commData.slabs.retSlab, amountNumber);
                const companyCost = commData.users.masterDistributor ? mdAmt : (commData.users.distributor ? distAmt : retAmt);
                commData.amounts.superAdminComm = Math.max(0, round4(opAmt - wlAmt)); commData.amounts.saShortfall = wlAmt > opAmt ? parseFloat((wlAmt - opAmt).toFixed(4)) : 0;
                commData.amounts.companyComm = Math.max(0, round4(wlAmt - companyCost)); if (companyCost > wlAmt) commData.amounts.wlShortfall = parseFloat((companyCost - wlAmt).toFixed(4));
                if (commData.users.masterDistributor) { const mdCost = commData.users.distributor ? distAmt : retAmt; commData.amounts.mdComm = Math.max(0, round4(mdAmt - mdCost)); if (mdCost > mdAmt) commData.amounts.mdShortfall = parseFloat((mdCost - mdAmt).toFixed(4)); }
                if (commData.users.distributor) { commData.amounts.distComm = Math.max(0, round4(distAmt - retAmt)); if (retAmt > distAmt) commData.amounts.distShortfall = parseFloat((retAmt - distAmt).toFixed(4)); }
                commData.amounts.retailerComm = retAmt;
                console.log('[DTH2] Comm Amounts:', JSON.stringify(commData.amounts));
            }
        }

        const response = await a1topService.DTHRecharge(dth_number, opcode, amount, transactionId);
        const orderid = response.orderid || transactionId;
        const isSuccess = response.status === 'Success' || response.status === 'SUCCESS';
        const isPending = response.status === 'Pending' || response.status === 'PENDING';
        const paymentStatus = isSuccess ? 'SUCCESS' : (isPending ? 'PENDING' : 'FAILURE');

        let retailerComm = 0, distributorComm = 0, masterDistributorComm = 0, companyComm = 0, superAdminComm = 0;
        if (isSuccess || isPending) {
            const openingMainWallet = round4(currentWallet.mainWallet || 0);
            if ([4, 5].includes(user.userRole)) {
                retailerComm = commData.amounts.retailerComm; distributorComm = commData.amounts.distComm;
                masterDistributorComm = commData.amounts.mdComm; companyComm = commData.amounts.companyComm; superAdminComm = commData.amounts.superAdminComm;
                const walletUpdates = [], historyPromises = [];
                const rs = isPending ? ` Pending-${operator.operatorName}` : `-${operator.operatorName}`;
                const remarkText = `DTH2${rs}`;

                if (commData.users.retailer && commData.wallets.retailerWallet) {
                    const ro = round4(commData.wallets.retailerWallet.mainWallet); const rc = round4(ro - amountNumber + commData.amounts.retailerComm);
                    walletUpdates.push(dbService.update(model.wallet, { id: commData.wallets.retailerWallet.id }, { mainWallet: rc, updatedBy: user.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: user.id, companyId: user.companyId, walletType: 'mainWallet', operator: operator.operatorName, remark: remarkText, amount: amountNumber, comm: commData.amounts.retailerComm, surcharge: 0, openingAmt: ro, closingAmt: rc, credit: commData.amounts.retailerComm, debit: amountNumber, transactionId: orderid, paymentStatus, addedBy: user.id, updatedBy: user.id }));
                }
                if (commData.users.distributor && commData.wallets.distributorWallet) {
                    const dw = commData.wallets.distributorWallet; const dop = round4(dw.mainWallet);
                    let dcl, ddb, drm = `${remarkText} - dist comm`;
                    if (user.userRole === 4) { dcl = round4(dop - amountNumber + commData.amounts.distComm); ddb = amountNumber; drm = remarkText; } else { dcl = round4(dop + commData.amounts.distComm - commData.amounts.distShortfall); ddb = commData.amounts.distShortfall; }
                    walletUpdates.push(dbService.update(model.wallet, { id: dw.id }, { mainWallet: dcl, updatedBy: commData.users.distributor.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.distributor.id, companyId: user.companyId, walletType: 'mainWallet', operator: operator.operatorName, remark: drm, amount: amountNumber, comm: commData.amounts.distComm, surcharge: 0, openingAmt: dop, closingAmt: dcl, credit: commData.amounts.distComm, debit: ddb, transactionId: orderid, paymentStatus, addedBy: commData.users.distributor.id, updatedBy: commData.users.distributor.id }));
                }
                if (commData.users.masterDistributor) {
                    const mw = commData.wallets.masterDistributorWallet; const mo = round4(mw.mainWallet); const mc = round4(mo + commData.amounts.mdComm - commData.amounts.mdShortfall);
                    walletUpdates.push(dbService.update(model.wallet, { id: mw.id }, { mainWallet: mc, updatedBy: commData.users.masterDistributor.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.masterDistributor.id, companyId: user.companyId, walletType: 'mainWallet', operator: operator.operatorName, remark: `${remarkText} - md comm`, amount: amountNumber, comm: commData.amounts.mdComm, surcharge: 0, openingAmt: mo, closingAmt: mc, credit: commData.amounts.mdComm, debit: commData.amounts.mdShortfall, transactionId: orderid, paymentStatus, addedBy: commData.users.masterDistributor.id, updatedBy: commData.users.masterDistributor.id }));
                }
                const cw = commData.wallets.companyWallet; const co = round4(cw.mainWallet); const cc = round4(co + commData.amounts.companyComm - commData.amounts.wlShortfall);
                walletUpdates.push(dbService.update(model.wallet, { id: cw.id }, { mainWallet: cc, updatedBy: commData.users.companyAdmin.id }));
                historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.companyAdmin.id, companyId: user.companyId, walletType: 'mainWallet', operator: operator.operatorName, remark: `${remarkText} - company comm`, amount: amountNumber, comm: commData.amounts.companyComm, surcharge: 0, openingAmt: co, closingAmt: cc, credit: commData.amounts.companyComm, debit: commData.amounts.wlShortfall, transactionId: orderid, paymentStatus, addedBy: commData.users.companyAdmin.id, updatedBy: commData.users.companyAdmin.id }));
                const sw = commData.wallets.superAdminWallet; const so = round4(sw.mainWallet); const sc = round4(so + commData.amounts.superAdminComm - commData.amounts.saShortfall);
                walletUpdates.push(dbService.update(model.wallet, { id: sw.id }, { mainWallet: sc, updatedBy: commData.users.superAdmin.id }));
                historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.superAdmin.id, companyId: 1, walletType: 'mainWallet', operator: operator.operatorName, remark: `${remarkText} - admin comm`, amount: amountNumber, comm: commData.amounts.superAdminComm, surcharge: 0, openingAmt: so, closingAmt: sc, credit: commData.amounts.superAdminComm, debit: commData.amounts.saShortfall, transactionId: orderid, paymentStatus, addedBy: commData.users.superAdmin.id, updatedBy: commData.users.superAdmin.id }));
                await Promise.all([...walletUpdates, ...historyPromises]);
            } else {
                const closing = round4(openingMainWallet - amountNumber);
                await dbService.update(model.wallet, { id: currentWallet.id }, { mainWallet: closing, updatedBy: user.id });
                const rs2 = isPending ? ` Pending-${operator.operatorName}` : `-${operator.operatorName}`;
                await dbService.createOne(model.walletHistory, { refId: user.id, companyId: user.companyId, walletType: 'mainWallet', operator: operator.operatorName, remark: `DTH2${rs2}`, amount: amountNumber, comm: 0, surcharge: 0, openingAmt: openingMainWallet, closingAmt: closing, credit: 0, debit: amountNumber, transactionId: orderid, paymentStatus, addedBy: user.id, updatedBy: user.id });
            }
        }

        await dbService.createOne(model.service1Transaction, {
            refId: user.id, companyId: user.companyId, serviceType: 'DTH2Recharge', dthNumber: dth_number, opcode,
            amount: amountNumber, orderid, transactionId, txid: response.txid || null, status: paymentStatus,
            opid: response.opid || null, message: response.message || null, apiResponse: response,
            superadminComm: superAdminComm, whitelabelComm: companyComm, masterDistributorCom: masterDistributorComm,
            distributorCom: distributorComm, retailerCom: retailerComm, isActive: true, addedBy: user.id
        });

        const responseData = { orderid, transactionId, apiResponse: response };
        if (isSuccess) return res.success({ message: response.message || 'DTH2 Recharge successful', data: responseData });
        if (isPending) return res.success({ message: response.message || 'DTH2 Recharge in process', data: responseData });
        return res.failure({ message: response.message || 'DTH2 Recharge failed', data: responseData });
    } catch (error) {
        console.error('DTH2 Recharge error:', error);
        return res.internalServerError({ message: error.message });
    }
};

const checkStatus = async (req, res) => {
    try {
        const { orderid } = req.body;
        if (!orderid) return res.failure({ message: 'Order ID is required' });
        const transaction = await dbService.findOne(model.service1Transaction, { orderid });
        if (!transaction) return res.failure({ message: 'Transaction not found' });
        const response = await a1topService.checkStatus(orderid);
        return res.success({ message: 'DTH2 Status fetched', data: response });
    } catch (error) { return res.failure({ message: error.message }); }
};

module.exports = { dthPlanFetch, customerInfo, dthRecharge, checkStatus };
