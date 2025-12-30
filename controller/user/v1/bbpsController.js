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
const agentID = process.env.BBPS_AGENT_ID;
const calculateCCF1 = (billAmount, flatFee, percentFee) => {
  const ccf1Base = (billAmount * percentFee) / 100 + flatFee;
  const gstAmount = (ccf1Base * 18) / 100;
  const totalCCF1 = ccf1Base + gstAmount;
  return Math.floor(totalCCF1);
};

const payBill = async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.companyId;
    const { fetchRefId, secureKey, walletType } = req.body;

    // Validate walletType
    const validWalletTypes = ['runpaisa', 'mobikwik'];
    if (!validWalletTypes.includes(walletType?.toLowerCase())) {
      return res.failure({
        message: `Invalid walletType. Must be one of: ${validWalletTypes.join(', ')}`
      });
    }

    // Map frontend walletType to database expected values
    const getDbWalletType = (walletType) => {
      const typeMapping = {
        runpaisa: 'Runpaisa',
        mobikwik: 'Mobikwik'
      };
      return typeMapping[walletType.toLowerCase()] || 'Runpaisa';
    };

    const dbWalletType = getDbWalletType(walletType);

    const convertRupeesToPaisa = (amount) =>
      Math.round(parseFloat(amount) * 100).toString();
    const convertPaisaToRupees = (paisa) =>
      (parseFloat(paisa) / 100).toFixed(2);
    const user = await dbService.findOne(
      model.user,
      { id: userId },
      {
        attributes: [
          'userRole',
          'addedBy',
          'name',
          'email',
          'secureKey',
          'mobileNo',
          'reportingTo'
        ]
      }
    );
    if (!user) return res.failure({ message: 'User not found' });
    if (!fetchRefId)
      return res.failure({ message: 'Required payment parameters missing' });
    if (!secureKey) return res.failure({ message: 'Secure key is required' });

    const fetchedBillData = await dbService.findOne(model.billFetchData, {
      fetchRefId: req.body.fetchRefId,
      status: 'Pending',
      expiresAt: { [sequelize.Op.gt]: new Date() }
    });

    if (!fetchedBillData)
      return res.failure({
        message: 'Bill data not found or expired. Please fetch the bill again.'
      });
    if (!user.secureKey || user.secureKey.trim() === '')
      return res.failure({ message: 'User does not have a secure key' });
    let isPinMatched = false;
    try {
      isPinMatched = await bcrypt.compare(secureKey, user.secureKey);
    } catch (bcryptError) {
      return res.failure({ message: 'Error validating secure key' });
    }
    if (!isPinMatched) return res.failure({ message: 'Invalid Pin' });
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
      responseData?.amountInfo?.amount ||
        responseData?.billDetails?.billAmount ||
        '0'
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
        billDate:
          responseData?.billDetails?.billDate ||
          new Date().toISOString().split('T')[0],
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
          'id',
          'operatorName',
          'operatorType',
          'operatorCode',
          'minValue',
          'maxValue'
        ]
      }
    );
    if (!foundOperator) return res.failure({ message: 'Invalid Operator!' });

    const foundCategory = await dbService.findOne(
      model.bbpsOperatorCategory,
      { name: operatorService },
      {
        attributes: [
          'custConvFee',
          'flatFee',
          'percentFee',
          'gstRate',
          'isCCF1Category'
        ]
      }
    );
    if (!foundCategory) return res.failure({ message: 'Invalid Category!' });

    let ccf1Amount = 0;
    let needsCCF1 = false;
    if (foundCategory.isCCF1Category) {
      needsCCF1 = true;
    }
    if (needsCCF1) {
      const flatFee =
        (foundCategory.flatFee ? foundCategory.flatFee : 0) * 100 || 100;
      const percentFee = foundCategory.percentFee || 1.2;
      ccf1Amount = calculateCCF1(
        parseInt(convertRupeesToPaisa(billAmount)),
        flatFee,
        percentFee
      );
      console.log(
        `CCF1 calculated for category: ${operatorService}, amount: ${ccf1Amount} paisa`
      );
    }
    const channelPaymentInfo = await dbService.findOne(
      model.bbpsPaymentInfo,
      { initiatingChannel: agentDeviceInfo?.initChannel },
      {
        attributes: ['paymentMethod', 'paymentInfo']
      }
    );

    if (!channelPaymentInfo) {
      return res.failure({
        message: 'Payment mode is required. Please contact the administrator.'
      });
    }

    let channelPaymentMethod = channelPaymentInfo.paymentMethod || {};
    let channelPaymentInfoData = channelPaymentInfo.paymentInfo || {};

    if (typeof channelPaymentMethod === 'string') {
      try {
        channelPaymentMethod = JSON.parse(channelPaymentMethod);
      } catch (error) {
        console.error('Error parsing paymentMethod:', error);
        channelPaymentMethod = {};
      }
    }

    if (typeof channelPaymentInfoData === 'string') {
      try {
        channelPaymentInfoData = JSON.parse(channelPaymentInfoData);
      } catch (error) {
        console.error('Error parsing paymentInfo:', error);
        channelPaymentInfoData = {};
      }
    }
    const jsonData = {
      agentId,
      billerAdhoc,
      agentDeviceInfo: {
        ip: agentDeviceInfo?.agentIp || agentDeviceInfo?.ip || ' ',
        mac: agentDeviceInfo?.agentMac || agentDeviceInfo?.mac || ' ',
        initChannel:
          agentDeviceInfo?.agentInitChannel ||
          agentDeviceInfo?.initChannel ||
          ' '
      },
      customerInfo: {
        customerMobile: customerInfo?.customerMobile || '',
        customerEmail: customerInfo?.customerEmail || '',
        customerAdhaar: customerInfo?.customerAdhaar || '',
        customerPan: customerInfo?.customerPan || '',
        REMITTER_NAME: 'GMAXPAY'
      },
      billerId,
      inputParams,
      billerResponse: billerResponseData,
      paymentRefId: fetchRefId,
      amountInfo: {
        amount: convertRupeesToPaisa(
          responseData?.amountInfo?.amount?.toString() ||
            responseData?.billDetails?.billAmount ||
            '0'
        ),
        currency: process.env.BBPS_CURRENCY_CODE || 356,
        custConvFee: foundCategory.custConvFee || 0,
        ...(needsCCF1 && { CCF1: ccf1Amount }),
        amountTags: process.env.BBPS_AMOUNT_TAGS
          ? JSON.parse(process.env.BBPS_AMOUNT_TAGS)
          : []
      },
      paymentMethod: channelPaymentMethod,
      paymentInfo: channelPaymentInfoData
    };

    console.log('jsonData:', JSON.stringify(jsonData, null, 2));

    if (
      additionalInfo &&
      additionalInfo.info &&
      additionalInfo.info.length > 0
    ) {
      jsonData.additionalInfo = additionalInfo;
    } else if (
      responseData?.additionalInfo?.info &&
      responseData.additionalInfo.info.length > 0
    ) {
      jsonData.additionalInfo = responseData.additionalInfo;
    }

    if (needsCCF1) {
      const ccf1InRupees = convertPaisaToRupees(ccf1Amount);
      const ccf1Info = {
        infoName: 'CCF1 Fee (Rs.) + GST',
        infoValue: ccf1InRupees
      };
      if (jsonData.additionalInfo && jsonData.additionalInfo.info) {
        jsonData.additionalInfo.info.push(ccf1Info);
      } else {
        jsonData.additionalInfo = {
          info: [ccf1Info]
        };
      }
    }
    const [foundUserWallet, bbpsOperatorName] = await Promise.all([
      dbService.findOne(model.wallet, { refId: userId }),
      dbService.findOne(
        model.bbpsOperator,
        { billerId: billerId },
        { attributes: ['id', 'name'] }
      )
    ]);

    if (!foundUserWallet) return res.failure({ message: 'Wallet not found!' });

    // Get wallet balance based on walletType
    const getWalletBalance = (wallet, type) => {
      switch (type.toLowerCase()) {
        case 'runpaisa':
          return wallet.runpaisa;
        case 'mobikwik':
          return wallet.mobikwik;
        default:
          return wallet.runpaisa;
      }
    };

    const currentWalletBalance = getWalletBalance(foundUserWallet, walletType);

    if (foundOperator.minValue && foundOperator.maxValue) {
      if (
        foundOperator.minValue > billAmount ||
        foundOperator.maxValue < billAmount
      ) {
        return res.failure({
          message: `Amount should be between ${foundOperator.minValue} - ${foundOperator.maxValue}`
        });
      }
    }
    // Removed slab and commission logic - simple transaction only

    let ccf1Rupees = needsCCF1
      ? parseFloat(convertPaisaToRupees(ccf1Amount))
      : 0;
    let custConvFeeRupees =
      foundCategory.custConvFee && foundCategory.custConvFee != 0
        ? parseFloat(convertPaisaToRupees(foundCategory.custConvFee))
        : 0;

    // Simple transaction - no commission/slab logic
    let debit = parseFloat(billAmount) + ccf1Rupees + custConvFeeRupees;
    let balance = currentWalletBalance - debit;
    let commission = 0;
    let surcharge = 0;

    if (currentWalletBalance < debit)
      return res.failure({
        message: `Insufficient ${walletType} wallet balance!`
      });

    const transactionID = generateTransactionID();
    const payload = bbpsService.buildSecurePayload({ jsonData });

    // Simple transaction - no commission tracking

    let parsedResponse = null;

    try {
      const response = await axios.post(
        `${BBPS_URL}/billpay/extBillPayCntrl/billPayRequest/json?accessCode=${payload.access_code}&requestId=${fetchRefId}&ver=${payload.version}&instituteId=${payload.bbpsInstituteId}&encRequest=${payload.enc_request}`,
        {
          headers: { 'Content-Type': 'text/plain' }
        }
      );

      const decryptedResponse = decrypt(response.data);
      console.log('reposeData', decryptedResponse);
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

      // Convert respAmount to rupees if present
      if (parsedResponse?.respAmount) {
        const respAmountInRupees = convertPaisaToRupees(
          parsedResponse.respAmount
        );
        parsedResponse.respAmount = respAmountInRupees;
      }

      // If custConvFee is present in response, treat as surcharge (convert to rupees)
      let apiCustConvFeeRupees = 0;
      if (parsedResponse?.custConvFee && !isNaN(parsedResponse.custConvFee)) {
        apiCustConvFeeRupees = parseFloat(
          convertPaisaToRupees(parsedResponse.custConvFee)
        );
      }

      if (parsedResponse.responseCode !== '000') {
        let errorMessage = 'Unable to process payment. Please try again later.';
        if (
          parsedResponse.vErrorRootVO &&
          Array.isArray(parsedResponse.vErrorRootVO.error)
        ) {
          const firstError = parsedResponse.vErrorRootVO.error[0];
          if (firstError && firstError.errorMessage) {
            errorMessage = firstError.errorMessage;
          }
          parsedResponse.vErrorRootVO.error.forEach((errorItem, index) => {
            console.error(
              `Error ${index + 1}: Code: ${errorItem.errorCode}, Message: ${errorItem.errorMessage}`
            );
          });
        }
        const billStatus = 'Failed';
        const failedHistoryData = {
          refId: userId,
          companyId: companyId,
          operatorId: foundOperator.id,
          operator: foundOperator.operatorName,
          billNumber: responseData?.billDetails?.billNumber || billerId,
          api: 'BBPS',
          walletType: dbWalletType,
          billerName:`${bbpsOperatorName?.name || foundOperator.operatorName}`,
          amount: billAmount,
          debit: 0,
          comm: 0,
          surcharge: 0,
          opening: currentWalletBalance,
          closing: currentWalletBalance,
          credit: 0,
          mobileNumber: customerInfo?.customerMobile || '',
          cardNumber: '',
          transactionType: 'BBPS',
          transactionId: transactionID,
          paymentStatus: billStatus,
          refundStatus: 'Success',
          paymentMethod: 'Wallet',
          fetchBillId: fetchRefReqId,
          remarks: errorMessage,
          response: parsedResponse,
          addedBy: userId,
          updatedBy: userId,
          isStatusChecked: false,
          distributerSurcharge: 0,
          distributorAmount: '0.00',
          companyCommission: '0.00',
          whitelabelCommission: 0,
          adminAmount: '0.00',
          adminSurcharge: 0,
          adminComm: '0.00',
          userDetails: {
            name: user.name,
            email: user.email,
            mobileNo: user.mobileNo,
            userRole: user.userRole,
            ...customerInfo
          },
          txnRefId: '',
          respAmount: '',
          respCustomerName: customerInfo?.customerName || '',
          respBillNumber: '',
          respBillDate: new Date().toISOString().split('T')[0],
          respDueDate: '',
          respBillPeriod: '',
          approvalRefNumber: null,
          agentId: agentId,
          initiatingChannel: fetchedBillData.initiatingChannel,
          customerConvenienceFees: fetchedBillData.customerConvenienceFees,
          ...user
        };

        await dbService.createOne(model.billPaymentHistory, failedHistoryData);
        await dbService.update(
          model.billFetchData,
          { fetchRefId: fetchRefReqId },
          { status: 'Failed' }
        );

        return res.failure({
          message: errorMessage,
          data: parsedResponse,
          orderid: transactionID,
          status: billStatus
        });
      }

      const formattedResponse = {
        responseCode: parsedResponse.responseCode
      };

      const billStatus =
        formattedResponse.responseCode === '000'
          ? 'Success'
          : formattedResponse.responseCode === '204'
            ? 'Pending'
            : 'Failed';

      const respAmountInRupees =
        parsedResponse?.respAmount || billAmount.toString();

      const historyData = {
        refId: userId,
        companyId: companyId,
        operatorId: foundOperator.id,
        operator: foundOperator.operatorName,
        billNumber: responseData?.billDetails?.billNumber || billerId,
        api: 'BBPS',
        walletType: dbWalletType,
        amount: billAmount,
        debit: billStatus === 'Failed' ? 0 : debit,
        comm: 0,
        surcharge: 0,
        opening: currentWalletBalance,
        closing: billStatus === 'Failed' ? currentWalletBalance : balance,
        credit: 0,
        mobileNumber: customerInfo?.customerMobile || '',
        cardNumber: '',
        transactionType: 'BBPS',
        transactionId: transactionID,
        paymentStatus: billStatus,
        refundStatus: billStatus === 'Failed' ? 'Success' : 'Dispute',
        paymentMethod: 'Wallet',
        fetchBillId: fetchRefReqId,
        remarks: `BBPS payment for ${bbpsOperatorName?.name || foundOperator.operatorName}`,
        billerName:`${bbpsOperatorName?.name || foundOperator.operatorName}`,
        response: parsedResponse || {},
        addedBy: userId,
        updatedBy: userId,
        isStatusChecked: billStatus === 'Success',
        distributerSurcharge: 0,
        distributorAmount: '0.00',
        distributerComm: '0.00',
        companyCommission: '0.00',
        whitelabelCommission: 0,
        adminAmount: '0.00',
        adminSurcharge: 0,
        adminComm: '0.00',
        userDetails: {
          name: user.name,
          email: user.email,
          mobileNo: user.mobileNo,
          userRole: user.userRole,
          ...customerInfo
        },
        txnRefId: parsedResponse?.txnRefId?.toString() || '',
        respAmount: respAmountInRupees,
        respCustomerName:
          parsedResponse?.respCustomerName || customerInfo?.customerName || '',
        respBillNumber:
          parsedResponse?.respBillNumber ||
          responseData?.billDetails?.billNumber ||
          '',
        respBillDate:
          parsedResponse?.respBillDate ||
          responseData?.billDetails?.billDate ||
          new Date().toISOString().split('T')[0],
        respDueDate:
          parsedResponse?.respDueDate ||
          responseData?.billDetails?.dueDate ||
          '',
        respBillPeriod:
          parsedResponse?.respBillPeriod ||
          responseData?.billDetails?.billPeriod ||
          '',
        approvalRefNumber: parsedResponse?.approvalRefNumber || null,
        agentId: agentId,
        initiatingChannel: fetchedBillData.initiatingChannel,
        customerConvenienceFees: fetchedBillData.customerConvenienceFees,
        ...user
      };

      if (formattedResponse.responseCode === '000') {
        const currentDateTime = new Date().toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });

        let url = `Thank you for payment of Rs.${parseInt(billAmount)} against ${bbpsOperatorName?.name || foundOperator.operatorName}, Consumer no ${customerInfo?.customerMobile}, B-Connect Txn Ref ID ${parsedResponse.txnRefId} on ${currentDateTime} vide Wallet. Team Gmaxepay`;

        await amezesmsService.sendBbpsPaymentSucess(
          customerInfo?.customerMobile,
          url
        );

        const createdBillHistory = await dbService.createOne(
          model.billPaymentHistory,
          historyData
        );

        if (!createdBillHistory) {
          return res.failure({
            message: 'Create bill payment history failed!'
          });
        }

        // Helper function to update wallet balance
        const updateWalletBalance = (currentWallet, walletType, newBalance) => {
          const updateData = { updatedBy: userId };
          switch (walletType.toLowerCase()) {
            case 'prepaid':
              updateData.prepaid = newBalance;
              break;
            case 'runpaisa':
              updateData.runpaisa = newBalance;
              break;
            case 'mobikwik':
              updateData.mobikwik = newBalance;
              break;
            default:
              updateData.prepaid = newBalance;
          }
          return updateData;
        };

        const updates = [];

        // Update user wallet only - no commission logic
        updates.push(
          dbService.update(
            model.wallet,
            { refId: userId, companyId },
            updateWalletBalance(foundUserWallet, walletType, balance)
          )
        );

        if (updates.length > 0) {
          const results = await Promise.all(updates);
          const updateSuccess = results.every((r) => r !== null);

          if (!updateSuccess) {
            return res.failure({ message: 'Some wallet update failed!' });
          }
        }
        try {
          const walletHistoryEntries = [];

          const userWalletHistory = {
            refId: userId,
            companyId: companyId,
            walletType: dbWalletType,
            remark: `BBPS payment for ${bbpsOperatorName?.name || foundOperator.operatorName} - Bill No: ${responseData?.billDetails?.billNumber || billerId}`,
            operator: foundOperator.operatorName,
            amount: billAmount,
            comm: 0,
            surcharge: 0,
            openingAmt: currentWalletBalance,
            closingAmt: balance,
            credit: 0,
            debit: debit.toFixed(2),
            merchantTransactionId: transactionID,
            transactionId:
              parsedResponse?.txnRefId?.toString() || transactionID,
            paymentStatus: 'SUCCESS',
            addedBy: userId,
            updatedBy: userId,
            beneficiaryName: parsedResponse?.respCustomerName || '',
            CUSTOMER_NAME: customerInfo?.customerName || '',
            CUSTOMER_EMAIL: customerInfo?.customerEmail || '',
            CUSTOMER_PHONE: customerInfo?.customerMobile || '',
            refundStatus: 'Dispute',
            isStatusChecked: true,
            distributerSurcharge: 0,
            distributorAmount: 0,
            adminSurcharge: 0,
            adminAmount: 0,
            whitelabelCommission: 0,
            userDetails: {
              name: user.name,
              email: user.email,
              mobileNo: user.mobileNo,
              userRole: user.userRole,
              ...customerInfo
            }
          };
          walletHistoryEntries.push(userWalletHistory);

          const walletHistoryPromises = walletHistoryEntries.map((entry) =>
            dbService.createOne(model.walletHistory, entry)
          );

          const walletHistoryResults = await Promise.all(walletHistoryPromises);
          const walletHistorySuccess = walletHistoryResults.every(
            (result) => result !== null
          );

          if (!walletHistorySuccess) {
            console.error('Some wallet history entries failed to create');
          } else {
            console.log(
              `Successfully created ${walletHistoryResults.length} wallet history entries`
            );
          }
        } catch (walletHistoryError) {
          console.error(
            'Error creating wallet history entries:',
            walletHistoryError
          );
        }
        await dbService.update(
          model.billFetchData,
          { fetchRefId: fetchRefReqId },
          {
            status: 'Success',
            updatedBy: req.user.id
          }
        );

        console.log(
          'BBPS Pay Bill Response:',
          parsedResponse,
          'amount in rupees:',
          parsedResponse.respAmount
        );

        return res.success({
          message: 'Bill payment successful',
          data: {
            ...parsedResponse,
            status: billStatus,
            txid: parsedResponse?.txnRefId,
            utr: parsedResponse?.approvalRefNumber,
            mobile: parsedResponse?.mobile || customerInfo?.customerMobile,
            amount: parsedResponse.respAmount,
            message: parsedResponse?.responseReason || 'Payment Successful',
            orderid: transactionID,
            surcharge: (parseFloat(surcharge) + apiCustConvFeeRupees).toFixed(
              2
            ),
            apiCustConvFee: apiCustConvFeeRupees.toFixed(2),
            userRole: user.userRole
          }
        });
      } else {
        await dbService.createOne(model.billPaymentHistory, historyData);

        await dbService.update(
          model.billFetchData,
          { fetchRefId: fetchRefId },
          { status: 'Failed' }
        );

        return res.failure({
          message: parsedResponse.responseReason || 'Bill payment failed',
          data: {
            status: billStatus,
            message: parsedResponse.responseReason || 'Payment Failed',
            orderid: transactionID
          }
        });
      }
    } catch (error) {
      console.error('API or decrypt error:', error);

      const failedHistoryData = {
        refId: userId,
        companyId: companyId,
        operatorId: foundOperator.id,
        operator: foundOperator.operatorName,
        billerName:`${bbpsOperatorName?.name || foundOperator.operatorName}`,
        billNumber: responseData?.billDetails?.billNumber || billerId,
        api: 'BBPS',
        walletType: dbWalletType,
        amount: billAmount,
        debit: 0,
        comm: 0,
        surcharge: 0,
        opening: currentWalletBalance,
        closing: currentWalletBalance,
        credit: 0,
        mobileNumber: customerInfo?.customerMobile || '',
        cardNumber: '',
        transactionType: 'BBPS',
        transactionId: transactionID,
        paymentStatus: 'Failed',
        refundStatus: 'Success',
        paymentMethod: 'Wallet',
        fetchBillId: fetchRefId,
        remarks: error.message || 'Processing error',
        response: JSON.stringify({ error: error.message }),
        addedBy: userId,
        updatedBy: userId,
        isStatusChecked: false,
        distributerSurcharge: 0,
        distributorAmount: '0.00',
        companyCommission: '0.00',
        whitelabelCommission: 0,
        adminAmount: '0.00',
        adminSurcharge: 0,
        userDetails: {
          name: user.name,
          email: user.email,
          mobileNo: user.mobileNo,
          userRole: user.userRole,
          ...customerInfo
        },
        txnRefId: '',
        respAmount: '',
        respCustomerName: customerInfo?.customerName || '',
        respBillNumber: '',
        respBillDate: new Date().toISOString().split('T')[0],
        respDueDate: '',
        respBillPeriod: '',
        approvalRefNumber: null,
        agentId: agentId,
        initiatingChannel: fetchedBillData.initiatingChannel,
        customerConvenienceFees: fetchedBillData.customerConvenienceFees,
        ...user
      };

      await dbService.update(
        model.billFetchData,
        { fetchRefId: fetchRefId },
        { status: 'Failed' }
      );

      await dbService.createOne(model.billPaymentHistory, failedHistoryData);

      return res.internalServerError({
        message: 'Error processing payment: ' + error.message
      });
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

    const finalCustomerInfo = {
      customerMobile: customerMobile,
      customerEmail: existingUser.email,
      customerAdhaar: existingUser.aadharDetails,
      customerPan: existingUser.panDetails
    };

    let jsonData;
    if (operatorService === 'DTH') {
      jsonData = {
        agentId: existingUser.bbpsAgentId,
        billerId,
        inputParams
      };
    } else {
      jsonData = {
        agentId: existingUser.bbpsAgentId,
        agentDeviceInfo: {
          initChannel: initChannel,
          ip: agentIp,
          mac: agentMac
        },
        customerInfo: finalCustomerInfo,
        billerId,
        inputParams
      };
    }

    payload = bbpsService.buildSecurePayload({
      jsonData
    });

    const url = `${BBPS_URL}/billpay/extBillCntrl/billFetchRequest/json?accessCode=${payload.access_code}&requestId=${payload.requestId}&ver=${payload.version}&instituteId=${payload.bbpsInstituteId}&encRequest=${payload.enc_request}`;

    const response = await axios.post(url, {
      headers: {
        'Content-Type': 'text/plain'
      }
    });

    const decryptedResponse = decrypt(response.data);
    console.log('reposeData', decryptedResponse);
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
        fetchRefId: payload.requestId,
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
        requestId: payload.requestId
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
      requestId: payload.requestId,
      agentInitChannel: agentDeviceInfo.initChannel,
      inputParams: convertedResponse.inputParams || {},
      billDetails: formattedBillDetails,
      amountInfo: formattedAmountInfo,
      additionalInfo: convertedResponse.additionalInfo || {}
    };

    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + 24);

    await model.billFetchData.create({
      fetchRefId: payload.requestId,
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
    } catch (error) {
      console.error('Failed to log error to database:', error);
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
    let dataToFind = req.body;
    const companyId = req.companyId;
    const userId = req.user.id;

    let options = {};
    let query = { transactionType: 'BBPS' };

    const userRecord = await model.user.findOne({
      where: { id: userId, companyId }
    });

    if (!userRecord) {
      return res.recordNotFound({ message: 'User not found.' });
    }

    if (dataToFind && dataToFind.query) {
      query = {
        ...query,
        ...dataToFind.query
      };
    }

    if (companyId !== 1) {
      query = { ...query, companyId };
    }

    if (userRecord.userRole !== 1) {
      query = { ...query, refId: userId };
    }

    if (dataToFind && dataToFind.isCountOnly) {
      const foundReports = await dbService.count(
        model.billPaymentHistory,
        query
      );
      if (!foundReports) return res.recordNotFound();
      return res.success({ data: { totalRecords: foundReports } });
    }

    if (dataToFind && dataToFind.options !== undefined) {
      options = dataToFind.options;
    }

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

    const foundReports = await dbService.paginate(
      model.billPaymentHistory,
      query,
      options
    );

    if (!foundReports || foundReports.length === 0) {
      return res.recordNotFound({ message: 'No payment history found.' });
    }

    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Your request is successfully executed.',
      data: foundReports.data,
      total: foundReports.total
    });
  } catch (error) {
    console.error(error);
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
  getRetailerAllTransaction
};
