const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const { Op } = require('sequelize');
const imageService = require('../../../services/imageService');
const path = require('path');

// Normalize bank record and attach public CDN URL for bankLogo
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
    if(!existingUser || existingUser.userRole !== 1){
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
   
    // basic duplicate check (by bankName and/or bankIIN if provided)
    const dupWhere = [{ bankName: { [Op.iLike]: bankName } }];
    dupWhere.push({ bankIIN });

    const existing = await dbService.findOne(model.aslBankList, {
      isDeleted: false,
      [Op.or]: dupWhere
    });

    if (existing) {
      return res.failure({ message: 'Bank already exists' });
    }

    // If logo file provided, upload to S3
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
    console.log(error);
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
    if(!existingUser || existingUser.userRole !== 1){
      return res.failure({ message: 'Unauthorized access' });
    }

    const existingBank = await dbService.findOne(model.aslBankList, {
      bankIIN: bankId,
      isDeleted: false
    });
    if(!existingBank){
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
    // If logo file provided, replace logo in S3 and delete old
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
      // allow manual setting if no file uploaded
      dataToUpdate.bankLogo = body.bankLogo ? String(body.bankLogo).trim() : null;
    }
    if (body.isActive !== undefined) dataToUpdate.isActive = !!body.isActive;

    const updated = await dbService.update(
      model.aslBankList,
      { id: bankId, isDeleted: false },
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
    console.log(error);
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
    if(!existingUser || existingUser.userRole !== 1){
      return res.failure({ message: 'Unauthorized access' });
    }

    const existingBank = await dbService.findOne(model.aslBankList, {
      bankIIN: bankId,
      isDeleted: false
    });
    if(!existingBank){
      return res.failure({ message: 'Bank not found' });
    }

    // soft delete to match other patterns
    const updated = await dbService.update(
      model.aslBankList,
      { id: bankId },
      { isDeleted: true, isActive: false }
    );

    if (!updated || updated.length === 0) {
      return res.failure({ message: 'Delete Bank failed' });
    }

    return res.success({ message: 'Bank Deleted Successfully' });
  } catch (error) {
    console.log(error);
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
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

const getAllBanks = async (req, res) => {
  try {
    const existingUser = await dbService.findOne(model.user, {
      id: req.user.id,
      isActive: true
    });
    if (!existingUser || existingUser.userRole !== 1) {
      return res.failure({ message: 'Unauthorized access' });
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

    // default: only active banks unless explicitly asked
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
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

module.exports = {
  createBank,
  updateBank,
  deleteBank,
  getBankById,
  getAllBanks
};

