const { Op, Sequelize } = require('sequelize');
const dbService = require('../../../utils/dbService');
const ekycHub = require('../../../services/eKycHub');
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

const panCardActions = async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.companyId;
    const { mobile_number, action } = req.body;
    const user = req.user;
    const amount = 107;

    const mobileNumber = mobile_number;
    if (!mobileNumber) {
      return res.failure({ message: 'Mobile number is required' });
    }

    if (!action || (action !== 'new' && action !== 'correction')) {
      return res.failure({ message: 'Invalid action. Action must be either "new" or "correction"' });
    }

    if (!amount) {
      return res.failure({ message: 'Amount is required' });
    }

    const amountNumber = amount;

    const [existingUser, operator, existingCompany] = await Promise.all([
      dbService.findOne(model.user, { id: userId }),
      dbService.findOne(model.operator, { operatorType: 'PAN' }),
      dbService.findOne(model.company, { id: companyId })
    ]);

    if (!existingUser) {
      return res.failure({ message: 'User not found' });
    }

    if (!operator) {
      return res.failure({ message: 'Operator not found' });
    }

    const operatorType = operator.operatorType || 'PAN';

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

    // Create wallet if doesn't exist
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
              dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
              dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
            ]);

            commData.slabs.saSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'AD'));
            commData.slabs.wlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
            commData.slabs.distSlab = companySlabComm?.find(c => (c.roleType === 4 || c.roleName === 'DI'));
            console.log("commData.slabs.saSlab", commData.slabs.saSlab);
            console.log("commData.slabs.wlSlab", commData.slabs.wlSlab);
            console.log("commData.slabs.distSlab", commData.slabs.distSlab);

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
              console.log("commData.slabs.saSlab", commData.slabs.saSlab);
              console.log("commData.slabs.wlSlab", commData.slabs.wlSlab);
              console.log("commData.slabs.mdSlab", commData.slabs.mdSlab);
              console.log("commData.slabs.distSlab", commData.slabs.distSlab);
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
              dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
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
              dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
              dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
              dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: reportingUser.id, operatorId: operator.id, operatorType: operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
            ]);
            commData.slabs.saSlab = SuperAdminSlabComm?.find(c => (c.roleType === 1 || c.roleName === 'AD'));
            commData.slabs.wlSlab = SuperAdminSlabComm?.find(c => (c.roleType === 2 || c.roleName === 'WU'));
            commData.slabs.mdSlab = companySlabComm?.find(c => c.roleType === 3);
            commData.slabs.retSlab = masterDistributorComm?.find(c => c.roleType === 5);
            console.log("commData.slabs.saSlab", commData.slabs.saSlab);
            console.log("commData.slabs.wlSlab", commData.slabs.wlSlab);
            console.log("commData.slabs.mdSlab", commData.slabs.mdSlab);
            console.log("commData.slabs.retSlab", commData.slabs.retSlab);

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
              console.log("commData.slabs.saSlab", commData.slabs.saSlab);
              console.log("commData.slabs.wlSlab", commData.slabs.wlSlab);
              console.log("commData.slabs.distSlab", commData.slabs.distSlab);
              console.log("commData.slabs.retSlab", commData.slabs.retSlab);

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
                console.log("commData.slabs.saSlab", commData.slabs.saSlab);
                console.log("commData.slabs.wlSlab", commData.slabs.wlSlab);
                console.log("commData.slabs.mdSlab", commData.slabs.mdSlab);
                console.log("commData.slabs.distSlab", commData.slabs.distSlab);
                console.log("commData.slabs.retSlab", commData.slabs.retSlab);
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
        commData.amounts.superAdminComm = Math.max(0, round4(operatorCommissionAmount - wlSlabAmount));
        if (wlSlabAmount > operatorCommissionAmount) {
          commData.amounts.saShortfall = parseFloat((wlSlabAmount - operatorCommissionAmount).toFixed(4));
        } else {
          commData.amounts.saShortfall = 0;
        }

        // Company (WL)
        commData.amounts.companyComm = Math.max(0, round4(wlSlabAmount - companyCost));
        if (companyCost > wlSlabAmount) {
          commData.amounts.wlShortfall = parseFloat((companyCost - wlSlabAmount).toFixed(4));
        }

        // Master Distributor
        if (commData.users.masterDistributor) {
          let mdCost = commData.users.distributor ? distSlabAmount : retSlabAmount;
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

        // Retailer (User)
        commData.amounts.retailerComm = retSlabAmount;

        console.log('[PAN] Final Distribution Amounts:', JSON.stringify(commData.amounts, null, 2));
      }
    }

    const mode = 'EKYC';
    // const eKycHubPromise = action === 'correction'
    //   ? ekycHub.panCardCorrection(mobileNumber, mode, transactionId)
    //   : ekycHub.panCardNew(mobileNumber, mode, transactionId);

    // const response = await eKycHubPromise;

    // Using static response for testing purposes
    const response = {
      txid: 54036297,
      status: 'Success',
      response_type: 'PAN_CARD',
      opid: 'Order is under process',
      message: 'Pan Redirection url created',
      url: 'https://connect.inspay.in/nsdl/pan?process_id=3024&txid=54036297&mode=K',
      number: '9071138349',
      amount: '107',
      orderid: 'YZCPY51519'
    };

    // Normalize status to uppercase
    const normalizeStatus = (status) => {
      if (!status) return 'FAILURE';
      const statusUpper = status.toUpperCase();
      if (statusUpper === 'SUCCESS') return 'SUCCESS';
      if (statusUpper === 'PENDING') return 'PENDING';
      return 'FAILURE';
    };

    const isSuccess = normalizeStatus(response.status) === 'SUCCESS';
    const isPending = normalizeStatus(response.status) === 'PENDING';
    const paymentStatus = isSuccess ? 'SUCCESS' : (isPending ? 'PENDING' : 'FAILURE');

    // Order Id must come from the response as compulsory
    const orderid = response.orderid;
    if (!orderid) {
      return res.failure({ message: 'Order ID not received from the provider response' });
    }

    // 4. Update Wallets & Create History (Post-API Success/Pending)
    let retailerComm = 0;
    let distributorComm = 0;
    let masterDistributorComm = 0;
    let companyComm = 0;
    let superAdminComm = 0;

    if (isSuccess || isPending) {
      const openingMainWallet = round4(currentWallet.mainWallet || 0);

      if ([4, 5].includes(user.userRole)) {
        if (isSuccess || isPending) {
          // Update outer variables for response structure
          retailerComm = commData.amounts.retailerComm;
          distributorComm = commData.amounts.distComm;
          masterDistributorComm = commData.amounts.mdComm;
          companyComm = commData.amounts.companyComm;
          superAdminComm = commData.amounts.superAdminComm;

          const historyPromises = [];
          const walletUpdates = [];
          const remarkStatus = isPending ? ` Pending-${operator.operatorName}` : `-${operator.operatorName}`;
          const remarkText = `PAN Card${remarkStatus}`;

          // A. Retailer Update (User)
          if (commData.users.retailer && commData.wallets.retailerWallet) {
            const retailerOpening = round4(commData.wallets.retailerWallet.mainWallet);
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
          }

          // B. Distributor Update
          if (commData.users.distributor && commData.wallets.distributorWallet) {
            const dWallet = commData.wallets.distributorWallet;
            const dOpening = round4(dWallet.mainWallet);
            let dClosing;
            let dDebit;
            let dRemark = `${remarkText} - dist comm`;

            if (user.userRole === 4) {
              // Distributor initiated the transaction directly
              dClosing = round4(dOpening - amountNumber + commData.amounts.distComm);
              dDebit = amountNumber;
              dRemark = remarkText;
            } else {
              // Retailer initiated, Distributor just gets commission
              const dNet = commData.amounts.distComm - commData.amounts.distShortfall;
              dClosing = round4(dOpening + dNet);
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
              credit: commData.amounts.distComm,
              debit: dDebit,
              transactionId: orderid,
              paymentStatus: paymentStatus,
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
              paymentStatus: paymentStatus,
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
            paymentStatus: paymentStatus,
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
            paymentStatus: paymentStatus,
            addedBy: commData.users.superAdmin.id,
            updatedBy: commData.users.superAdmin.id
          }));

          // Execute Updates
          await Promise.all([...walletUpdates, ...historyPromises]);

        }
      } else {
        // Non-Role 4/5 Logic (Fallback)
        const closing = round4(openingMainWallet - amountNumber);
        await dbService.update(model.wallet, { id: currentWallet.id }, { mainWallet: closing, updatedBy: user.id });

        const remarkStatus = isPending ? ` Pending-${operator.operatorName}` : `-${operator.operatorName}`;
        await dbService.createOne(model.walletHistory, {
          refId: user.id,
          companyId: user.companyId,
          walletType: 'mainWallet',
          operator: operator.operatorName,
          remark: `PAN Card${remarkStatus}`,
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
        refId: userId,
        companyId: companyId,
        serviceType: 'Pan',
        orderid: orderid,
        transactionId: transactionId,
        txid: response?.txid ? String(response.txid) : null,
        mobile_number: mobileNumber,
        amount: amountNumber,
        redirect_url: response?.redirect_url || response?.url || null,
        status: paymentStatus,
        action: action,
        request: JSON.stringify({
          mobile_number: mobileNumber,
          orderid: orderid,
          action: action,
          amount: amountNumber
        }),
        response: JSON.stringify(response),
        apiResponse: response,
        superadminComm: superAdminComm,
        whitelabelComm: companyComm,
        masterDistributorCom: masterDistributorComm,
        distributorCom: distributorComm,
        retailerCom: retailerComm,
        addedBy: userId,
        updatedBy: userId
      };

      await dbService.createOne(model.serviceTransaction, serviceTransactionData);
    } else {
      const serviceTransactionData = {
        refId: userId,
        companyId: companyId,
        serviceType: 'Pan',
        orderid: orderid,
        transactionId: transactionId,
        txid: response?.txid ? String(response.txid) : null,
        mobile_number: mobileNumber,
        amount: amountNumber,
        redirect_url: response?.redirect_url || response?.url || null,
        status: 'FAILURE',
        action: action,
        request: JSON.stringify({
          mobile_number: mobileNumber,
          orderid: orderid,
          action: action,
          amount: amountNumber
        }),
        response: JSON.stringify(response),
        apiResponse: response,
        superadminComm: 0,
        whitelabelComm: 0,
        masterDistributorCom: 0,
        distributorCom: 0,
        retailerCom: 0,
        addedBy: userId,
        updatedBy: userId
      };

      await dbService.createOne(model.serviceTransaction, serviceTransactionData);
    }

    if (isSuccess) {
      return res.success({
        message: response.message || 'PAN redirection URL created successfully',
        data: response
      });
    } else if (isPending) {
      return res.success({
        message: response.message || 'PAN redirection URL creation in process',
        data: response
      });
    } else {
      return res.failure({
        message: response.message || 'Failed to create PAN redirection URL',
        data: response
      });
    }
  } catch (error) {
    console.error('PAN redirection error:', error);
    return res.internalServerError({ message: error.message });
  }
};

module.exports = {
  panCardActions
};

