const dbService = require('../../../utils/dbService');
const axios = require('axios');
const bbpsService = require('../../../services/bbps');
const model = require('../../../models');
const BBPS_URL = process.env.BBPS_BASE_URL;
const decrypt = require('../../../utils/decrypt');
const sequelize = require('sequelize');
const { generateTransactionID } = require('../../../utils/transactionID');
const bcrypt = require('bcrypt');
const amezesmsService = require('../../../services/amezesmsApi');
const agentIp = process.env.BBPS_AGENT_IP;
const agentMac = process.env.BBPS_AGENT_MAC;
const calculateCCF1 = (billAmount, flatFee, percentFee) => {
  const ccf1Base = (billAmount * percentFee) / 100 + flatFee;
  const gstAmount = (ccf1Base * 18) / 100;
  const totalCCF1 = ccf1Base + gstAmount;
  return Math.floor(totalCCF1);
};

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

const payBill = async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.companyId || req.user.companyId;
    const { fetchRefId } = req.body;

    const convertRupeesToPaisa = (amount) =>
      Math.round(parseFloat(amount) * 100).toString();
    const convertPaisaToRupees = (paisa) =>
      (parseFloat(paisa) / 100).toFixed(2);

    const user = await dbService.findOne(
      model.user,
      { id: userId },
      {
        attributes: [
          'userRole', 'addedBy', 'name', 'email', 'secureKey',
          'mobileNo', 'reportingTo', 'companyId'
        ]
      }
    );
    if (!user) return res.failure({ message: 'User not found' });

    const finalCompanyId = companyId || user.companyId;
    if (!finalCompanyId) return res.failure({ message: 'Company ID is required' });
    if (!fetchRefId) return res.failure({ message: 'Required payment parameters missing' });

    const fetchedBillData = await dbService.findOne(model.billFetchData, {
      fetchRefId: req.body.fetchRefId,
      status: 'Pending',
      expiresAt: { [sequelize.Op.gt]: new Date() }
    });

    if (!fetchedBillData)
      return res.failure({ message: 'Bill data not found or expired. Please fetch the bill again.' });

    const agentId = fetchedBillData.agentId;
    const billerId = fetchedBillData.billerId;
    const billerAdhoc = fetchedBillData.billerAdhoc;
    const operatorService = fetchedBillData.operatorService;
    const fetchRefReqId = fetchedBillData.fetchRefId;
    const agentDeviceInfo = fetchedBillData.agentDeviceInfo
      ? typeof fetchedBillData.agentDeviceInfo === 'string'
        ? JSON.parse(fetchedBillData.agentDeviceInfo)
        : fetchedBillData.agentDeviceInfo
      : {};
    const customerInfo = fetchedBillData.customerInfo
      ? typeof fetchedBillData.customerInfo === 'string'
        ? JSON.parse(fetchedBillData.customerInfo)
        : fetchedBillData.customerInfo
      : {};
    const inputParams = fetchedBillData.inputParams
      ? typeof fetchedBillData.inputParams === 'string'
        ? JSON.parse(fetchedBillData.inputParams)
        : fetchedBillData.inputParams
      : {};
    const billerDetails = fetchedBillData.billerDetails
      ? typeof fetchedBillData.billerDetails === 'string'
        ? JSON.parse(fetchedBillData.billerDetails)
        : fetchedBillData.billerDetails
      : {};
    const additionalInfo = fetchedBillData.additionalInfo
      ? typeof fetchedBillData.additionalInfo === 'string'
        ? JSON.parse(fetchedBillData.additionalInfo)
        : fetchedBillData.additionalInfo
      : {};
    const responseData = fetchedBillData.responseData
      ? typeof fetchedBillData.responseData === 'string'
        ? JSON.parse(fetchedBillData.responseData)
        : fetchedBillData.responseData
      : {};

    const billAmount = parseFloat(
      responseData?.amountInfo?.amount || responseData?.billDetails?.billAmount || '0'
    );
    if (isNaN(billAmount) || billAmount <= 0)
      return res.failure({ message: 'Invalid bill amount' });

    let billerResponseData;
    if (billerDetails && Object.keys(billerDetails).length > 0) {
      billerResponseData = {
        ...billerDetails,
        billAmount: convertRupeesToPaisa(billerDetails.billAmount || billAmount)
      };
    } else {
      billerResponseData = {
        billAmount: convertRupeesToPaisa(billAmount),
        billDate: responseData?.billDetails?.billDate || new Date().toISOString().split('T')[0],
        billNumber: responseData?.billDetails?.billNumber || '',
        billPeriod: responseData?.billDetails?.billPeriod || 'Monthly',
        customerName: responseData?.billDetails?.customerName || '',
        dueDate: responseData?.billDetails?.dueDate || ''
      };
    }

    const foundOperator = await dbService.findOne(
      model.operator,
      { operatorName: operatorService, operatorType: 'BBPS' },
      {
        attributes: [
          'id', 'operatorName', 'operatorType', 'operatorCode',
          'minValue', 'maxValue', 'comm', 'amtType',
          'superadminComm', 'whitelabelComm', 'masterDistributorCom',
          'masterDistrbutorCom', 'distributorCom', 'retailerCom', 'reatilerCom'
        ]
      }
    );
    if (!foundOperator) return res.failure({ message: 'Invalid Operator!' });

    const foundCategory = await dbService.findOne(
      model.bbpsOperatorCategory,
      { name: operatorService },
      { attributes: ['custConvFee', 'flatFee', 'percentFee', 'gstRate', 'isCCF1Category'] }
    );
    if (!foundCategory) return res.failure({ message: 'Invalid Category!' });

    let ccf1Amount = 0;
    let needsCCF1 = false;
    if (foundCategory.isCCF1Category) needsCCF1 = true;
    if (needsCCF1) {
      const flatFee = (foundCategory.flatFee ? foundCategory.flatFee : 0) * 100 || 100;
      const percentFee = foundCategory.percentFee || 1.2;
      ccf1Amount = calculateCCF1(parseInt(convertRupeesToPaisa(billAmount)), flatFee, percentFee);
      console.log(`CCF1 calculated for category: ${operatorService}, amount: ${ccf1Amount} paisa`);
    }

    const channelPaymentInfo = await dbService.findOne(
      model.bbpsPaymentInfo,
      { initiatingChannel: agentDeviceInfo?.initChannel },
      { attributes: ['paymentMethod', 'paymentInfo'] }
    );
    if (!channelPaymentInfo)
      return res.failure({ message: 'Payment mode is required. Please contact the administrator.' });

    let channelPaymentMethod = channelPaymentInfo.paymentMethod || {};
    let channelPaymentInfoData = channelPaymentInfo.paymentInfo || {};
    if (typeof channelPaymentMethod === 'string') {
      try { channelPaymentMethod = JSON.parse(channelPaymentMethod); } catch (e) { channelPaymentMethod = {}; }
    }
    if (typeof channelPaymentInfoData === 'string') {
      try { channelPaymentInfoData = JSON.parse(channelPaymentInfoData); } catch (e) { channelPaymentInfoData = {}; }
    }

    const jsonData = {
      agentId, billerAdhoc,
      agentDeviceInfo: {
        ip: agentDeviceInfo?.agentIp || agentDeviceInfo?.ip || ' ',
        mac: agentDeviceInfo?.agentMac || agentDeviceInfo?.mac || ' ',
        initChannel: agentDeviceInfo?.agentInitChannel || agentDeviceInfo?.initChannel || ' '
      },
      customerInfo: {
        customerMobile: customerInfo?.customerMobile || '',
        customerEmail: customerInfo?.customerEmail || '',
        customerAdhaar: customerInfo?.customerAdhaar || '',
        customerPan: customerInfo?.customerPan || '',
        REMITTER_NAME: 'GMAXPAY'
      },
      billerId, inputParams,
      billerResponse: billerResponseData,
      paymentRefId: fetchRefId,
      amountInfo: {
        amount: convertRupeesToPaisa(
          responseData?.amountInfo?.amount?.toString() || responseData?.billDetails?.billAmount || '0'
        ),
        currency: process.env.BBPS_CURRENCY_CODE || 356,
        custConvFee: foundCategory.custConvFee || 0,
        ...(needsCCF1 && { CCF1: ccf1Amount }),
        amountTags: process.env.BBPS_AMOUNT_TAGS ? JSON.parse(process.env.BBPS_AMOUNT_TAGS) : []
      },
      paymentMethod: channelPaymentMethod,
      paymentInfo: channelPaymentInfoData
    };

    console.log('jsonData:', JSON.stringify(jsonData, null, 2));

    if (additionalInfo && additionalInfo.info && additionalInfo.info.length > 0) {
      jsonData.additionalInfo = additionalInfo;
    } else if (responseData?.additionalInfo?.info && responseData.additionalInfo.info.length > 0) {
      jsonData.additionalInfo = responseData.additionalInfo;
    }

    if (needsCCF1) {
      const ccf1InRupees = convertPaisaToRupees(ccf1Amount);
      const ccf1Info = { infoName: 'CCF1 Fee (Rs.) + GST', infoValue: ccf1InRupees };
      if (jsonData.additionalInfo && jsonData.additionalInfo.info) {
        jsonData.additionalInfo.info.push(ccf1Info);
      } else {
        jsonData.additionalInfo = { info: [ccf1Info] };
      }
    }

    const [foundUserWallet, bbpsOperatorName] = await Promise.all([
      dbService.findOne(model.wallet, { refId: userId }),
      dbService.findOne(model.bbpsOperator, { billerId }, { attributes: ['id', 'name'] })
    ]);

    if (!foundUserWallet) return res.failure({ message: 'Wallet not found!' });
    const currentWalletBalance = foundUserWallet.mainWallet || 0;

    const ccf1Rupees = needsCCF1 ? parseFloat(convertPaisaToRupees(ccf1Amount)) : 0;
    const custConvFeeRupees = foundCategory.custConvFee && foundCategory.custConvFee != 0
      ? parseFloat(convertPaisaToRupees(foundCategory.custConvFee)) : 0;

    // ── Hierarchical Commission (same as rechargeController) ──────────────────
    const amountNumber = round4(billAmount);
    const operatorType = 'BBPS';
    const debit = round4(parseFloat(billAmount) + ccf1Rupees + custConvFeeRupees);
    const surcharge = 0;
    const commission = foundOperator?.comm ? round4(Number(foundOperator.comm)) : 0;

    const commData = {
      users: {}, wallets: {}, slabs: {},
      amounts: {
        retailerComm: 0, distComm: 0, mdComm: 0,
        companyComm: 0, superAdminComm: 0,
        wlShortfall: 0, mdShortfall: 0, distShortfall: 0, saShortfall: 0
      },
      scenario: ''
    };

    if (currentWalletBalance < debit)
      return res.failure({ message: 'Insufficient wallet balance!' });

    if ([4, 5].includes(user.userRole)) {
      const [companyAdmin, superAdmin] = await Promise.all([
        dbService.findOne(model.user, { companyId: finalCompanyId, userRole: 2, isActive: true }),
        dbService.findOne(model.user, { id: 1, companyId: 1, userRole: 1, isActive: true })
      ]);

      if (companyAdmin && superAdmin) {
        commData.users.companyAdmin = companyAdmin;
        commData.users.superAdmin = superAdmin;

        const [companyWallet, superAdminWallet] = await Promise.all([
          dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: finalCompanyId }),
          dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 })
        ]);
        commData.wallets.companyWallet = companyWallet;
        commData.wallets.superAdminWallet = superAdminWallet;

        if (user.userRole === 4) {
          // ── Distributor ──
          const distributor = await dbService.findOne(model.user, { id: userId, companyId: finalCompanyId, isActive: true });
          commData.users.distributor = distributor;
          commData.wallets.distributorWallet = foundUserWallet;

          if (distributor.reportingTo === companyAdmin.id || distributor.reportingTo === null) {
            commData.scenario = 'DIST_DIRECT';
            const [saSlabs, wlSlabs] = await Promise.all([
              dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: foundOperator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
              dbService.findAll(model.commSlab, { companyId: finalCompanyId, addedBy: companyAdmin.id, operatorId: foundOperator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
            ]);
            commData.slabs.saSlab = saSlabs?.find(c => c.roleType === 1 || c.roleName === 'AD');
            commData.slabs.wlSlab = saSlabs?.find(c => c.roleType === 2 || c.roleName === 'WU');
            commData.slabs.distSlab = wlSlabs?.find(c => c.roleType === 4 || c.roleName === 'DI');
          } else {
            commData.scenario = 'DIST_MD';
            const masterDistributor = await dbService.findOne(model.user, { id: distributor.reportingTo, companyId: finalCompanyId, isActive: true });
            if (masterDistributor) {
              commData.users.masterDistributor = masterDistributor;
              commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: finalCompanyId });
              const [saSlabs, wlSlabs, mdSlabs] = await Promise.all([
                dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: foundOperator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                dbService.findAll(model.commSlab, { companyId: finalCompanyId, addedBy: companyAdmin.id, operatorId: foundOperator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                dbService.findAll(model.commSlab, { companyId: finalCompanyId, addedBy: masterDistributor.id, operatorId: foundOperator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
              ]);
              commData.slabs.saSlab = saSlabs?.find(c => c.roleType === 1 || c.roleName === 'AD');
              commData.slabs.wlSlab = saSlabs?.find(c => c.roleType === 2 || c.roleName === 'WU');
              commData.slabs.mdSlab = wlSlabs?.find(c => c.roleType === 3);
              commData.slabs.distSlab = mdSlabs?.find(c => c.roleType === 4);
            }
          }

        } else if (user.userRole === 5) {
          // ── Retailer ──
          const retailer = await dbService.findOne(model.user, { id: userId, companyId: finalCompanyId, isActive: true });
          commData.users.retailer = retailer;
          commData.wallets.retailerWallet = foundUserWallet;

          let reportingUser = null;
          if (retailer.reportingTo && retailer.reportingTo !== companyAdmin.id) {
            reportingUser = await dbService.findOne(model.user, { id: retailer.reportingTo, companyId: finalCompanyId, isActive: true });
          }

          if (!reportingUser || retailer.reportingTo === companyAdmin.id || retailer.reportingTo === null) {
            commData.scenario = 'RET_DIRECT';
            const [saSlabs, wlSlabs] = await Promise.all([
              dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: foundOperator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
              dbService.findAll(model.commSlab, { companyId: finalCompanyId, addedBy: companyAdmin.id, operatorId: foundOperator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
            ]);
            commData.slabs.saSlab = saSlabs?.find(c => c.roleType === 1 || c.roleName === 'AD');
            commData.slabs.wlSlab = saSlabs?.find(c => c.roleType === 2 || c.roleName === 'WU');
            commData.slabs.retSlab = wlSlabs?.find(c => c.roleType === 5);

          } else if (reportingUser.userRole === 3) {
            commData.scenario = 'RET_MD';
            commData.users.masterDistributor = reportingUser;
            commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: reportingUser.id, companyId: finalCompanyId });
            const [saSlabs, wlSlabs, mdSlabs] = await Promise.all([
              dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: foundOperator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
              dbService.findAll(model.commSlab, { companyId: finalCompanyId, addedBy: companyAdmin.id, operatorId: foundOperator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
              dbService.findAll(model.commSlab, { companyId: finalCompanyId, addedBy: reportingUser.id, operatorId: foundOperator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
            ]);
            commData.slabs.saSlab = saSlabs?.find(c => c.roleType === 1 || c.roleName === 'AD');
            commData.slabs.wlSlab = saSlabs?.find(c => c.roleType === 2 || c.roleName === 'WU');
            commData.slabs.mdSlab = wlSlabs?.find(c => c.roleType === 3);
            commData.slabs.retSlab = mdSlabs?.find(c => c.roleType === 5);

          } else if (reportingUser.userRole === 4) {
            commData.users.distributor = reportingUser;
            commData.wallets.distributorWallet = await dbService.findOne(model.wallet, { refId: reportingUser.id, companyId: finalCompanyId });

            if (reportingUser.reportingTo === companyAdmin.id || reportingUser.reportingTo === null) {
              commData.scenario = 'RET_DIST_CO';
              const [saSlabs, wlSlabs, distSlabs] = await Promise.all([
                dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: foundOperator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                dbService.findAll(model.commSlab, { companyId: finalCompanyId, addedBy: companyAdmin.id, operatorId: foundOperator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                dbService.findAll(model.commSlab, { companyId: finalCompanyId, addedBy: reportingUser.id, operatorId: foundOperator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
              ]);
              commData.slabs.saSlab = saSlabs?.find(c => c.roleType === 1 || c.roleName === 'AD');
              commData.slabs.wlSlab = saSlabs?.find(c => c.roleType === 2 || c.roleName === 'WU');
              commData.slabs.distSlab = wlSlabs?.find(c => c.roleType === 4);
              commData.slabs.retSlab = distSlabs?.find(c => c.roleType === 5);

            } else {
              commData.scenario = 'RET_DIST_MD';
              const masterDistributor = await dbService.findOne(model.user, { id: reportingUser.reportingTo, companyId: finalCompanyId, isActive: true });
              if (masterDistributor) {
                commData.users.masterDistributor = masterDistributor;
                commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: finalCompanyId });
                const [saSlabs, wlSlabs, mdSlabs, distSlabs] = await Promise.all([
                  dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: foundOperator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                  dbService.findAll(model.commSlab, { companyId: finalCompanyId, addedBy: companyAdmin.id, operatorId: foundOperator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                  dbService.findAll(model.commSlab, { companyId: finalCompanyId, addedBy: masterDistributor.id, operatorId: foundOperator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                  dbService.findAll(model.commSlab, { companyId: finalCompanyId, addedBy: reportingUser.id, operatorId: foundOperator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                ]);
                commData.slabs.saSlab = saSlabs?.find(c => c.roleType === 1 || c.roleName === 'AD');
                commData.slabs.wlSlab = saSlabs?.find(c => c.roleType === 2 || c.roleName === 'WU');
                commData.slabs.mdSlab = wlSlabs?.find(c => c.roleType === 3);
                commData.slabs.distSlab = mdSlabs?.find(c => c.roleType === 4);
                commData.slabs.retSlab = distSlabs?.find(c => c.roleType === 5);
              }
            }
          }
        }

        // ── Calculate commission amounts ──────────────────────────────────────
        const operatorCommissionAmount = foundOperator.comm
          ? calcSlabAmount({ amtType: foundOperator.amtType, commAmt: foundOperator.comm }, amountNumber) : 0;
        const saSlabAmount = calcSlabAmount(commData.slabs.saSlab, amountNumber);
        const wlSlabAmount = calcSlabAmount(commData.slabs.wlSlab, amountNumber);
        const mdSlabAmount = calcSlabAmount(commData.slabs.mdSlab, amountNumber);
        const distSlabAmount = calcSlabAmount(commData.slabs.distSlab, amountNumber);
        const retSlabAmount = calcSlabAmount(commData.slabs.retSlab, amountNumber);

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
        commData.amounts.wlShortfall = companyCost > wlSlabAmount
          ? parseFloat((companyCost - wlSlabAmount).toFixed(4)) : 0;

        // Master Distributor
        if (commData.users.masterDistributor) {
          const mdCost = commData.users.distributor ? distSlabAmount : retSlabAmount;
          commData.amounts.mdComm = Math.max(0, round4(mdSlabAmount - mdCost));
          commData.amounts.mdShortfall = mdCost > mdSlabAmount
            ? parseFloat((mdCost - mdSlabAmount).toFixed(4)) : 0;
        }

        // Distributor
        if (commData.users.distributor) {
          commData.amounts.distComm = Math.max(0, round4(distSlabAmount - retSlabAmount));
          commData.amounts.distShortfall = retSlabAmount > distSlabAmount
            ? parseFloat((retSlabAmount - distSlabAmount).toFixed(4)) : 0;
        }

        // Retailer
        commData.amounts.retailerComm = retSlabAmount;

        console.log('[BBPS payBill] Final Commission Amounts:', JSON.stringify(commData.amounts, null, 2));
      }
    }

    // Fetch company for transaction ID generation
    const existingCompany = await dbService.findOne(model.company, { id: finalCompanyId });
    const transactionID = generateTransactionID(existingCompany?.companyName);

    let parsedResponse = null;

    try {
      const { data: apiResponseData } = await bbpsService.payBillRequest(jsonData, fetchRefId);
      parsedResponse = apiResponseData;
      console.log('reposeData', parsedResponse);

      if (parsedResponse?.respAmount) {
        parsedResponse.respAmount = convertPaisaToRupees(parsedResponse.respAmount);
      }

      let apiCustConvFeeRupees = 0;
      if (parsedResponse?.custConvFee && !isNaN(parsedResponse.custConvFee)) {
        apiCustConvFeeRupees = parseFloat(convertPaisaToRupees(parsedResponse.custConvFee));
      }

      if (parsedResponse.responseCode !== '000') {
        let errorMessage = 'Unable to process payment. Please try again later.';
        if (parsedResponse.vErrorRootVO && Array.isArray(parsedResponse.vErrorRootVO.error)) {
          const firstError = parsedResponse.vErrorRootVO.error[0];
          if (firstError && firstError.errorMessage) errorMessage = firstError.errorMessage;
          parsedResponse.vErrorRootVO.error.forEach((errorItem, index) => {
            console.error(`Error ${index + 1}: Code: ${errorItem.errorCode}, Message: ${errorItem.errorMessage}`);
          });
        }
        await dbService.createOne(model.billPaymentHistory, {
          refId: userId, companyId: finalCompanyId, operatorId: foundOperator.id,
          operator: foundOperator.operatorName, billerName: `${bbpsOperatorName?.name || foundOperator.operatorName}`,
          billNumber: responseData?.billDetails?.billNumber || billerId,
          api: 'BBPS', walletType: 'MainWallet', amount: billAmount,
          debit: 0, comm: commission, surcharge: 0,
          opening: currentWalletBalance, closing: currentWalletBalance, credit: 0,
          mobileNumber: customerInfo?.customerMobile || '', cardNumber: '',
          transactionType: 'BBPS', transactionId: transactionID, paymentStatus: 'Failed',
          refundStatus: 'Success', paymentMethod: 'Wallet', fetchBillId: fetchRefReqId,
          remarks: errorMessage, response: parsedResponse, addedBy: userId, updatedBy: userId,
          isStatusChecked: false, distributerSurcharge: 0, distributorAmount: '0.00',
          distributerComm: String(commData.amounts.distComm || 0),
          companyCommission: '0.00', whitelabelCommission: commData.amounts.companyComm || 0,
          adminAmount: '0.00', adminSurcharge: 0, adminComm: '0.00',
          superadminComm: commData.amounts.superAdminComm,
          whitelabelComm: commData.amounts.companyComm,
          masterDistributorCom: commData.amounts.mdComm,
          distributorCom: commData.amounts.distComm,
          retailerCom: commData.amounts.retailerComm,
          userDetails: { name: user.name, email: user.email, mobileNo: user.mobileNo, userRole: user.userRole, ...customerInfo },
          txnRefId: '', respAmount: '', respCustomerName: customerInfo?.customerName || '',
          respBillNumber: '', respBillDate: new Date().toISOString().split('T')[0],
          respDueDate: '', respBillPeriod: '', approvalRefNumber: null,
          agentId, initiatingChannel: fetchedBillData.initiatingChannel,
          customerConvenienceFees: fetchedBillData.customerConvenienceFees, ...user
        });
        await dbService.update(model.billFetchData, { fetchRefId: fetchRefReqId }, { status: 'Failed' });
        return res.failure({ message: errorMessage, data: parsedResponse, orderid: transactionID, status: 'Failed' });
      }

      const billStatus = parsedResponse.responseCode === '000' ? 'Success'
        : parsedResponse.responseCode === '204' ? 'Pending' : 'Failed';
      const isSuccess = billStatus === 'Success';
      const isPending = billStatus === 'Pending';
      const respAmountInRupees = parsedResponse?.respAmount || billAmount.toString();

      // ── Post-response wallet updates ──────────────────────────────────────────
      if (isSuccess || isPending) {
        const remarkText = `BBPS-${bbpsOperatorName?.name || foundOperator.operatorName}`;

        if ([4, 5].includes(user.userRole) && commData.users.companyAdmin && commData.users.superAdmin) {
          const walletUpdates = [];
          const historyPromises = [];

          // A. Retailer
          if (commData.users.retailer && commData.wallets.retailerWallet) {
            const rWallet = commData.wallets.retailerWallet;
            const rOpening = round4(rWallet.mainWallet);
            const rMid = round4(rOpening - debit);
            const rClosing = round4(rMid + commData.amounts.retailerComm);

            walletUpdates.push(dbService.update(model.wallet, { id: rWallet.id }, { mainWallet: rClosing, updatedBy: userId }));
            historyPromises.push(dbService.createOne(model.walletHistory, {
              refId: userId, companyId: finalCompanyId,
              remark: remarkText, operator: foundOperator.operatorName,
              amount: billAmount, comm: 0, surcharge: 0,
              openingAmt: rOpening, closingAmt: rMid,
              credit: 0, debit: debit,
              transactionId: transactionID || parsedResponse?.txnRefId?.toString(),
              paymentStatus: billStatus.toUpperCase(), addedBy: userId, updatedBy: userId
            }));
            if (commData.amounts.retailerComm > 0) {
              historyPromises.push(dbService.createOne(model.walletHistory, {
                refId: userId, companyId: finalCompanyId,
                remark: `${remarkText} - commission`, operator: foundOperator.operatorName,
                amount: billAmount, comm: commData.amounts.retailerComm, surcharge: 0,
                openingAmt: rMid, closingAmt: rClosing,
                credit: commData.amounts.retailerComm, debit: 0,
                transactionId: transactionID || parsedResponse?.txnRefId?.toString(),
                paymentStatus: billStatus.toUpperCase(), addedBy: userId, updatedBy: userId
              }));
            }
          }

          // B. Distributor
          if (commData.users.distributor && commData.wallets.distributorWallet) {
            const dWallet = commData.wallets.distributorWallet;
            const dOpening = round4(dWallet.mainWallet);

            let dDebitAmt = 0;
            let dCreditAmt = commData.amounts.distComm;
            let dRemarkDebit = '';

            if (user.userRole === 4) {
              dDebitAmt = debit;
              dRemarkDebit = remarkText;
            } else {
              dDebitAmt = commData.amounts.distShortfall;
              dRemarkDebit = `${remarkText} - dist shortfall`;
            }

            const dMid = round4(dOpening - dDebitAmt);
            const dClosing = round4(dMid + dCreditAmt);

            walletUpdates.push(dbService.update(model.wallet, { id: dWallet.id }, { mainWallet: dClosing, updatedBy: commData.users.distributor.id }));

            if (dDebitAmt > 0 || user.userRole === 4) {
              historyPromises.push(dbService.createOne(model.walletHistory, {
                refId: commData.users.distributor.id, companyId: finalCompanyId,
                remark: dRemarkDebit, operator: foundOperator.operatorName,
                amount: billAmount, comm: 0, surcharge: 0,
                openingAmt: dOpening, closingAmt: dMid,
                credit: 0, debit: dDebitAmt,
                transactionId: transactionID || parsedResponse?.txnRefId?.toString(),
                paymentStatus: billStatus.toUpperCase(), addedBy: commData.users.distributor.id, updatedBy: commData.users.distributor.id
              }));
            }

            if (dCreditAmt > 0) {
              historyPromises.push(dbService.createOne(model.walletHistory, {
                refId: commData.users.distributor.id, companyId: finalCompanyId,
                remark: user.userRole === 4 ? `${remarkText} - commission` : `${remarkText} - dist comm`, operator: foundOperator.operatorName,
                amount: billAmount, comm: dCreditAmt, surcharge: 0,
                openingAmt: dMid, closingAmt: dClosing,
                credit: dCreditAmt, debit: 0,
                transactionId: transactionID || parsedResponse?.txnRefId?.toString(),
                paymentStatus: billStatus.toUpperCase(), addedBy: commData.users.distributor.id, updatedBy: commData.users.distributor.id
              }));
            }
          }

          // C. Master Distributor
          if (commData.users.masterDistributor && commData.wallets.masterDistributorWallet) {
            const mWallet = commData.wallets.masterDistributorWallet;
            const mOpening = round4(mWallet.mainWallet);
            const mMid = round4(mOpening - commData.amounts.mdShortfall);
            const mClosing = round4(mMid + commData.amounts.mdComm);

            walletUpdates.push(dbService.update(model.wallet, { id: mWallet.id }, { mainWallet: mClosing, updatedBy: commData.users.masterDistributor.id }));

            if (commData.amounts.mdShortfall > 0) {
              historyPromises.push(dbService.createOne(model.walletHistory, {
                refId: commData.users.masterDistributor.id, companyId: finalCompanyId,
                remark: `${remarkText} - md shortfall`, operator: foundOperator.operatorName,
                amount: billAmount, comm: 0, surcharge: 0,
                openingAmt: mOpening, closingAmt: mMid,
                credit: 0, debit: commData.amounts.mdShortfall,
                transactionId: transactionID || parsedResponse?.txnRefId?.toString(),
                paymentStatus: billStatus.toUpperCase(), addedBy: commData.users.masterDistributor.id, updatedBy: commData.users.masterDistributor.id
              }));
            }

            if (commData.amounts.mdComm > 0) {
              historyPromises.push(dbService.createOne(model.walletHistory, {
                refId: commData.users.masterDistributor.id, companyId: finalCompanyId,
                remark: `${remarkText} - md comm`, operator: foundOperator.operatorName,
                amount: billAmount, comm: commData.amounts.mdComm, surcharge: 0,
                openingAmt: mMid, closingAmt: mClosing,
                credit: commData.amounts.mdComm, debit: 0,
                transactionId: transactionID || parsedResponse?.txnRefId?.toString(),
                paymentStatus: billStatus.toUpperCase(), addedBy: commData.users.masterDistributor.id, updatedBy: commData.users.masterDistributor.id
              }));
            }
          }

          // D. Company (WL)
          if (commData.wallets.companyWallet) {
            const cWallet = commData.wallets.companyWallet;
            const cOpening = round4(cWallet.mainWallet);
            const cMid = round4(cOpening - commData.amounts.wlShortfall);
            const cClosing = round4(cMid + commData.amounts.companyComm);

            walletUpdates.push(dbService.update(model.wallet, { id: cWallet.id }, { mainWallet: cClosing, updatedBy: commData.users.companyAdmin.id }));

            if (commData.amounts.wlShortfall > 0) {
              historyPromises.push(dbService.createOne(model.walletHistory, {
                refId: commData.users.companyAdmin.id, companyId: finalCompanyId,
                remark: `${remarkText} - company shortfall`, operator: foundOperator.operatorName,
                amount: billAmount, comm: 0, surcharge: 0,
                openingAmt: cOpening, closingAmt: cMid,
                credit: 0, debit: commData.amounts.wlShortfall,
                transactionId: transactionID || parsedResponse?.txnRefId?.toString(),
                paymentStatus: billStatus.toUpperCase(), addedBy: commData.users.companyAdmin.id, updatedBy: commData.users.companyAdmin.id
              }));
            }

            if (commData.amounts.companyComm > 0) {
              historyPromises.push(dbService.createOne(model.walletHistory, {
                refId: commData.users.companyAdmin.id, companyId: finalCompanyId,
                remark: `${remarkText} - company comm`, operator: foundOperator.operatorName,
                amount: billAmount, comm: commData.amounts.companyComm, surcharge: 0,
                openingAmt: cMid, closingAmt: cClosing,
                credit: commData.amounts.companyComm, debit: 0,
                transactionId: transactionID || parsedResponse?.txnRefId?.toString(),
                paymentStatus: billStatus.toUpperCase(), addedBy: commData.users.companyAdmin.id, updatedBy: commData.users.companyAdmin.id
              }));
            }
          }

          // E. Super Admin
          if (commData.wallets.superAdminWallet) {
            const saWallet = commData.wallets.superAdminWallet;
            const saOpening = round4(saWallet.mainWallet);
            const saMid = round4(saOpening - commData.amounts.saShortfall);
            const saClosing = round4(saMid + commData.amounts.superAdminComm);

            walletUpdates.push(dbService.update(model.wallet, { id: saWallet.id }, { mainWallet: saClosing, updatedBy: commData.users.superAdmin.id }));

            if (commData.amounts.saShortfall > 0) {
              historyPromises.push(dbService.createOne(model.walletHistory, {
                refId: commData.users.superAdmin.id, companyId: 1,
                remark: `${remarkText} - admin shortfall`, operator: foundOperator.operatorName,
                amount: billAmount, comm: 0, surcharge: 0,
                openingAmt: saOpening, closingAmt: saMid,
                credit: 0, debit: commData.amounts.saShortfall,
                transactionId: transactionID || parsedResponse?.txnRefId?.toString(),
                paymentStatus: billStatus.toUpperCase(), addedBy: commData.users.superAdmin.id, updatedBy: commData.users.superAdmin.id
              }));
            }

            if (commData.amounts.superAdminComm > 0) {
              historyPromises.push(dbService.createOne(model.walletHistory, {
                refId: commData.users.superAdmin.id, companyId: 1,
                remark: `${remarkText} - admin comm`, operator: foundOperator.operatorName,
                amount: billAmount, comm: commData.amounts.superAdminComm, surcharge: 0,
                openingAmt: saMid, closingAmt: saClosing,
                credit: commData.amounts.superAdminComm, debit: 0,
                transactionId: transactionID || parsedResponse?.txnRefId?.toString(),
                paymentStatus: billStatus.toUpperCase(), addedBy: commData.users.superAdmin.id, updatedBy: commData.users.superAdmin.id
              }));
            }
          }

          await Promise.all([...walletUpdates, ...historyPromises]);

        } else {
          // Non-role 4/5 fallback — just debit the user, no commission
          const fallbackClosing = round4(currentWalletBalance - debit);
          await dbService.update(model.wallet, { refId: userId, companyId: finalCompanyId }, { mainWallet: fallbackClosing, updatedBy: userId });
          await dbService.createOne(model.walletHistory, {
            refId: userId, companyId: finalCompanyId,
            remark: `BBPS-${bbpsOperatorName?.name || foundOperator.operatorName}`,
            operator: foundOperator.operatorName, amount: billAmount, comm: 0, surcharge: 0,
            openingAmt: currentWalletBalance, closingAmt: fallbackClosing,
            credit: 0, debit,
            transactionId: transactionID || parsedResponse?.txnRefId?.toString(),
            paymentStatus: billStatus.toUpperCase(), addedBy: userId, updatedBy: userId
          });
        }
      }

      // ── billPaymentHistory record ─────────────────────────────────────────────
      const userClosingBal = (() => {
        if (isSuccess || isPending) {
          if (commData.users.retailer) return round4(currentWalletBalance - debit + commData.amounts.retailerComm);
          if (commData.users.distributor && user.userRole === 4) return round4(currentWalletBalance - debit + commData.amounts.distComm);
        }
        return round4(currentWalletBalance - (isSuccess || isPending ? debit : 0));
      })();

      const historyData = {
        refId: userId, companyId: finalCompanyId, operatorId: foundOperator.id,
        operator: foundOperator.operatorName, billerName: `${bbpsOperatorName?.name || foundOperator.operatorName}`,
        billNumber: responseData?.billDetails?.billNumber || billerId,
        api: 'BBPS', walletType: 'MainWallet', amount: billAmount,
        debit: isSuccess || isPending ? debit : 0,
        comm: commission, surcharge: 0,
        opening: currentWalletBalance, closing: userClosingBal,
        credit: commData.amounts.retailerComm || commData.amounts.distComm || 0,
        mobileNumber: customerInfo?.customerMobile || '', cardNumber: '',
        transactionType: 'BBPS', transactionId: transactionID, paymentStatus: billStatus,
        refundStatus: billStatus === 'Failed' ? 'Success' : 'Dispute',
        paymentMethod: 'Wallet', fetchBillId: fetchRefReqId,
        remarks: `BBPS payment for ${bbpsOperatorName?.name || foundOperator.operatorName}`,
        response: parsedResponse || {}, addedBy: userId, updatedBy: userId,
        isStatusChecked: isSuccess,
        distributerSurcharge: 0, distributorAmount: '0.00',
        distributerComm: String(commData.amounts.distComm || 0),
        companyCommission: '0.00', whitelabelCommission: commData.amounts.companyComm || 0,
        adminAmount: '0.00', adminSurcharge: 0, adminComm: '0.00',
        superadminComm: commData.amounts.superAdminComm,
        whitelabelComm: commData.amounts.companyComm,
        masterDistributorCom: commData.amounts.mdComm,
        distributorCom: commData.amounts.distComm,
        retailerCom: commData.amounts.retailerComm,
        userDetails: { name: user.name, email: user.email, mobileNo: user.mobileNo, userRole: user.userRole, ...customerInfo },
        txnRefId: parsedResponse?.txnRefId?.toString() || '',
        respAmount: respAmountInRupees,
        respCustomerName: parsedResponse?.respCustomerName || customerInfo?.customerName || '',
        respBillNumber: parsedResponse?.respBillNumber || responseData?.billDetails?.billNumber || '',
        respBillDate: parsedResponse?.respBillDate || responseData?.billDetails?.billDate || new Date().toISOString().split('T')[0],
        respDueDate: parsedResponse?.respDueDate || responseData?.billDetails?.dueDate || '',
        respBillPeriod: parsedResponse?.respBillPeriod || responseData?.billDetails?.billPeriod || '',
        approvalRefNumber: parsedResponse?.approvalRefNumber || null,
        agentId, initiatingChannel: fetchedBillData.initiatingChannel,
        customerConvenienceFees: fetchedBillData.customerConvenienceFees, ...user
      };

      if (isSuccess) {
        const currentDateTime = new Date().toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        });
        const smsUrl = `Thank you for payment of Rs.${parseInt(billAmount)} against ${bbpsOperatorName?.name || foundOperator.operatorName}, Consumer no ${customerInfo?.customerMobile}, B-Connect Txn Ref ID ${parsedResponse.txnRefId} on ${currentDateTime} vide Wallet. Team Gmaxepay`;
        await amezesmsService.sendBbpsPaymentSucess(customerInfo?.customerMobile, smsUrl);

        const createdBillHistory = await dbService.createOne(model.billPaymentHistory, historyData);
        if (!createdBillHistory) return res.failure({ message: 'Create bill payment history failed!' });

        await dbService.update(model.billFetchData, { fetchRefId: fetchRefReqId }, { status: 'Success', updatedBy: req.user.id });

        console.log('BBPS Pay Bill Response:', parsedResponse, 'amount in rupees:', parsedResponse.respAmount);

        return res.success({
          message: 'Bill payment successful',
          data: {
            ...parsedResponse, status: billStatus,
            txid: parsedResponse?.txnRefId, utr: parsedResponse?.approvalRefNumber,
            mobile: parsedResponse?.mobile || customerInfo?.customerMobile,
            amount: parsedResponse.respAmount,
            message: parsedResponse?.responseReason || 'Payment Successful',
            orderid: transactionID,
            surcharge: (parseFloat(surcharge) + apiCustConvFeeRupees).toFixed(2),
            apiCustConvFee: apiCustConvFeeRupees.toFixed(2),
            userRole: user.userRole
          }
        });
      } else {
        await dbService.createOne(model.billPaymentHistory, historyData);
        await dbService.update(model.billFetchData, { fetchRefId: fetchRefId }, { status: 'Failed' });
        return res.failure({
          message: parsedResponse.responseReason || 'Bill payment failed',
          data: { status: billStatus, message: parsedResponse.responseReason || 'Payment Failed', orderid: transactionID }
        });
      }
    } catch (error) {
      console.error('API or decrypt error:', error);
      await dbService.update(model.billFetchData, { fetchRefId: fetchRefId }, { status: 'Failed' });
      await dbService.createOne(model.billPaymentHistory, {
        refId: userId, companyId: finalCompanyId, operatorId: foundOperator.id,
        operator: foundOperator.operatorName, billerName: `${bbpsOperatorName?.name || foundOperator.operatorName}`,
        billNumber: billerId, api: 'BBPS', walletType: 'MainWallet', amount: billAmount,
        debit: 0, comm: commission, surcharge: 0,
        opening: currentWalletBalance, closing: currentWalletBalance, credit: 0,
        mobileNumber: customerInfo?.customerMobile || '', cardNumber: '',
        transactionType: 'BBPS', transactionId: transactionID, paymentStatus: 'Failed',
        refundStatus: 'Success', paymentMethod: 'Wallet', fetchBillId: fetchRefId,
        remarks: error.message || 'Processing error',
        response: JSON.stringify({ error: error.message }),
        addedBy: userId, updatedBy: userId, isStatusChecked: false,
        distributerSurcharge: 0, distributorAmount: '0.00',
        distributerComm: String(commData.amounts.distComm || 0),
        companyCommission: '0.00', whitelabelCommission: commData.amounts.companyComm || 0,
        adminAmount: '0.00', adminSurcharge: 0, adminComm: '0.00',
        superadminComm: commData.amounts.superAdminComm,
        whitelabelComm: commData.amounts.companyComm,
        masterDistributorCom: commData.amounts.mdComm,
        distributorCom: commData.amounts.distComm,
        retailerCom: commData.amounts.retailerComm,
        userDetails: { name: user.name, email: user.email, mobileNo: user.mobileNo, userRole: user.userRole, ...customerInfo },
        txnRefId: '', respAmount: '', respCustomerName: customerInfo?.customerName || '',
        respBillNumber: '', respBillDate: new Date().toISOString().split('T')[0],
        respDueDate: '', respBillPeriod: '', approvalRefNumber: null,
        agentId, initiatingChannel: fetchedBillData.initiatingChannel,
        customerConvenienceFees: fetchedBillData.customerConvenienceFees, ...user
      });
      return res.internalServerError({ message: 'Error processing payment: ' + error.message });
    }
  } catch (error) {
    console.error('BBPS payBill error:', error);
    return res.internalServerError({ message: error.message });
  }
};



const fetchBill = async (req, res) => {
  let payload;
  let initChannel = '';

  try {
    const {
      customerInfo = {},
      operatorService,
      billerId,
      inputParams = []
    } = req.body;

    const userId = req.user.id;

    if (!billerId) {
      return res.failure({ message: 'Required parameters missing' });
    }

    const existingUser = await dbService.findOne(
      model.user,
      { id: userId },
      {
        attributes: ['aadharDetails', 'panDetails', 'bbpsAgentId']
      }
    );

    if (!existingUser) {
      return res.failure({ message: 'User is not found' });
    }

    if (!existingUser.bbpsAgentId) {
      return res.failure({ message: 'Agent ID not defined' });
    }

    const operatorCategories = await dbService.findOne(
      model.bbpsOperatorCategory,
      { name: operatorService },
      {
        attributes: ['custConvFee']
      }
    );

    const operatorChannel = await dbService.findOne(
      model.bbpsOperator,
      { billerId: billerId },
      {
        attributes: ['id', 'initChannel']
      }
    );

    if (!operatorChannel?.initChannel) {
      return res.failure({ message: 'Operator channel not found' });
    }

    initChannel = operatorChannel?.initChannel || '';

    const agentDeviceInfo = {
      initChannel: initChannel,
      ip: agentIp,
      mac: agentMac
    };

    const { customerMobile } = customerInfo;

    // Extract Aadhaar number from nested object
    let aadharNumber = '';
    if (existingUser.aadharDetails) {
      if (typeof existingUser.aadharDetails === 'string') {
        aadharNumber = existingUser.aadharDetails;
      } else if (existingUser.aadharDetails.aadhaarNumber) {
        aadharNumber = existingUser.aadharDetails.aadhaarNumber;
      }
    }

    // Extract PAN number from nested object
    let panNumber = '';
    if (existingUser.panDetails) {
      if (typeof existingUser.panDetails === 'string') {
        panNumber = existingUser.panDetails;
      } else if (existingUser.panDetails.data?.pan_number) {
        panNumber = existingUser.panDetails.data.pan_number;
      } else if (existingUser.panDetails.pan_number) {
        panNumber = existingUser.panDetails.pan_number;
      }
    }

    const finalCustomerInfo = {
      customerMobile: customerMobile,
      customerEmail: existingUser?.email,
      customerAdhaar: aadharNumber,
      customerPan: panNumber
    };

    // Format inputParams to ensure correct structure
    let formattedInputParams;
    if (inputParams && typeof inputParams === 'object') {
      if (inputParams.input && Array.isArray(inputParams.input)) {
        // Already in correct format: { input: [...] }
        formattedInputParams = inputParams;
      } else if (Array.isArray(inputParams)) {
        // If it's an array, wrap it in input property
        formattedInputParams = { input: inputParams };
      } else {
        // If it's an object without input property, try to extract or default
        formattedInputParams = { input: inputParams.input || [] };
      }
    } else {
      // Default to empty input array
      formattedInputParams = { input: [] };
    }

    let jsonData;
    if (operatorService === 'DTH') {
      jsonData = {
        agentId: existingUser.bbpsAgentId,
        billerId,
        inputParams: formattedInputParams
      };
    } else {
      jsonData = {
        agentId: existingUser.bbpsAgentId,
        agentDeviceInfo: {
          initChannel: initChannel,
          ip: agentIp,
          mac: agentMac
        },
        REMITTER_NAME: 'GMAXPAY',
        customerInfo: finalCustomerInfo,
        billerId,
        inputParams: formattedInputParams
      };
    }

    console.log('BBPS fetchBill payload:', JSON.stringify(jsonData, null, 2));

    const { data: parsedResponse, requestId } = await bbpsService.fetchBillRequest(jsonData);
    payload = { requestId }; // Keep payload for error handling

    console.log('reposeData', parsedResponse);

    if (parsedResponse.responseCode !== '000') {
      let errorMessage = 'Unable to fetch biller info. Please try again later.';

      if (
        parsedResponse.errorInfo &&
        parsedResponse.errorInfo.error &&
        Array.isArray(parsedResponse.errorInfo.error)
      ) {
        const firstError = parsedResponse.errorInfo.error[0];
        if (firstError && firstError.errorMessage) {
          errorMessage = firstError.errorMessage;
        }

        parsedResponse.errorInfo.error.forEach((errorItem, index) => {
          console.error(
            `Error ${index + 1}: Code: ${errorItem.errorCode}, Message: ${errorItem.errorMessage}`
          );
        });
      }

      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + 24);

      await model.billFetchData.create({
        fetchRefId: requestId,
        billerId: billerId,
        refId: req.user.id,
        customerInfo: JSON.stringify(finalCustomerInfo),
        agentId: existingUser.bbpsAgentId,
        billerAdhoc: req.body.billerAdhoc || false,
        operatorService: req.body.operatorService,
        agentDeviceInfo: JSON.stringify(agentDeviceInfo),
        inputParams: JSON.stringify(inputParams),
        billerDetails: JSON.stringify({}),
        additionalInfo: JSON.stringify({}),
        responseData: JSON.stringify(parsedResponse),
        expiresAt: expiryDate,
        initiatingChannel: agentDeviceInfo?.initChannel,
        customerConvenienceFees: operatorCategories?.custConvFee,
        status: 'Failed'
      });

      return res.failure({
        message: errorMessage,
        data: parsedResponse,
        requestId: requestId
      });
    }

    const convertedResponse = { ...parsedResponse };
    let formattedAmountInfo = {};

    if (convertedResponse.billerResponse?.billAmount) {
      const billAmountInPaise = parseInt(
        convertedResponse.billerResponse.billAmount
      );
      const billAmountInRupees = billAmountInPaise / 100;

      convertedResponse.billerResponse.billAmount =
        billAmountInRupees.toFixed(2);

      formattedAmountInfo = {
        billAmountInRupees: parseFloat(billAmountInRupees.toFixed(2)),
        billAmountInPaise: billAmountInPaise,
        currency: 'INR'
      };
    }

    const formattedBillDetails = convertedResponse.billerResponse || {};

    const formattedResponse = {
      responseCode: convertedResponse.responseCode,
      requestId: requestId,
      agentInitChannel: agentDeviceInfo.initChannel,
      inputParams: convertedResponse.inputParams || {},
      billDetails: formattedBillDetails,
      amountInfo: formattedAmountInfo,
      additionalInfo: convertedResponse.additionalInfo || {}
    };

    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + 24);

    await model.billFetchData.create({
      fetchRefId: requestId,
      billerId: billerId,
      refId: req.user.id,
      customerInfo: JSON.stringify(finalCustomerInfo),
      agentId: existingUser?.bbpsAgentId,
      billerAdhoc: req.body.billerAdhoc,
      operatorService: req.body.operatorService,
      agentDeviceInfo: JSON.stringify(agentDeviceInfo),
      inputParams: JSON.stringify(inputParams),
      billerDetails: JSON.stringify(formattedBillDetails),
      additionalInfo: JSON.stringify(formattedResponse.additionalInfo),
      responseData: JSON.stringify(formattedResponse),
      expiresAt: expiryDate,
      initiatingChannel: agentDeviceInfo?.initChannel,
      customerConvenienceFees: operatorCategories?.custConvFee,
      status: 'Pending'
    });

    return res.success({
      message: 'Bill fetched successfully',
      data: formattedResponse
    });
  } catch (error) {
    console.error('BBPS fetchBill error:', error);

    try {
      if (payload && payload.requestId) {
        await model.billFetchData.create({
          fetchRefId: payload.requestId,
          billerId: req.body.billerId,
          refId: req.user.id,
          operatorService: req.body.operatorService,
          customerInfo: JSON.stringify({}),
          inputParams: JSON.stringify(req.body.inputParams || []),
          responseData: JSON.stringify({ error: error.message }),
          initiatingChannel: initChannel,
          status: 'Failed'
        });
        return res.internalServerError({
          message: error.message,
          requestId: payload.requestId
        });
      }
    } catch (dbError) {
      console.error('Failed to log error to database:', dbError);
    }
    return res.internalServerError({ message: error.message });
  }
};

const getBillerInfo = async (req, res) => {
  try {
    const { billerId } = req.body;
    const userId = req.user.id;
    if (!billerId) {
      return res.failure({ message: 'billerId is required' });
    }

    const existingUser = await dbService.findOne(
      model.user,
      { id: userId },
      {
        attributes: ['aadharDetails', 'panDetails', 'bbpsAgentId']
      }
    );

    if (!existingUser) {
      return res.failure({ message: 'User is not found' });
    }

    if (!existingUser.bbpsAgentId) {
      return res.failure({ message: 'Agent ID not defined' });
    }

    try {
      const existingBillerInfo = await dbService.findOne(
        model.bbpsBillerInfo,
        { billerId: billerId },
        { attributes: ['response', 'responseCode', 'requestId'] }
      );

      if (existingBillerInfo && existingBillerInfo.responseCode === '000') {
        return res.success({
          message: 'Biller info fetched successfully from database',
          data: existingBillerInfo.response || existingBillerInfo,
          requestId: existingBillerInfo.requestId
        });
      }
    } catch (err) {
      console.error('Database query error:', err);
    }

    const { data: parsedResponse, requestId } = await bbpsService.getBillerInfo(billerId);

    if (parsedResponse.responseCode !== '000') {
      const errorMessage =
        parsedResponse.errorInfo?.[0]?.error?.errorMessage ||
        'Unable to fetch biller info. Please try again later.';
      if (parsedResponse.errorInfo && parsedResponse.errorInfo.length > 0) {
        parsedResponse.errorInfo.forEach((errorItem, index) => {
          const error = errorItem.error;
          console.error(
            `Error ${index + 1}: Code: ${error.errorCode}, Message: ${error.errorMessage}`
          );
        });
      }
      return res.failure({
        message: errorMessage,
        data: parsedResponse,
        requestId: requestId
      });
    }

    try {
      await model.bbpsBillerInfo.upsert({
        billerId: billerId,
        requestId: requestId,
        response: parsedResponse,
        responseCode: parsedResponse.responseCode || '000',
        updatedAt: new Date()
      });
    } catch (dbSaveError) {
      console.error('Error saving to database:', dbSaveError);
    }

    return res.success({
      message: 'Biller info fetched successfully',
      data: parsedResponse,
      requestId: requestId
    });
  } catch (error) {
    console.error('BBPS getBillerInfo error:', error);
    return res.internalServerError({
      message: error.message || 'Internal server error'
    });
  }
};

const getBillerIds = async (req, res) => {
  try {
    let dataToFind = req.body;
    let options = {};
    let query = {};

    // Get operatorService from query or body (for backward compatibility)
    const operatorService = dataToFind?.query?.operatorService || dataToFind?.operatorService;
    if (!operatorService) {
      return res.failure({ message: 'operatorService is required in query' });
    }

    // Find operator category - also check if it's not deleted
    const operatorCategories = await dbService.findOne(
      model.bbpsOperatorCategory,
      { name: operatorService, isDeleted: false }
    );
    if (!operatorCategories) {
      // Return success with empty array when category not found
      const defaultPage = dataToFind?.options?.page || 1;
      const defaultPaginate = dataToFind?.options?.paginate || 25;
      return res.status(200).send({
        status: 'SUCCESS',
        message: 'Biller IDs fetched successfully',
        data: [],
        total: 0,
        paginator: {
          itemCount: 0,
          perPage: defaultPaginate,
          pageCount: 0,
          currentPage: defaultPage
        }
      });
    }

    // Build base query with categoryId and isDeleted filter
    query = {
      categoryId: operatorCategories.id,
      isDeleted: false
    };

    // Merge with query from body
    if (dataToFind && dataToFind.query) {
      // Remove operatorService from query to avoid conflicts
      const { operatorService: _, ...restQuery } = dataToFind.query;
      query = {
        ...query,
        ...restQuery
      };
    }

    // Handle options
    if (dataToFind && dataToFind.options !== undefined) {
      options = dataToFind.options;
    }

    // Handle customSearch
    if (dataToFind && dataToFind.customSearch) {
      const keys = Object.keys(dataToFind.customSearch);
      const orConditions = [];

      keys.forEach((key) => {
        if (typeof dataToFind.customSearch[key] === 'number') {
          orConditions.push(
            sequelize.where(sequelize.cast(sequelize.col(key), 'varchar'), {
              [sequelize.Op.iLike]: `%${dataToFind.customSearch[key]}%`
            })
          );
        } else {
          orConditions.push({
            [key]: {
              [sequelize.Op.iLike]: `%${dataToFind.customSearch[key]}%`
            }
          });
        }
      });

      if (orConditions.length > 0) {
        query = {
          ...query,
          [sequelize.Op.or]: orConditions
        };
      }
    }

    // Set default attributes if not specified in options
    if (!options.attributes) {
      options.attributes = ['id', 'name', 'billerId'];
    }

    // Use paginate for pagination support
    const billerIds = await dbService.paginate(
      model.bbpsOperator,
      query,
      options
    );

    // Return empty array if no results found (instead of error)
    if (!billerIds || !billerIds.data || billerIds.data.length === 0) {
      return res.status(200).send({
        status: 'SUCCESS',
        message: 'Biller IDs fetched successfully',
        data: [],
        total: 0,
        paginator: {
          itemCount: 0,
          perPage: options.paginate || 25,
          pageCount: 0,
          currentPage: options.page || 1
        }
      });
    }

    const billerIdsData = billerIds.data.map((biller) => ({
      id: biller.id,
      name: biller.name,
      billerId: biller.billerId
    }));

    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Biller IDs fetched successfully',
      data: billerIdsData,
      total: billerIds.total,
      paginator: billerIds.paginator
    });
  } catch (error) {
    console.error('BBPS getBillerId error:', error);
    return res.internalServerError({
      message: error.message || 'Internal server error'
    });
  }
}

const getAllCategories = async (req, res) => {
  try {
    const categories = await dbService.findAll(model.bbpsOperatorCategory, { isActive: true, isDeleted: false }, { attributes: ['id', 'name'] });
    return res.success({
      message: 'Categories fetched successfully',
      data: categories
    });
  } catch (error) {
    console.error('BBPS getCategories error:', error);
    return res.internalServerError({
      message: error.message || 'Internal server error'
    });
  }
}

const getTransactionStatus = async (req, res) => {
  try {
    const { trackingType, trackingValue, fromDate, toDate } = req.body;

    if (!trackingType || !trackingValue) {
      return res.failure({
        message: 'trackingType and trackingValue are required'
      });
    }
    let jsonData = {
      trackingType: trackingType,
      trackingValue: trackingValue
    };

    if (trackingType === 'MOBILE_NO' && fromDate && toDate) {
      jsonData.fromDate = fromDate;
      jsonData.toDate = toDate;
    }

    const payload = bbpsService.buildSecurePayload({
      jsonData
    });

    const response = await axios.post(
      `${BBPS_URL}/transactionStatus/fetchInfo/json?accessCode=${payload.access_code}&requestId=${payload.requestId}&ver=${payload.version}&instituteId=${payload.bbpsInstituteId}`,
      payload.enc_request,
      {
        headers: {
          'Content-Type': 'text/plain'
        }
      }
    );

    const decryptedResponse = decrypt(response.data);

    let parsedResponse;
    try {
      if (typeof decryptedResponse === 'string') {
        parsedResponse = JSON.parse(decryptedResponse);
      } else {
        parsedResponse = decryptedResponse;
      }

      if (typeof parsedResponse === 'string') {
        parsedResponse = JSON.parse(parsedResponse);
      }
    } catch (parseError) {
      console.error('Error parsing response:', parseError);
      throw new Error('Invalid response format');
    }

    return res.success({
      message: 'Transaction status fetched successfully',
      data: parsedResponse
    });
  } catch (error) {
    console.error('BBPS getTransactionStatus error:', error);
    return res.internalServerError({ message: error.message });
  }
};

const registerComplaint = async (req, res) => {
  try {
    const {
      billerId,
      agentId,
      participationType,
      complaintType,
      complainDesc,
      servReason,
      txnRefId,
      complaintDisposition
    } = req.body;

    if (!agentId || !complaintType || !complainDesc || !txnRefId) {
      return res.failure({
        message: 'Required fields are missing'
      });
    }

    const jsonData = {
      billerId,
      agentId,
      participationType,
      complaintType,
      complainDesc,
      servReason,
      txnRefId,
      complaintDisposition
    };

    const payload = bbpsService.buildSecurePayloadComplaint({
      jsonData
    });

    const response = await axios.post(
      `${BBPS_URL}/extComplaints/register/json`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const result = response.data;

    if (result.complaintResponseCode === '000') {
      return res.success({
        message: 'Complaint registered successfully',
        data: result
      });
    } else {
      return res.failure({
        message:
          result.complaintResponseReason || 'Complaint registration failed',
        data: result
      });
    }
  } catch (error) {
    console.error('BBPS registerComplaint error:', error);
    return res.internalServerError({ message: error.message });
  }
};

const trackComplaint = async (req, res) => {
  try {
    const { complaintType, complaintId } = req.body;

    if (!complaintType || !complaintId) {
      return res.failure({
        message: 'complaintType and complaintId are required'
      });
    }

    const jsonData = {
      complaintType,
      complaintId
    };

    const payload = bbpsService.buildSecurePayload({
      jsonData,
      command: 'trackComplaint'
    });

    const response = await axios.post(
      `${BBPS_URL}/extComplaints/track/json`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const result = response.data;

    if (result.complaintResponseCode === '000') {
      return res.success({
        message: 'Complaint tracked successfully',
        data: result
      });
    } else {
      return res.failure({
        message: result.complaintResponseReason || 'Failed to track complaint',
        data: result
      });
    }
  } catch (error) {
    console.error('BBPS trackComplaint error:', error);
    return res.internalServerError({ message: error.message });
  }
};

const validateBill = async (req, res) => {
  try {
    let { billValidationData } = req.body;

    if (!billValidationData) {
      return res.failure({ message: 'billValidationData is required' });
    }

    const formattedData = {
      agentId: billValidationData.agentId,
      agentDeviceInfo: {
        ip: billValidationData.ip,
        initChannel: billValidationData.initChannel,
        mac: billValidationData.mac
      },
      billerId: billValidationData.billerId,
      inputParams: {
        input: Array.isArray(billValidationData.inputParams?.input)
          ? billValidationData.inputParams.input
          : []
      }
    };

    const payload = bbpsService.buildSecurePayload({
      jsonData: formattedData
    });

    const response = await axios.post(
      `${BBPS_URL}/billpay/extBillValCntrl/billValidationRequest/json?accessCode=${payload.access_code}&requestId=${payload.requestId}&ver=${payload.version}&instituteId=${payload.bbpsInstituteId}&encRequest=${payload.enc_request}`,
      {
        headers: {
          'Content-Type': 'text/plain'
        }
      }
    );

    return res.success({
      message: 'Bill validation successful',
      data: decrypt(response.data)
    });
  } catch (error) {
    console.error('BBPS validateBill error:', error);
    return res.internalServerError({ message: error.message });
  }
};

const pullPlan = async (req, res) => {
  try {
    const { billerId } = req.body;

    if (!billerId) {
      return res.failure({ message: 'billerId is required in body' });
    }

    const jsonData = {
      billerId: [billerId]
    };

    const payload = bbpsService.buildSecurePayload({
      jsonData
    });

    const url = `${BBPS_URL}/billpay/extPlanMDM/planMdmRequest/json?accessCode=${payload.access_code}&requestId=${payload.requestId}&ver=${payload.version}&instituteId=${payload.bbpsInstituteId}&encRequest=${payload.enc_request}`;
    const response = await axios.post(url, {
      headers: { 'Content-Type': 'text/plain' }
    });

    return res.success({
      message: 'Plan pulled successfully',
      data: response.data
    });
  } catch (error) {
    console.error('BBPS pullPlan error:', error);
    return res.internalServerError({ message: error.message });
  }
};

const bbpsReportHistory = async (req, res) => {
  try {
    if (!req.user.companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    const dataToFind = req.body || {};
    let options = {};
    let query = {
      transactionType: 'BBPS',
      refId: req.user.id,
      companyId: req.user.companyId
    };

    if (dataToFind.query) {
      Object.keys(dataToFind.query).forEach(key => {
        if (key !== 'refId' && key !== 'companyId' && key !== 'transactionType') {
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
              [sequelize.Op.iLike]: `%${searchValue}%`
            }
          });
        }
      }

      if (customSearch.mobileNumber) {
        const searchValue = String(customSearch.mobileNumber).trim();
        if (searchValue) {
          searchConditions.push({
            mobileNumber: {
              [sequelize.Op.iLike]: `%${searchValue}%`
            }
          });
        }
      }

      if (searchConditions.length > 0) {
        query = {
          ...query,
          [sequelize.Op.and]: [
            { [sequelize.Op.or]: searchConditions }
          ]
        };
      }
    }

    options.include = [
      {
        model: model.user,
        as: 'user',
        attributes: ['id', 'name', 'userId', 'mobileNo'],
        required: false
      }
    ];

    const result = await dbService.paginate(model.billPaymentHistory, query, options);

    if (!result || !result.data || result.data.length === 0) {
      return res.status(200).send({
        status: 'SUCCESS',
        message: 'No payment history found',
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
      message: 'Your request is successfully executed.',
      data: result.data,
      total: result.total || 0,
      paginator: result.paginator
    });
  } catch (error) {
    console.error('BBPS reportHistory error:', error);
    return res.internalServerError({ message: error.message });
  }
};

const getRetailerAllTransaction = async (req, res) => {
  try {
    const id = req.user.id;

    if (!id) {
      return res.failure({ message: 'Invalid User' });
    }

    const transactions = await dbService.findAll(model.billPaymentHistory, {
      refId: id,
      transactionType: 'BBPS'
    });

    return res.success({
      message: 'Transactions fetched successfully',
      data: transactions
    });
  } catch (error) {
    console.error('BBPS getRetailerAllTransaction error:', error);
    return res.internalServerError({ message: error.message });
  }
};

const checkBalance = async (req, res) => {
  try {
    const today = new Date();
    const todayFormatted = today.toISOString().split('T')[0];

    const jsonData = {
      fromDate: todayFormatted,
      toDate: todayFormatted,
      transType: '',
      agents: [],
      transactionId: '',
      requestId: ''
    };
    console.log('checkBalance jsonData:', JSON.stringify(jsonData, null, 2));

    const payload = bbpsService.buildSecurePayload({ jsonData });

    const response = await axios.post(
      `${BBPS_URL}/billpay/enquireDeposit/fetchDetails/json?accessCode=${payload.access_code}&requestId=${payload.requestId}&ver=${payload.version}&instituteId=${payload.bbpsInstituteId}&encRequest=${payload.enc_request}`,
      {
        headers: { 'Content-Type': 'text/plain' }
      }
    );

    console.log('checkBalance response:', response.data);
    let parsedResponse;
    if (typeof response.data === 'object' && response.data !== null) {
      parsedResponse = response.data;
    } else if (typeof response.data === 'string') {
      try {
        parsedResponse = JSON.parse(response.data);
      } catch (jsonParseError) {
        try {
          const decryptedResponse = decrypt(response.data);
          parsedResponse = JSON.parse(decryptedResponse);
          console.log('Decrypted response:', parsedResponse);
        } catch (decryptError) {
          console.error('Decryption error:', decryptError);
          throw new Error(
            `Failed to process response: ${decryptError.message}`
          );
        }
      }
    } else {
      throw new Error(`Unexpected response data type: ${typeof response.data}`);
    }

    if (parsedResponse.responseCode !== '000') {
      const errorMessage =
        parsedResponse.errorInfo?.[0]?.error?.errorMessage ||
        'Unable to fetch biller info. Please try again later.';
      if (parsedResponse.errorInfo && parsedResponse.errorInfo.length > 0) {
        parsedResponse.errorInfo.forEach((errorItem, index) => {
          const error = errorItem.error;
          console.error(
            `Error ${index + 1}: Code: ${error.errorCode}, Message: ${error.errorMessage}`
          );
        });
      }
      return res.failure({
        message: errorMessage,
        data: parsedResponse,
        requestId: payload.requestId
      });
    }

    return res.success({
      message: 'Balance fetched successfully',
      data: parsedResponse
    });
  } catch (error) {
    console.error('BBPS checkBalance error:', error);
    return res.internalServerError({ message: error.message });
  }
};

const recentHistory = async (req, res) => {
  try {
    if (!req.user.companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    const dataToFind = req.body || {};
    let options = {};
    let query = {
      refId: req.user.id,
      companyId: req.user.companyId,
      transactionType: 'BBPS'
    };

    if (dataToFind.query) {
      Object.keys(dataToFind.query).forEach(key => {
        if (key !== 'refId' && key !== 'companyId' && key !== 'transactionType') {
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

    const result = await dbService.paginate(model.billPaymentHistory, query, options);

    if (!result || !result.data || result.data.length === 0) {
      return res.status(200).send({
        status: 'SUCCESS',
        message: 'No transactions found',
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
      return {
        operator: transactionData.operator || null,
        createdAt: transactionData.createdAt || null,
        paymentStatus: transactionData.paymentStatus || null,
        transactionId: transactionData.transactionId || null
      };
    });

    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Transactions fetched successfully',
      data: formattedData,
      total: result.total || 0,
      paginator: result.paginator
    });
  } catch (error) {
    console.error('BBPS recentHistory error:', error);
    return res.internalServerError({ message: error.message });
  }
}

module.exports = {
  getBillerInfo,
  fetchBill,
  getTransactionStatus,
  registerComplaint,
  trackComplaint,
  payBill,
  validateBill,
  pullPlan,
  checkBalance,
  bbpsReportHistory,
  getRetailerAllTransaction,
  getBillerIds,
  getAllCategories,
  recentHistory
};
