const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const a1topService = require('../../../services/a1topService');
const { Op } = require('sequelize');
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
    return (slab.amtType || 'fix').toLowerCase() === 'per' ? round4((base * rawComm) / 100) : round4(rawComm);
};

const buildCommData = () => ({
    users: {}, wallets: {}, slabs: {},
    amounts: { retailerComm: 0, distComm: 0, mdComm: 0, companyComm: 0, superAdminComm: 0, wlShortfall: 0, mdShortfall: 0, distShortfall: 0, saShortfall: 0 },
    scenario: ''
});

const fetchSlabs = (superAdmin, companyAdmin, user, operator, operatorType, reportingUser = null, masterDistributor = null) => {
    const commonParams = { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] };
    const saQuery = { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType };
    const coQuery = { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType };
    const promises = [
        dbService.findAll(model.commSlab, saQuery, commonParams),
        dbService.findAll(model.commSlab, coQuery, commonParams)
    ];
    if (reportingUser) promises.push(dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: reportingUser.id, operatorId: operator.id, operatorType }, commonParams));
    if (masterDistributor) promises.push(dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: masterDistributor.id, operatorId: operator.id, operatorType }, commonParams));
    return Promise.all(promises);
};

const calcAmounts = (operator, commData, amountNumber) => {
    const operatorCommAmt = operator.comm ? calcSlabAmount({ amtType: operator.amtType, commAmt: operator.comm }, amountNumber) : 0;
    const saAmt = commData.slabs.saSlab ? calcSlabAmount(commData.slabs.saSlab, amountNumber) : 0;
    const wlAmt = commData.slabs.wlSlab ? calcSlabAmount(commData.slabs.wlSlab, amountNumber) : 0;
    const mdAmt = commData.slabs.mdSlab ? calcSlabAmount(commData.slabs.mdSlab, amountNumber) : 0;
    const distAmt = commData.slabs.distSlab ? calcSlabAmount(commData.slabs.distSlab, amountNumber) : 0;
    const retAmt = commData.slabs.retSlab ? calcSlabAmount(commData.slabs.retSlab, amountNumber) : 0;
    const companyCost = commData.users.masterDistributor ? mdAmt : (commData.users.distributor ? distAmt : retAmt);

    commData.amounts.superAdminComm = Math.max(0, round4(operatorCommAmt - wlAmt));
    commData.amounts.saShortfall = wlAmt > operatorCommAmt ? parseFloat((wlAmt - operatorCommAmt).toFixed(4)) : 0;
    commData.amounts.companyComm = Math.max(0, round4(wlAmt - companyCost));
    if (companyCost > wlAmt) commData.amounts.wlShortfall = parseFloat((companyCost - wlAmt).toFixed(4));
    if (commData.users.masterDistributor) {
        const mdCost = commData.users.distributor ? distAmt : retAmt;
        commData.amounts.mdComm = Math.max(0, round4(mdAmt - mdCost));
        if (mdCost > mdAmt) commData.amounts.mdShortfall = parseFloat((mdCost - mdAmt).toFixed(4));
    }
    if (commData.users.distributor) {
        commData.amounts.distComm = Math.max(0, round4(distAmt - retAmt));
        if (retAmt > distAmt) commData.amounts.distShortfall = parseFloat((retAmt - distAmt).toFixed(4));
    }
    commData.amounts.retailerComm = retAmt;
};

const recharge = async (req, res) => {
    try {
        const { mobileNumber, opcode, amount, circle, value1, value2, value3, value4 } = req.body;
        if (!mobileNumber) return res.failure({ message: 'Mobile number is required' });
        if (!opcode) return res.failure({ message: 'Operator code is required' });
        if (!amount) return res.failure({ message: 'Amount is required' });
        if (!circle) return res.failure({ message: 'Circle is required' });

        const amountNumber = round4(parseFloat(amount));
        const user = req.user;
        const [existingUser, operator, existingCompany] = await Promise.all([
            dbService.findOne(model.user, { id: user.id, companyId: user.companyId }),
            dbService.findOne(model.operator, { operatorType: "EXPRESS RECHARGE", operatorCode: opcode }),
            dbService.findOne(model.company, { id: user.companyId })
        ]);
        if (!existingUser) return res.failure({ message: 'User not found' });
        if (!operator) return res.failure({ message: 'Operator not found' });

        const operatorType = operator.operatorType || 'EXPRESS RECHARGE';
        const transactionId = generateTransactionID(existingCompany?.companyName);
        const commData = buildCommData();

        const currentWallet = await model.wallet.findOne({ where: { refId: user.id, companyId: user.companyId } });
        if (!currentWallet) return res.failure({ message: 'Wallet not found' });
        if (currentWallet.mainWallet < amountNumber) return res.failure({ message: 'Insufficient balance' });

        if ([4, 5].includes(user.userRole)) {
            const [companyAdmin, superAdmin] = await Promise.all([
                dbService.findOne(model.user, { companyId: user.companyId, userRole: 2, isActive: true }),
                dbService.findOne(model.user, { id: 1, companyId: 1, userRole: 1, isActive: true })
            ]);
            if (companyAdmin && superAdmin) {
                commData.users.companyAdmin = companyAdmin;
                commData.users.superAdmin = superAdmin;
                const [cw, saw] = await Promise.all([
                    dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                    dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 })
                ]);
                commData.wallets.companyWallet = cw;
                commData.wallets.superAdminWallet = saw;

                if (user.userRole === 4) {
                    const dist = await dbService.findOne(model.user, { id: user.id, companyId: user.companyId, isActive: true });
                    commData.users.distributor = dist;
                    commData.wallets.distributorWallet = currentWallet;
                    if (dist.reportingTo === companyAdmin.id || dist.reportingTo === null) {
                        commData.scenario = 'DIST_DIRECT';
                        const [sa, co] = await fetchSlabs(superAdmin, companyAdmin, user, operator, operatorType);
                        commData.slabs.saSlab = sa?.find(c => c.roleType === 1 || c.roleName === 'AD');
                        commData.slabs.wlSlab = sa?.find(c => c.roleType === 2 || c.roleName === 'WU');
                        commData.slabs.distSlab = co?.find(c => c.roleType === 4 || c.roleName === 'DI');
                    } else {
                        commData.scenario = 'DIST_MD';
                        const md = await dbService.findOne(model.user, { id: dist.reportingTo, companyId: user.companyId, isActive: true });
                        if (md) {
                            commData.users.masterDistributor = md;
                            commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: md.id, companyId: user.companyId });
                            const [sa, co, mdSlabs] = await fetchSlabs(superAdmin, companyAdmin, user, operator, operatorType, md);
                            commData.slabs.saSlab = sa?.find(c => c.roleType === 1 || c.roleName === 'AD');
                            commData.slabs.wlSlab = sa?.find(c => c.roleType === 2 || c.roleName === 'WU');
                            commData.slabs.mdSlab = co?.find(c => c.roleType === 3);
                            commData.slabs.distSlab = mdSlabs?.find(c => c.roleType === 4);
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
                        const [sa, co] = await fetchSlabs(superAdmin, companyAdmin, user, operator, operatorType);
                        commData.slabs.saSlab = sa?.find(c => c.roleType === 1 || c.roleName === 'AD');
                        commData.slabs.wlSlab = sa?.find(c => c.roleType === 2 || c.roleName === 'WU');
                        commData.slabs.retSlab = co?.find(c => c.roleType === 5);
                    } else if (reportingUser.userRole === 3) {
                        commData.scenario = 'RET_MD';
                        commData.users.masterDistributor = reportingUser;
                        commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: reportingUser.id, companyId: user.companyId });
                        const [sa, co, ru] = await fetchSlabs(superAdmin, companyAdmin, user, operator, operatorType, reportingUser);
                        commData.slabs.saSlab = sa?.find(c => c.roleType === 1 || c.roleName === 'AD');
                        commData.slabs.wlSlab = sa?.find(c => c.roleType === 2 || c.roleName === 'WU');
                        commData.slabs.mdSlab = co?.find(c => c.roleType === 3);
                        commData.slabs.retSlab = ru?.find(c => c.roleType === 5);
                    } else if (reportingUser.userRole === 4) {
                        commData.users.distributor = reportingUser;
                        commData.wallets.distributorWallet = await dbService.findOne(model.wallet, { refId: reportingUser.id, companyId: user.companyId });
                        if (reportingUser.reportingTo === companyAdmin.id || reportingUser.reportingTo === null) {
                            commData.scenario = 'RET_DIST_CO';
                            const [sa, co, ru] = await fetchSlabs(superAdmin, companyAdmin, user, operator, operatorType, reportingUser);
                            commData.slabs.saSlab = sa?.find(c => c.roleType === 1 || c.roleName === 'AD');
                            commData.slabs.wlSlab = sa?.find(c => c.roleType === 2 || c.roleName === 'WU');
                            commData.slabs.distSlab = co?.find(c => c.roleType === 4);
                            commData.slabs.retSlab = ru?.find(c => c.roleType === 5);
                        } else {
                            commData.scenario = 'RET_DIST_MD';
                            const md = await dbService.findOne(model.user, { id: reportingUser.reportingTo, companyId: user.companyId, isActive: true });
                            if (md) {
                                commData.users.masterDistributor = md;
                                commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: md.id, companyId: user.companyId });
                                const [sa, co, mdS, distS] = await fetchSlabs(superAdmin, companyAdmin, user, operator, operatorType, reportingUser, md);
                                commData.slabs.saSlab = sa?.find(c => c.roleType === 1 || c.roleName === 'AD');
                                commData.slabs.wlSlab = sa?.find(c => c.roleType === 2 || c.roleName === 'WU');
                                commData.slabs.mdSlab = co?.find(c => c.roleType === 3);
                                commData.slabs.distSlab = mdS?.find(c => c.roleType === 4);
                                commData.slabs.retSlab = distS?.find(c => c.roleType === 5);
                            }
                        }
                    }
                }
                calcAmounts(operator, commData, amountNumber);
                console.log('[Recharge2] Comm Amounts:', JSON.stringify(commData.amounts));
            }
        }

        const response = await a1topService.Recharge(mobileNumber, opcode, amount, circle, value1, value2, value3, value4, transactionId);
        console.log("response", response);
        const orderid = response.orderid || transactionId;
        const isSuccess = response.status === 'Success' || response.status === 'SUCCESS';
        const isPending = response.status === 'Pending' || response.status === 'PENDING';
        const paymentStatus = isSuccess ? 'SUCCESS' : (isPending ? 'PENDING' : 'FAILURE');

        let retailerComm = 0, distributorComm = 0, masterDistributorComm = 0, companyComm = 0, superAdminComm = 0;

        if (isSuccess || isPending) {
            const openingMainWallet = round4(currentWallet.mainWallet || 0);
            if ([4, 5].includes(user.userRole)) {
                retailerComm = commData.amounts.retailerComm;
                distributorComm = commData.amounts.distComm;
                masterDistributorComm = commData.amounts.mdComm;
                companyComm = commData.amounts.companyComm;
                superAdminComm = commData.amounts.superAdminComm;

                const walletUpdates = [], historyPromises = [];
                const remarkStatus = isPending ? ` Pending-${operator.operatorName}` : `-${operator.operatorName}`;
                const remarkText = `Recharge2${remarkStatus}`;

                if (commData.users.retailer && commData.wallets.retailerWallet) {
                    const ro = round4(commData.wallets.retailerWallet.mainWallet);
                    const rc = round4(ro - amountNumber + commData.amounts.retailerComm);
                    walletUpdates.push(dbService.update(model.wallet, { id: commData.wallets.retailerWallet.id }, { mainWallet: rc, updatedBy: user.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: user.id, companyId: user.companyId, walletType: 'mainWallet', operator: operator.operatorName, remark: remarkText, amount: amountNumber, comm: commData.amounts.retailerComm, surcharge: 0, openingAmt: ro, closingAmt: rc, credit: commData.amounts.retailerComm, debit: amountNumber, transactionId: orderid, paymentStatus, addedBy: user.id, updatedBy: user.id }));
                }
                if (commData.users.distributor && commData.wallets.distributorWallet) {
                    const dw = commData.wallets.distributorWallet;
                    const dop = round4(dw.mainWallet);
                    let dcl, ddb, drm = `${remarkText} - dist comm`;
                    if (user.userRole === 4) { dcl = round4(dop - amountNumber + commData.amounts.distComm); ddb = amountNumber; drm = remarkText; }
                    else { dcl = round4(dop + commData.amounts.distComm - commData.amounts.distShortfall); ddb = commData.amounts.distShortfall; }
                    walletUpdates.push(dbService.update(model.wallet, { id: dw.id }, { mainWallet: dcl, updatedBy: commData.users.distributor.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.distributor.id, companyId: user.companyId, walletType: 'mainWallet', operator: operator.operatorName, remark: drm, amount: amountNumber, comm: commData.amounts.distComm, surcharge: 0, openingAmt: dop, closingAmt: dcl, credit: commData.amounts.distComm, debit: ddb, transactionId: orderid, paymentStatus, addedBy: commData.users.distributor.id, updatedBy: commData.users.distributor.id }));
                }
                if (commData.users.masterDistributor) {
                    const mw = commData.wallets.masterDistributorWallet;
                    const mo = round4(mw.mainWallet);
                    const mc = round4(mo + commData.amounts.mdComm - commData.amounts.mdShortfall);
                    walletUpdates.push(dbService.update(model.wallet, { id: mw.id }, { mainWallet: mc, updatedBy: commData.users.masterDistributor.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.masterDistributor.id, companyId: user.companyId, walletType: 'mainWallet', operator: operator.operatorName, remark: `${remarkText} - md comm`, amount: amountNumber, comm: commData.amounts.mdComm, surcharge: 0, openingAmt: mo, closingAmt: mc, credit: commData.amounts.mdComm, debit: commData.amounts.mdShortfall, transactionId: orderid, paymentStatus, addedBy: commData.users.masterDistributor.id, updatedBy: commData.users.masterDistributor.id }));
                }
                const cw = commData.wallets.companyWallet;
                const co = round4(cw.mainWallet);
                const cc = round4(co + commData.amounts.companyComm - commData.amounts.wlShortfall);
                walletUpdates.push(dbService.update(model.wallet, { id: cw.id }, { mainWallet: cc, updatedBy: commData.users.companyAdmin.id }));
                historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.companyAdmin.id, companyId: user.companyId, walletType: 'mainWallet', operator: operator.operatorName, remark: `${remarkText} - company comm`, amount: amountNumber, comm: commData.amounts.companyComm, surcharge: 0, openingAmt: co, closingAmt: cc, credit: commData.amounts.companyComm, debit: commData.amounts.wlShortfall, transactionId: orderid, paymentStatus, addedBy: commData.users.companyAdmin.id, updatedBy: commData.users.companyAdmin.id }));

                const sw = commData.wallets.superAdminWallet;
                const so = round4(sw.mainWallet);
                const sc = round4(so + commData.amounts.superAdminComm - commData.amounts.saShortfall);
                walletUpdates.push(dbService.update(model.wallet, { id: sw.id }, { mainWallet: sc, updatedBy: commData.users.superAdmin.id }));
                historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.superAdmin.id, companyId: 1, walletType: 'mainWallet', operator: operator.operatorName, remark: `${remarkText} - admin comm`, amount: amountNumber, comm: commData.amounts.superAdminComm, surcharge: 0, openingAmt: so, closingAmt: sc, credit: commData.amounts.superAdminComm, debit: commData.amounts.saShortfall, transactionId: orderid, paymentStatus, addedBy: commData.users.superAdmin.id, updatedBy: commData.users.superAdmin.id }));
                await Promise.all([...walletUpdates, ...historyPromises]);

            } else {
                const closing = round4(openingMainWallet - amountNumber);
                await dbService.update(model.wallet, { id: currentWallet.id }, { mainWallet: closing, updatedBy: user.id });
                const rs = isPending ? ` Pending-${operator.operatorName}` : `-${operator.operatorName}`;
                await dbService.createOne(model.walletHistory, { refId: user.id, companyId: user.companyId, walletType: 'mainWallet', operator: operator.operatorName, remark: `Recharge2${rs}`, amount: amountNumber, comm: 0, surcharge: 0, openingAmt: openingMainWallet, closingAmt: closing, credit: 0, debit: amountNumber, transactionId: orderid, paymentStatus, addedBy: user.id, updatedBy: user.id });
            }
        }

        await dbService.createOne(model.service1Transaction, {
            refId: user.id, companyId: user.companyId, serviceType: 'Mobile2Recharge',
            mobileNumber, opcode, circle: circle || null, amount: amountNumber, orderid, transactionId,
            txid: response.txid || null, status: paymentStatus, opid: response.opid || null,
            message: response.message || (isSuccess || isPending ? null : 'Transaction Failed'),
            value1: value1 || null, value2: value2 || null, value3: value3 || null, value4: value4 || null,
            apiResponse: response, superadminComm: superAdminComm, whitelabelComm: companyComm,
            masterDistributorCom: masterDistributorComm, distributorCom: distributorComm,
            retailerCom: retailerComm, isActive: true, addedBy: user.id
        });

        const responseData = { orderid, transactionId, apiResponse: response };
        if (isSuccess) return res.success({ message: response.message || 'Recharge2 successful', data: responseData });
        if (isPending) return res.success({ message: response.message || 'Recharge2 in process', data: responseData });
        return res.failure({ message: response.message || 'Recharge2 failed', data: responseData });
    } catch (error) {
        console.error('Recharge2 error:', error);
        return res.internalServerError({ message: error.message });
    }
};

const getRechargeHistory = async (req, res) => {
    try {
        if (![4, 5].includes(req.user.userRole)) return res.failure({ message: 'Unauthorized' });
        const data = await dbService.findAll(model.service1Transaction, { refId: req.user.id, companyId: req.user.companyId, serviceType: 'Mobile2Recharge' }, { order: [['createdAt', 'DESC']] });
        return res.success({ message: 'Recharge2 history retrieved successfully', data: data || [] });
    } catch (error) { return res.internalServerError({ message: error.message }); }
};

const recentRechargeHistory = async (req, res) => {
    try {
        if (!req.user.companyId) return res.failure({ message: 'Company ID is required' });
        const dataToFind = req.body || {};
        let options = { order: [['createdAt', 'DESC']] };
        if (dataToFind.options) { options = { ...dataToFind.options, order: dataToFind.options.sort ? Object.entries(dataToFind.options.sort).map(([f, d]) => [f, d === -1 ? 'DESC' : 'ASC']) : [['createdAt', 'DESC']] }; }
        const query = { refId: req.user.id, companyId: req.user.companyId };
        const result = await dbService.paginate(model.service1Transaction, query, options);
        return res.status(200).send({ status: 'SUCCESS', message: 'Recharge2 history retrieved successfully', data: result?.data || [], total: result?.total || 0, paginator: result?.paginator || { page: 1, paginate: 10, totalPages: 0 } });
    } catch (error) { return res.internalServerError({ message: error.message }); }
};

const getDownlineRecharge2Reports = async (req, res) => {
    try {
        if (![3, 4].includes(req.user.userRole)) return res.failure({ message: 'Unauthorized' });
        if (!req.user.companyId) return res.failure({ message: 'Company ID is required' });
        const getAllDownlineUserIds = async (userId, userRole, companyId) => {
            const ids = new Set();
            const allowed = userRole === 3 ? [4, 5] : [5];
            let current = [{ id: userId, userRole }];
            while (current.length > 0) {
                const ids2 = current.map(u => u.id);
                const next = await dbService.findAll(model.user, { reportingTo: { [Op.in]: ids2 }, companyId, userRole: { [Op.in]: allowed }, isDeleted: false }, { attributes: ['id', 'userRole'] });
                next.forEach(u => { if (u.id !== userId) ids.add(u.id); });
                current = next;
            }
            return Array.from(ids);
        };
        const downlineIds = await getAllDownlineUserIds(req.user.id, req.user.userRole, req.user.companyId);
        if (!downlineIds.length) return res.status(200).send({ status: 'SUCCESS', message: 'No downline users', data: [], total: 0, paginator: { page: 1, paginate: 10, totalPages: 0 } });
        const dataToFind = req.body || {};
        let options = { order: [['createdAt', 'DESC']] };
        if (dataToFind.options) { options = { ...dataToFind.options, order: dataToFind.options.sort ? Object.entries(dataToFind.options.sort).map(([f, d]) => [f, d === -1 ? 'DESC' : 'ASC']) : [['createdAt', 'DESC']] }; }
        options.include = [{ model: model.user, as: 'user', attributes: ['id', 'name', 'userId', 'mobileNo'], required: false }];
        const result = await dbService.paginate(model.service1Transaction, { refId: { [Op.in]: downlineIds }, companyId: req.user.companyId }, options);
        return res.status(200).send({ status: 'SUCCESS', message: 'Recharge2 reports retrieved successfully', data: result?.data || [], total: result?.total || 0, paginator: result?.paginator || { page: 1, paginate: 10, totalPages: 0 } });
    } catch (error) { return res.internalServerError({ message: error.message }); }
};

const getRecharge2Reports = async (req, res) => {
    try {
        if (!req.user.companyId) return res.failure({ message: 'Company ID is required' });
        const dataToFind = req.body || {};
        let options = { order: [['createdAt', 'DESC']] };
        if (dataToFind.options) { options = { ...dataToFind.options, order: dataToFind.options.sort ? Object.entries(dataToFind.options.sort).map(([f, d]) => [f, d === -1 ? 'DESC' : 'ASC']) : [['createdAt', 'DESC']] }; }
        options.include = [{ model: model.user, as: 'user', attributes: ['id', 'name', 'userId', 'mobileNo'], required: false }];
        const result = await dbService.paginate(model.service1Transaction, { refId: req.user.id, companyId: req.user.companyId }, options);
        return res.status(200).send({ status: 'SUCCESS', message: 'Recharge2 reports retrieved successfully', data: result?.data || [], total: result?.total || 0, paginator: result?.paginator || { page: 1, paginate: 10, totalPages: 0 } });
    } catch (error) { return res.internalServerError({ message: error.message }); }
};

const findMobileNumberOperator = async (req, res) => {
    try {
        const { mobileNumber } = req.body;
        if (!mobileNumber) return res.failure({ message: 'Mobile number is required' });

        // Check cache first
        let existingRecord = await dbService.findOne(model.findMobileOperators, { mobileNumber });
        if (existingRecord) {
            const response = existingRecord.response;
            const operatorName = response?.company || response?.operatorName;
            if (operatorName && operatorName.toUpperCase() !== 'BSNL') {
                const operator = await dbService.findOne(model.operator, { operatorName: operatorName.toUpperCase() });
                if (operator) response.operatorCode = operator.operatorCode;
            }
            return res.success({ message: 'Operator retrieved successfully', data: response });
        }

        const response = await a1topService.operatorFetch(mobileNumber);
        if (!response) return res.failure({ message: 'Failed to fetch operator information' });

        const operatorName = response?.company || response?.operatorName;
        if (!operatorName) return res.failure({ message: response.message || 'Operator name not found in response' });

        const operatorNameUpper = operatorName.toUpperCase();
        if (operatorNameUpper !== 'BSNL') {
            const operator = await dbService.findOne(model.operator, { operatorName: operatorNameUpper });
            if (!operator) return res.failure({ message: 'Operator not found in system' });
            response.operatorCode = operator.operatorCode;
        }

        await dbService.createOne(model.findMobileOperators, { mobileNumber, response });

        if (response.status === 'Success' || (response.status || '').toUpperCase() === 'SUCCESS') {
            return res.success({ message: 'Operator retrieved successfully', data: response });
        }
        return res.failure({ message: response.message || 'Failed to fetch operator' });
    } catch (error) {
        console.error('[Recharge2] findMobileNumberOperator error:', error);
        return res.failure({ message: error.message });
    }
};

const findAllRechargePlanFetch = async (req, res) => {
    try {
        const { mobileNumber, opCode, circle } = req.body;
        if (!mobileNumber) return res.failure({ message: 'Mobile number is required' });
        if (!opCode) return res.failure({ message: 'Operator code is required' });
        if (!circle) return res.failure({ message: 'Circle is required' });

        const operator = await dbService.findOne(model.operator, { operatorType: "EXPRESS RECHARGE", operatorCode: opCode });
        if (!operator) return res.failure({ message: 'Operator not found' });

        // Check cache
        const existingPlan = await dbService.findOne(model.rechargePlanFetch, { opCode });
        if (existingPlan) return res.success({ message: 'Recharge plan retrieved successfully', data: existingPlan.response });

        const response = await a1topService.rechargePlanFetch(mobileNumber, opCode, circle);
        if (response.status === 'Success') {
            await dbService.createOne(model.rechargePlanFetch, { opCode, response });
            return res.success({ message: 'Recharge plan retrieved successfully', data: response });
        }
        return res.failure({ message: response.message || 'Failed to fetch recharge plan' });
    } catch (error) {
        console.error('[Recharge2] findAllRechargePlanFetch error:', error);
        return res.failure({ message: error.message });
    }
};

const findRechargeOfferFetch = async (req, res) => {
    try {
        const { mobileNumber, opCode, circle } = req.body;
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) return res.failure({ message: 'User not found' });
        if (!mobileNumber) return res.failure({ message: 'Mobile number is required' });
        if (!opCode) return res.failure({ message: 'Operator code is required' });
        if (!circle) return res.failure({ message: 'Circle is required' });

        const operator = await dbService.findOne(model.operator, { operatorType: "EXPRESS RECHARGE", operatorCode: opCode });
        if (!operator) return res.failure({ message: 'Operator not found' });

        // Check cache
        const existingOffer = await dbService.findOne(model.rechargeOfferFetch, { opCode });
        if (existingOffer) return res.success({ message: 'Recharge offer retrieved successfully', data: existingOffer.response });

        const response = await a1topService.RechargeOfferFetch(mobileNumber, opCode, circle);
        if (response.status === 'Success') {
            await dbService.createOne(model.rechargeOfferFetch, { opCode, response });
            return res.success({ message: 'Recharge offer retrieved successfully', data: response });
        }
        return res.failure({ message: response.message || 'Failed to fetch recharge offer' });
    } catch (error) {
        console.error('[Recharge2] findRechargeOfferFetch error:', error);
        return res.failure({ message: error.message });
    }
};

module.exports = {
    recharge,
    getRechargeHistory,
    getDownlineRecharge2Reports,
    getRecharge2Reports,
    recentRechargeHistory,
    findMobileNumberOperator,
    findAllRechargePlanFetch,
    findRechargeOfferFetch
};
