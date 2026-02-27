const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const { Op } = require('sequelize');
const imageService = require('../../../services/imageService');
const { generateTransactionID } = require('../../../utils/transactionID');
const razorpayApi = require('../../../services/razorpayApi');
const ekycHub = require('../../../services/eKycHub');
const { doubleEncrypt, decrypt } = require('../../../utils/doubleCheckUp');
const key = Buffer.from(process.env.AES_KEY, 'hex');

const path = require('path');

const withBankLogoUrl = (bank) => {
  if (!bank) return bank;
  const data = bank?.toJSON ? bank.toJSON() : bank;
  const bankLogoKey = data?.bankLogo || null;
  return {
    ...data,
    bankLogo: bankLogoKey ? imageService.getImageUrl(bankLogoKey, false) : null
  };
};

const createBank = async (req, res) => {
  try {
    const dataToCreate = { ...(req.body || {}) };

    const existingUser = await dbService.findOne(model.user, {
      id: req.user.id,
      isActive: true
    });
    if (!existingUser || existingUser.userRole !== 1) {
      return res.failure({ message: 'Unauthorized access' });
    }
    const bankName = (dataToCreate.bankName || '').trim();
    const bankIIN = dataToCreate.bankIIN ? String(dataToCreate.bankIIN).trim() : '';
    let bankLogo = dataToCreate.bankLogo ? String(dataToCreate.bankLogo).trim() : null;

    if (!bankName) {
      return res.validationError({ message: 'bankName is required' });
    }
    if (!bankIIN) {
      return res.validationError({ message: 'bankIIN is required' });
    }

    const dupWhere = [{ bankName: { [Op.iLike]: bankName } }];
    dupWhere.push({ bankIIN });

    const existing = await dbService.findOne(model.aslBankList, {
      isDeleted: false,
      [Op.or]: dupWhere
    });

    if (existing) {
      return res.failure({ message: 'Bank already exists' });
    }

    if (req.file && req.file.buffer) {
      const ext = path.extname(req.file.originalname) || '.jpg';
      const fixedFileName = `bankLogo${ext}`;
      const uploadResult = await imageService.uploadImageToS3(
        req.file.buffer,
        fixedFileName,
        'bank',
        null,
        'bankLogo'
      );
      bankLogo = uploadResult?.key || uploadResult?.url || bankLogo;
    }

    const created = await dbService.createOne(model.aslBankList, {
      bankName,
      bankIIN,
      bankLogo,
      isActive: dataToCreate.isActive !== undefined ? !!dataToCreate.isActive : true,
      isDeleted: false
    });

    return res.success({
      message: 'Bank Created Successfully',
      data: withBankLogoUrl(created)
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    }
    if (error.name === 'SequelizeValidationError') {
      return res.validationError({ message: error.errors[0].message });
    }
    return res.internalServerError({ message: error.message });
  }
};

const updateBank = async (req, res) => {
  try {
    const { bankId } = req.params || {};
    const body = { ...(req.body || {}) };

    const existingUser = await dbService.findOne(model.user, {
      id: req.user.id,
      isActive: true
    });
    if (!existingUser || existingUser.userRole !== 1) {
      return res.failure({ message: 'Unauthorized access' });
    }

    const existingBank = await dbService.findOne(model.aslBankList, {
      bankIIN: bankId,
      isDeleted: false
    });
    if (!existingBank) {
      return res.failure({ message: 'Bank not found' });
    }

    if (!bankId) {
      return res.failure({ message: 'bankId is required' });
    }

    const dataToUpdate = {};
    if (body.bankName !== undefined) dataToUpdate.bankName = String(body.bankName).trim();
    if (body.bankIIN !== undefined) {
      const nextIIN = body.bankIIN ? String(body.bankIIN).trim() : '';
      if (!nextIIN) {
        return res.failure({ message: 'bankIIN is required' });
      }
      dataToUpdate.bankIIN = nextIIN;
    }
    if (req.file && req.file.buffer) {
      if (existingBank.bankLogo) {
        await imageService.deleteImageFromS3(existingBank.bankLogo);
      }
      const ext = path.extname(req.file.originalname) || '.jpg';
      const fixedFileName = `bankLogo${ext}`;
      const uploadResult = await imageService.uploadImageToS3(
        req.file.buffer,
        fixedFileName,
        'bank',
        null,
        'bankLogo'
      );
      dataToUpdate.bankLogo = uploadResult?.key || uploadResult?.url || null;
    } else if (body.bankLogo !== undefined) {
      dataToUpdate.bankLogo = body.bankLogo ? String(body.bankLogo).trim() : null;
    }
    if (body.isActive !== undefined) dataToUpdate.isActive = !!body.isActive;

    const updated = await dbService.update(
      model.aslBankList,
      { bankIIN: bankId, isDeleted: false },
      dataToUpdate
    );

    if (!updated || updated.length === 0) {
      return res.failure({ message: 'Update Bank failed' });
    }

    return res.success({
      message: 'Bank Updated Successfully',
      data: withBankLogoUrl(updated[0])
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    }
    if (error.name === 'SequelizeValidationError') {
      return res.validationError({ message: error.errors[0].message });
    }
    return res.internalServerError({ message: error.message });
  }
};

const deleteBank = async (req, res) => {
  try {
    const { bankId } = req.params || {};
    const body = { ...(req.body || {}) };
    if (!bankId) {
      return res.validationError({ message: 'bankId is required' });
    }

    const existingUser = await dbService.findOne(model.user, {
      id: req.user.id,
      isActive: true
    });
    if (!existingUser || existingUser.userRole !== 1) {
      return res.failure({ message: 'Unauthorized access' });
    }

    const existingBank = await dbService.findOne(model.aslBankList, {
      bankIIN: bankId,
      isDeleted: false
    });
    if (!existingBank) {
      return res.failure({ message: 'Bank not found' });
    }

    const updated = await dbService.update(
      model.aslBankList,
      { bankIIN: bankId },
      { isDeleted: true, isActive: false }
    );

    if (!updated || updated.length === 0) {
      return res.failure({ message: 'Delete Bank failed' });
    }

    return res.success({ message: 'Bank Deleted Successfully' });
  } catch (error) {
    return res.internalServerError({ message: error.message });
  }
};

const getBankById = async (req, res) => {
  try {
    const { bankId } = req.params;
    if (!bankId) {
      return res.failure({ message: 'bankId is required' });
    }

    const found = await dbService.findOne(model.aslBankList, {
      bankIIN: bankId,
      isDeleted: false
    });
    if (!found) {
      return res.failure({ message: 'Bank not found' });
    }

    return res.success({
      message: 'Bank Retrieved Successfully',
      data: withBankLogoUrl(found)
    });
  } catch (error) {
    return res.internalServerError({ message: error.message });
  }
};

const getAllBanks = async (req, res) => {
  try {
    const existingUser = await dbService.findOne(model.user, {
      id: req.user.id,
      isActive: true
    });
    if (!existingUser) {
      return res.failure({ message: 'User not found' });
    }

    const dataToFind = req.body || {};
    let options = {};
    let query = { isDeleted: false };

    if (dataToFind && dataToFind.query) {
      query = { ...query, ...dataToFind.query };
    }

    if (dataToFind && dataToFind.options !== undefined) {
      options = { ...dataToFind.options };
    }

    if (dataToFind?.customSearch && typeof dataToFind.customSearch === 'object') {
      const keys = Object.keys(dataToFind.customSearch);
      const orConditions = [];

      keys.forEach((key) => {
        const value = dataToFind.customSearch[key];
        if (value === undefined || value === null || String(value).trim() === '') return;

        orConditions.push({
          [key]: {
            [Op.iLike]: `%${String(value).trim()}%`
          }
        });
      });

      if (orConditions.length > 0) {
        query = {
          ...query,
          [Op.or]: orConditions
        };
      }
    }

    if (query.isActive === undefined) {
      query.isActive = true;
    }

    const result = await dbService.paginate(model.aslBankList, query, options);

    return res.success({
      message: 'Banks Retrieved Successfully',
      data: (result?.data || []).map(withBankLogoUrl),
      total: result?.total || 0,
      paginator: result?.paginator
    });
  } catch (error) {
    return res.internalServerError({ message: error.message });
  }
};

const addBank = async (req, res) => {
  try {
    const existingUser = await dbService.findOne(model.user, {
      id: req.user.id,
      isActive: true
    });

    if (!existingUser || existingUser.userRole !== 1) {
      return res.failure({ message: 'Unauthorized access' });
    }

    const userId = existingUser.id;
    const companyId = existingUser.companyId;

    const adminWallet = await dbService.findOne(model.wallet, {
      refId: userId,
      companyId
    });

    if (!adminWallet) {
      return res.failure({ message: 'Admin wallet not found' });
    }

    const { account_number, ifsc } = req.body || {};

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

    const operator = await dbService.findOne(model.operator, {
      operatorType: 'BANK VERIFICATION',
      inSlab: true
    });

    if (!operator) {
      return res.failure({ message: 'Bank verification operator not configured' });
    }

    const surchargeAmt = parseFloat(operator.comm || 0);

    if (surchargeAmt <= 0 || operator.commType !== 'sur') {
      return res.failure({
        message: 'Invalid operator commission configuration for bank verification'
      });
    }

    const adminOpeningBalance = parseFloat(adminWallet.mainWallet || 0);

    if (adminOpeningBalance < surchargeAmt) {
      return res.failure({
        message: `Insufficient wallet balance. Required: ${surchargeAmt}, Available: ${adminOpeningBalance}`
      });
    }

    const adminClosingBalance = parseFloat((adminOpeningBalance - surchargeAmt).toFixed(2));

    const companyDetails = await dbService.findOne(model.company, { id: companyId });
    const transactionId = generateTransactionID(companyDetails?.companyName || 'BANK_VERIFY');

    await dbService.update(
      model.wallet,
      { id: adminWallet.id },
      { mainWallet: adminClosingBalance, updatedBy: userId }
    );

    const operatorName = 'Bank Verification';
    const remarkText = 'Bank verification charge (admin)';

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
      amount: surchargeAmt,
      comm: 0,
      surcharge: surchargeAmt,
      openingAmt: adminOpeningBalance,
      closingAmt: adminClosingBalance,
      credit: 0,
      debit: surchargeAmt,
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
    return res.internalServerError({ message: error.message });
  }
};

module.exports = {
  createBank,
  updateBank,
  deleteBank,
  getBankById,
  getAllBanks,
  addBank
};

