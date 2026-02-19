const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const razorpayApi = require('../../../services/razorpayApi');
const ekycHub = require('../../../services/eKycHub');
const { doubleEncrypt, decrypt } = require('../../../utils/doubleCheckUp');
const { generateTransactionID } = require('../../../utils/transactionID');
const key = Buffer.from(process.env.AES_KEY, 'hex');

const addCustomerBank = async (req, res) => {
  try {
    if (![2].includes(req.user.userRole)) {
      return res.failure({ message: 'You are not authorized to add bank details' });
    }

    const userId = req.user?.id;
    const companyId = req.user?.companyId;

    const [
      existingUser,
      reportingToUser
    ] = await Promise.all([
      dbService.findOne(model.user, {
        id: userId,
        companyId,
        isActive: true
      }),
      dbService.findOne(model.user, {
        id: 1,
        isActive: true
      })
    ]);
    const [existingUserWallet, reportingToUserWallet] = await Promise.all([
      dbService.findOne(model.wallet, { refId: userId, companyId }),
      dbService.findOne(model.wallet, { refId: reportingToUser?.id || 1 })
    ]);
    if (!existingUser) {
      return res.failure({ message: 'User not found' });
    }

    if (!existingUserWallet) {
      return res.failure({ message: 'User wallet not found' });
    }

    if (!reportingToUser) {
      return res.failure({ message: 'Super Admin not found' });
    }

    const { account_number, ifsc, isPayout, isFundTransfer } = req.body;

    if (!account_number || !ifsc) {
      return res.validationError({
        message: !account_number ? 'Account number is required' : 'IFSC is required'
      });
    }

    const existingBanks = await dbService.findAll(model.customerBank, {
      refId: userId,
      companyId,
      isActive: true
    });

    const duplicateBank = existingBanks.find(
      (bank) => bank.accountNumber === account_number && bank.ifsc === ifsc
    );

    if (duplicateBank) {
      return res.failure({
        message:
          'This bank account with the same account number and IFSC already exists in your account',
        data: {
          existingBank: {
            id: duplicateBank.id,
            bankName: duplicateBank.bankName,
            accountNumber: duplicateBank.accountNumber,
            ifsc: duplicateBank.ifsc,
            isPrimary: duplicateBank.isPrimary
          }
        }
      });
    }

    const MAX_BANKS = 5;
    if (existingBanks && existingBanks.length >= MAX_BANKS) {
      return res.failure({
        message: `You have reached the maximum limit of ${MAX_BANKS} bank accounts. Please remove one of your existing banks before adding a new one.`,
        data: {
          existingBanksCount: existingBanks.length,
          maxBanks: MAX_BANKS,
          existingBanks: existingBanks.map((bank) => ({
            id: bank.id,
            bankName: bank.bankName,
            accountNumber: bank.accountNumber,
            ifsc: bank.ifsc,
            isPrimary: bank.isPrimary
          }))
        }
      });
    }

    // --- COMMERCIALS & VALIDATION (Pre-API Call) ---

    // 1. Fetch Payout Operator (Bank Verification)
    const payoutOperator = await dbService.findOne(model.operator, {
      operatorType: 'BANK VERIFICATION',
      isActive: true
    });

    // 2. Fetch Commercial Slabs (SuperAdmin -> Company)
    const slabComm = await dbService.findOne(model.commSlab, {
      companyId: 1,
      addedBy: reportingToUser.id, // Super Admin
      operatorType: 'BANK VERIFICATION',
      roleType: 2 // User's role (Company Admin)
    });

    if (!slabComm) {
      return res.failure({ message: 'Commission/Surcharge slab not configured for Bank Verification' });
    }

    const round2 = (num) => {
      return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
    };

    const calcSlabAmount = (slab, baseAmount) => {
      if (!slab) return 0;
      const base = Number(baseAmount || 0);
      const rawComm = Number(slab.commAmt || 0);
      const amtType = (slab.amtType || 'fix').toLowerCase();
      if (amtType === 'per') {
        return round2((base * rawComm) / 100);
      }
      return round2(rawComm);
    };

    // 3. Calculate Amounts
    // Assumes fixed charge for verification, so baseAmount = 0
    const adminSurchargeAmt = calcSlabAmount(slabComm, 0);

    // Calculate SA Bank Charge (Cost) from Operator
    let saBankCharge = 0;
    if (payoutOperator) {
      // Operator charge usually fixed, but support % if needed
      saBankCharge = calcSlabAmount({ ...payoutOperator, commAmt: payoutOperator.comm, amtType: payoutOperator.amtType }, 0);
    }

    if (adminSurchargeAmt <= 0) {
      // It's possible for SA to charge 0 to Company, but usually not. Warning/Error?
      // Proceeding, but logging could be good.
    }

    // 4. Validate Company Wallet Balance
    if (!reportingToUserWallet) {
      return res.failure({ message: 'Super Admin wallet not found' });
    }

    const userOpeningBalance = parseFloat(existingUserWallet.mainWallet || 0);

    // Company pays 'adminSurchargeAmt' to Super Admin
    if (userOpeningBalance < adminSurchargeAmt) {
      return res.failure({
        message: `Insufficient wallet balance. Required: ${adminSurchargeAmt}, Available: ${userOpeningBalance}`
      });
    }

    // --- END COMMERCIALS ---


    const [cachedVerification, razorpayBankData] = await Promise.all([
      (async () => {
        const existingBank = await dbService.findOne(model.ekycHub, {
          identityNumber1: account_number,
          identityNumber2: ifsc,
          identityType: 'BANK'
        });

        if (existingBank) {
          try {
            const storedResponse = JSON.parse(existingBank.response);
            if (storedResponse && storedResponse.encrypted && storedResponse.iv && storedResponse.authTag) {
              const decryptedString = decrypt(storedResponse, key);
              if (decryptedString) {
                return JSON.parse(decryptedString);
              }
            }
            return null;
          } catch (e) {
            return null;
          }
        }
        return null;
      })(),
      razorpayApi.bankDetails(ifsc).catch(() => null)
    ]);

    let bankVerification = cachedVerification;

    if (!bankVerification || !bankVerification.status || bankVerification.status !== 'Success') {
      bankVerification = await ekycHub.bankVerification(account_number, ifsc);

      if (bankVerification && bankVerification.status === 'Success') {
        const encryptedRequest = doubleEncrypt(
          JSON.stringify({ account_number, ifsc }),
          key
        );
        const encryptedResponse = doubleEncrypt(
          JSON.stringify(bankVerification),
          key
        );

        dbService
          .createOne(model.ekycHub, {
            identityNumber1: account_number,
            identityNumber2: ifsc,
            request: JSON.stringify(encryptedRequest),
            response: JSON.stringify(encryptedResponse),
            identityType: 'BANK',
            companyId: companyId || null,
            addedBy: userId
          })
          .catch(() => { });
      }
    }

    if (!bankVerification || bankVerification.status !== 'Success') {
      return res.failure({ message: 'Bank verification failed' });
    }

    // --- WALLET EXECUTION ---

    const companyDetails = await dbService.findOne(model.company, { id: companyId });
    const transactionId = generateTransactionID(companyDetails?.companyName || 'BANK_VERIFY');
    const operatorName = 'Bank Verification';
    const remarkText = 'Bank verification charge';

    // 1. Debit Company Admin
    const userClosingBalance = parseFloat((userOpeningBalance - adminSurchargeAmt).toFixed(2));

    await dbService.update(
      model.wallet,
      { id: existingUserWallet.id },
      { mainWallet: userClosingBalance, updatedBy: userId }
    );

    const beneficiaryNameFromVerification =
      bankVerification.nameAtBank ||
      bankVerification.beneficiary_name ||
      bankVerification.beneficiaryName ||
      bankVerification['nameAtBank'] ||
      null;

    const bankNameFromVerification =
      razorpayBankData?.BANK ||
      bankVerification.bank_name ||
      bankVerification.bankName ||
      null;

    await dbService.createOne(model.walletHistory, {
      refId: userId,
      companyId,
      walletType: 'mainWallet',
      operator: operatorName,
      remark: remarkText,
      amount: adminSurchargeAmt,
      comm: 0,
      surcharge: adminSurchargeAmt,
      openingAmt: userOpeningBalance,
      closingAmt: userClosingBalance,
      credit: 0,
      debit: adminSurchargeAmt,
      transactionId,
      paymentStatus: 'SUCCESS',
      beneficiaryName: beneficiaryNameFromVerification,
      beneficiaryAccountNumber: account_number,
      beneficiaryBankName: bankNameFromVerification,
      beneficiaryIfsc: ifsc,
      paymentMode: 'WALLET',
      addedBy: userId,
      updatedBy: userId
    });

    // 2. Credit Super Admin (Income First)
    const saOpeningBalance = parseFloat(reportingToUserWallet.mainWallet || 0);
    // SA Balance increases by what Company pays
    const saMidBalance = parseFloat((saOpeningBalance + adminSurchargeAmt).toFixed(2));

    // 3. Debit Super Admin (Operator Charge)
    const saClosingBalance = parseFloat((saMidBalance - saBankCharge).toFixed(2));

    await dbService.update(
      model.wallet,
      { id: reportingToUserWallet.id },
      { mainWallet: saClosingBalance, updatedBy: reportingToUser?.id || 1 }
    );

    // SA History 1: Surcharge/Comm Income
    await dbService.createOne(model.walletHistory, {
      refId: reportingToUser?.id || 1,
      companyId: reportingToUser?.companyId || companyId,
      walletType: 'mainWallet',
      operator: operatorName,
      remark: `${remarkText} - surcharge profit`,
      amount: adminSurchargeAmt,
      comm: adminSurchargeAmt, // Treated as profit/comm
      surcharge: 0,
      openingAmt: saOpeningBalance,
      closingAmt: saMidBalance,
      credit: adminSurchargeAmt,
      debit: 0,
      transactionId,
      paymentStatus: 'SUCCESS',
      paymentMode: 'WALLET',
      addedBy: reportingToUser?.id || 1,
      updatedBy: reportingToUser?.id || 1
    });

    // SA History 2: Operator Charge (Debit) & SurRecords
    if (saBankCharge > 0) {
      await dbService.createOne(model.walletHistory, {
        refId: reportingToUser?.id || 1,
        companyId: reportingToUser?.companyId || companyId,
        walletType: 'mainWallet',
        operator: operatorName,
        remark: `${remarkText} - operator charge`,
        amount: saBankCharge,
        comm: 0,
        surcharge: 0,
        openingAmt: saMidBalance,
        closingAmt: saClosingBalance,
        credit: 0,
        debit: saBankCharge,
        transactionId,
        paymentStatus: 'SUCCESS',
        paymentMode: 'WALLET',
        addedBy: reportingToUser?.id || 1,
        updatedBy: reportingToUser?.id || 1
      });

      const pOpName = payoutOperator?.operatorName || 'Unknown';
      await dbService.createOne(model.surRecords, {
        refId: reportingToUser?.id || 1,
        companyId: 1,
        transactionId: transactionId,
        amount: saBankCharge,
        service: 'BANK VERIFICATION',
        operatorType: pOpName,
        addedBy: reportingToUser?.id || 1
      });
    }

    const city = razorpayBankData?.CITY || bankVerification.city || null;
    const branch = razorpayBankData?.BRANCH || bankVerification.branch || null;

    const customerBank = await dbService.createOne(model.customerBank, {
      bankName: bankNameFromVerification,
      beneficiaryName: beneficiaryNameFromVerification,
      accountNumber: account_number,
      ifsc,
      city,
      branch,
      companyId,
      refId: userId,
      isActive: true,
      isPrimary: false,
      isPayout: req.body.isPayout,
      isFundTransfer: req.body.isFundTransfer
    });

    return res.success({
      message: 'Bank details added successfully',
      data: customerBank
    });
  } catch (error) {
    return res.internalServerError({
      message: error.message || 'Internal server error'
    });
  }
};

const deleteCustomerBank = async (req, res) => {
  try {
    if (![2].includes(req.user.userRole)) {
      return res.failure({ message: 'You are not authorized to delete bank details' });
    }
    const { id } = req.params;
    const user = req.user;
    const customerBank = await dbService.findOne(model.customerBank, {
      id: id,
      refId: user.id,
      companyId: user.companyId
    });
    if (!customerBank) {
      return res.notFound({ message: 'Customer bank not found' });
    }
    if (customerBank.isPrimary) {
      return res.failure({ message: 'Primary bank account cannot be deleted' });
    }
    const updatedBank = {
      isActive: false
    };
    await dbService.update(model.customerBank, {
      id: id,
      refId: user.id,
      companyId: user.companyId
    }, updatedBank);
    if (!updatedBank) {
      return res.failure({ message: 'Failed to delete bank details' });
    }
    return res.success({ message: 'Bank details deleted successfully', data: updatedBank });
  } catch (error) {
    return res.internalServerError({ message: error.message || 'Internal server error' });
  }
};

const updateCustomerBank = async (req, res) => {
  try {
    if (![2].includes(req.user.userRole)) {
      return res.failure({ message: 'You are not authorized to update bank details' });
    }
    const { id } = req.params;
    const { isActive, isPayout } = req.body;
    const user = req.user;

    const customerBank = await dbService.findOne(model.customerBank, {
      id: id,
      refId: user.id,
      companyId: user.companyId
    });

    if (!customerBank) {
      return res.notFound({ message: 'Customer bank not found' });
    }

    const updateData = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (isPayout !== undefined) updateData.isPayout = isPayout;

    if (Object.keys(updateData).length === 0) {
      return res.failure({ message: 'No fields to update' });
    }

    await dbService.update(model.customerBank, {
      id: id,
      refId: user.id,
      companyId: user.companyId
    }, updateData);

    return res.success({ message: 'Bank details updated successfully' });

  } catch (error) {
    return res.internalServerError({ message: error.message || 'Internal server error' });
  }
};

module.exports = {
  addCustomerBank,
  deleteCustomerBank,
  updateCustomerBank
}