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
        id:  1,
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
      return res.failure({ message: 'User not found' });
    }

    const { account_number, ifsc } = req.body;

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
          .catch(() => {});
      }
    }

    if (!bankVerification || bankVerification.status !== 'Success') {
      return res.failure({ message: 'Bank verification failed' });
    }

    const existingUserSlab = await dbService.findOne(model.slab, {
      id: existingUser?.slabId
    });

    if (!existingUserSlab) {
      return res.failure({ message: 'Slab not found' });
    }

    const slabComm = await dbService.findAll(
      model.commSlab,
      {
        slabId: existingUserSlab.id,
        addedBy: existingUser?.reportingTo || 1,
        operatorType: 'BANK VERIFICATION'
      },
      {
        select: ['id', 'roleType', 'commAmt', 'commType', 'amtType']
      }
    );

    if (!slabComm || !Array.isArray(slabComm) || slabComm.length === 0) {
      return res.failure({ message: 'Slab commission not found' });
    }

    const adminCommission = slabComm.find((c) => c.roleType === 1) || slabComm[0];
    const userCommission = slabComm.find((c) => c.roleType === 2) || slabComm[slabComm.length - 1];

    const adminSurchargeAmt = parseFloat(adminCommission?.commAmt || 0);
    const userSurchargeAmt = parseFloat(userCommission?.commAmt || 0);
    

    if (adminSurchargeAmt <= 0 || userSurchargeAmt <= 0) {
      return res.failure({ message: 'Invalid surcharge configuration for bank verification' });
    }

    if (!reportingToUserWallet) {
      return res.failure({ message: 'Reporting to user wallet not found' });
    }

    const userOpeningBalance = parseFloat(existingUserWallet.mainWallet || 0);

    if (userOpeningBalance < userSurchargeAmt) {
      return res.failure({
        message: `Insufficient wallet balance. Required: ${userSurchargeAmt}, Available: ${userOpeningBalance}`
      });
    }

    const userClosingBalance = parseFloat((userOpeningBalance - userSurchargeAmt).toFixed(2));
    const reportingOpeningBalance = parseFloat(reportingToUserWallet.mainWallet || 0);
    const reportingClosingBalance = parseFloat((reportingOpeningBalance + adminSurchargeAmt).toFixed(2));

    const companyDetails = await dbService.findOne(model.company, { id: companyId });
    const transactionId = generateTransactionID(companyDetails?.companyName || 'BANK_VERIFY');

    await dbService.update(
      model.wallet,
      { id: existingUserWallet.id },
      { mainWallet: userClosingBalance, updatedBy: userId }
    );

    await dbService.update(
      model.wallet,
      { id: reportingToUserWallet.id },
      { mainWallet: reportingClosingBalance, updatedBy: reportingToUser?.id || 1 }
    );

    const operatorName = 'Bank Verification';
    const remarkText = 'Bank verification charge';

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
      amount: userSurchargeAmt,
      comm: 0,
      surcharge: userSurchargeAmt,
      openingAmt: userOpeningBalance,
      closingAmt: userClosingBalance,
      credit: 0,
      debit: userSurchargeAmt,
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

    await dbService.createOne(model.walletHistory, {
      refId: reportingToUser?.id || 1,
      companyId: reportingToUser?.companyId || companyId,
      walletType: 'mainWallet',
      operator: operatorName,
      remark: `${remarkText} - commission`,
      amount: adminSurchargeAmt,
      comm: adminSurchargeAmt,
      surcharge: 0,
      openingAmt: reportingOpeningBalance,
      closingAmt: reportingClosingBalance,
      credit: adminSurchargeAmt,
      debit: 0,
      transactionId,
      paymentStatus: 'SUCCESS',
      beneficiaryName: reportingToUser?.name || null,
      beneficiaryAccountNumber: null,
      beneficiaryBankName: null,
      beneficiaryIfsc: null,
      paymentMode: 'WALLET',
      addedBy: reportingToUser?.id || 1,
      updatedBy: reportingToUser?.id || 1
    });

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
      isPrimary: false
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

module.exports = {
    addCustomerBank
}