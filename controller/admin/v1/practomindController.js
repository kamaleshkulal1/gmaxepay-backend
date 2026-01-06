
const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const { Op } = require('sequelize');
const { checkUniqueFieldsInDatabase } = require('../../../utils/common');
const imageService = require('../../../services/imageService');
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
    const existingUser = await dbService.findOne(model.user, {
      id: req.user.id,
      isActive: true
    });
    if (!existingUser || existingUser.userRole !== 1) {
      return res.failure({ message: 'Unauthorized access' });
    }

    const dataToCreate = { ...(req.body || {}) };
    const aeps_bank_id = (dataToCreate.aeps_bank_id || '').trim();
    const bankName = (dataToCreate.bankName || '').trim();
    const iinno = (dataToCreate.iinno || '').trim();

    if (!aeps_bank_id) {  
      return res.failure({ message: 'aeps_bank_id is required' });
    }

    if (!bankName) {
      return res.failure({ message: 'bankName is required' });
    }
    if (!iinno) {
      return res.failure({ message: 'iinno is required' });
    }

    // Check for duplicates (iinno and bankName cannot repeat)
    const duplicateCheck = await checkUniqueFieldsInDatabase(
      model.practomindBankList,
      ['iinno', 'bankName','aeps_bank_id'],
      { iinno, bankName, aeps_bank_id },
      'INSERT'
    );

    if (duplicateCheck.isDuplicate) {
      return res.failure({
        message: `${duplicateCheck.field} already exists`
      });
    }

    let bankLogo = dataToCreate.bankLogo ? String(dataToCreate.bankLogo).trim() : null;

    // If logo file provided, upload to S3
    if (req.file && req.file.buffer) {
      const ext = path.extname(req.file.originalname) || '.jpg';
      const fixedFileName = `practomindBankLogo${Date.now()}${ext}`;
      const uploadResult = await imageService.uploadImageToS3(
        req.file.buffer,
        fixedFileName,
        'bank',
        null,
        'bankLogo'
      );
      bankLogo = uploadResult?.key || uploadResult?.url || bankLogo;
    }

    const created = await dbService.createOne(model.practomindBankList, {
      aeps_bank_id,
      bankName,
      iinno,
      bankLogo,
      isActive: dataToCreate.isActive !== undefined ? !!dataToCreate.isActive : true,
      isDeleted: false,
      addedBy: req.user.id
    });

    return res.success({
      message: 'Bank Created Successfully',
      data: withBankLogoUrl(created)
    });
  } catch (error) {
    console.log(error);
    return res.failure({ message: 'Bank Creation Failed' });
  }
};

const updateBank = async (req, res) => {
  try {
    const { id } = req.params || {};
    const body = { ...(req.body || {}) };

    const existingUser = await dbService.findOne(model.user, {
      id: req.user.id,
      isActive: true
    });
    if (!existingUser || existingUser.userRole !== 1) {
      return res.failure({ message: 'Unauthorized access' });
    }

    if (!id) {
      return res.failure({ message: 'id is required' });
    }

    const existingBank = await dbService.findOne(model.practomindBankList, {
      id: parseInt(id),
      isDeleted: false
    });    if (!existingBank) {
      return res.failure({ message: 'Bank not found' });
    }

    const dataToUpdate = {};
    if (body.bankName !== undefined) {
      const bankName = String(body.bankName).trim();
      if (!bankName) {
        return res.failure({ message: 'bankName cannot be empty' });
      }
      dataToUpdate.bankName = bankName;
    }
    if (body.iinno !== undefined) {
      const iinno = String(body.iinno).trim();
      if (!iinno) {
        return res.failure({ message: 'iinno cannot be empty' });
      }
      dataToUpdate.iinno = iinno;
    }
    if (body.aeps_bank_id !== undefined) {
      const aeps_bank_id = String(body.aeps_bank_id).trim();
      if (!aeps_bank_id) {
        return res.failure({ message: 'aeps_bank_id cannot be empty' });
      }
      dataToUpdate.aeps_bank_id = aeps_bank_id;
    }

    // Check for duplicates if updating unique fields (excluding current record)
    if (dataToUpdate.iinno || dataToUpdate.bankName) {
      const checkIinno = dataToUpdate.iinno || existingBank.iinno;
      const checkBankName = dataToUpdate.bankName || existingBank.bankName;

      // Check if iinno already exists (excluding current record)
      if (dataToUpdate.iinno) {
        const existingWithIinno = await dbService.findOne(model.practomindBankList, {
          iinno: checkIinno,
          id: { [Op.ne]: parseInt(id) },
          isDeleted: false
        });
        if (existingWithIinno) {
          return res.failure({ message: 'iinno already exists' });
        }
      }

      // Check if bankName already exists (excluding current record)
      if (dataToUpdate.bankName) {
        const existingWithName = await dbService.findOne(model.practomindBankList, {
          bankName: { [Op.iLike]: checkBankName },
          id: { [Op.ne]: parseInt(id) },
          isDeleted: false
        });
        if (existingWithName) {
          return res.failure({ message: 'bankName already exists' });
        }
      }
    }

    // If logo file provided, replace logo in S3 and delete old
    if (req.file && req.file.buffer) {
      if (existingBank.bankLogo) {
        await imageService.deleteImageFromS3(existingBank.bankLogo);
      }
      const ext = path.extname(req.file.originalname) || '.jpg';
      const fixedFileName = `practomindBankLogo${Date.now()}${ext}`;
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

    if (body.isActive !== undefined) {
      // Properly convert string "false"/"true" to boolean
      if (typeof body.isActive === 'string') {
        dataToUpdate.isActive = body.isActive.toLowerCase() === 'true' || body.isActive === '1';
      } else {
        dataToUpdate.isActive = !!body.isActive;
      }
    }
    dataToUpdate.updatedBy = req.user.id;

    const updated = await dbService.update(
      model.practomindBankList,
      { id: parseInt(id), isDeleted: false },
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
    return res.failure({ message: error.message });
  }
};

const deleteBank = async (req, res) => {
  try {
    const { id } = req.params || {};
    if (!id) {
      return res.validationError({ message: 'id is required' });
    }

    const existingUser = await dbService.findOne(model.user, {
      id: req.user.id,
      isActive: true
    });
    if (!existingUser || existingUser.userRole !== 1) {
      return res.failure({ message: 'Unauthorized access' });
    }

    const existingBank = await dbService.findOne(model.practomindBankList, {
      id: parseInt(id),
      isDeleted: false
    });

    if (!existingBank) {
      return res.failure({ message: 'Bank not found' });
    }

    // Soft delete
    const updated = await dbService.update(
      model.practomindBankList,
      { id: parseInt(id) },
      { isDeleted: true, isActive: false, updatedBy: req.user.id }
    );

    if (!updated || updated.length === 0) {
      return res.failure({ message: 'Delete Bank failed' });
    }

    return res.success({ message: 'Bank Deleted Successfully' });
  } catch (error) {
    console.log(error);
    return res.failure({ message: error.message });
  }
};

const getBankById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.failure({ message: 'id is required' });
    }

    const found = await dbService.findOne(model.practomindBankList, {
      id: parseInt(id),
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
    return res.failure({ message: error.message });
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

    const result = await dbService.paginate(model.practomindBankList, query, options);

    return res.success({
      message: 'Banks Retrieved Successfully',
      data: (result?.data || []).map(withBankLogoUrl),
      total: result?.total || 0,
      paginator: result?.paginator
    });
  } catch (error) {
    return res.failure({ message: error.message });
  }
};

// ==================== COMPANY CODE CONTROLLERS ====================

const createCompanyCode = async (req, res) => {
  try {
    const existingUser = await dbService.findOne(model.user, {
      id: req.user.id,
      isActive: true
    });
    if (!existingUser || existingUser.userRole !== 1) {
      return res.failure({ message: 'Unauthorized access' });
    }

    const dataToCreate = { ...(req.body || {}) };
    const c_id = (dataToCreate.c_id || '').trim();
    const mccCode = (dataToCreate.mccCode || '').trim();
    const description = dataToCreate.description ? String(dataToCreate.description).trim() : null;

    if (!c_id) {
      return res.failure({ message: 'c_id is required' });
    }
    if (!mccCode) {
      return res.failure({ message: 'mccCode is required' });
    }

    // Check for duplicates (c_id and mccCode cannot repeat)
    const duplicateCheck = await checkUniqueFieldsInDatabase(
      model.practomindCompanyCode,
      ['c_id', 'mccCode'],
      { c_id, mccCode },
      'INSERT'
    );

    if (duplicateCheck.isDuplicate) {
      return res.failure({
        message: `${duplicateCheck.field} already exists`
      });
    }

    const created = await dbService.createOne(model.practomindCompanyCode, {
      c_id,
      mccCode,
      description,
      isActive: dataToCreate.isActive !== undefined ? !!dataToCreate.isActive : true,
      isDeleted: false,
      addedBy: req.user.id
    });

    return res.success({
      message: 'Company Code Created Successfully',
      data: created
    });
  } catch (error) {
    return res.failure({ message: error.message });
  }
};

const updateCompanyCode = async (req, res) => {
  try {
    const { id } = req.params || {};
    const body = { ...(req.body || {}) };

    const existingUser = await dbService.findOne(model.user, {
      id: req.user.id,
      isActive: true
    });
    if (!existingUser || existingUser.userRole !== 1) {
      return res.failure({ message: 'Unauthorized access' });
    }

    if (!id) {
      return res.failure({ message: 'id is required' });
    }

    const existing = await dbService.findOne(model.practomindCompanyCode, {
      id: parseInt(id),
      isDeleted: false
    });

    if (!existing) {
      return res.failure({ message: 'Company Code not found' });
    }

    const dataToUpdate = {};
    if (body.c_id !== undefined) {
      const c_id = String(body.c_id).trim();
      if (!c_id) {
        return res.failure({ message: 'c_id cannot be empty' });
      }
      dataToUpdate.c_id = c_id;
    }
    if (body.mccCode !== undefined) {
      const mccCode = String(body.mccCode).trim();
      if (!mccCode) {
        return res.failure({ message: 'mccCode cannot be empty' });
      }
      dataToUpdate.mccCode = mccCode;
    }
    if (body.description !== undefined) {
      dataToUpdate.description = body.description ? String(body.description).trim() : null;
    }

    // Check for duplicates if updating unique fields (excluding current record)
    if (dataToUpdate.c_id || dataToUpdate.mccCode) {
      // Check if c_id already exists (excluding current record)
      if (dataToUpdate.c_id) {
        const existingWithCId = await dbService.findOne(model.practomindCompanyCode, {
          c_id: dataToUpdate.c_id,
          id: { [Op.ne]: parseInt(id) },
          isDeleted: false
        });
        if (existingWithCId) {
          return res.failure({ message: 'c_id already exists' });
        }
      }

      // Check if mccCode already exists (excluding current record)
      if (dataToUpdate.mccCode) {
        const existingWithMcc = await dbService.findOne(model.practomindCompanyCode, {
          mccCode: dataToUpdate.mccCode,
          id: { [Op.ne]: parseInt(id) },
          isDeleted: false
        });
        if (existingWithMcc) {
          return res.failure({ message: 'mccCode already exists' });
        }
      }
    }

    if (body.isActive !== undefined) {
      // Properly convert string "false"/"true" to boolean
      if (typeof body.isActive === 'string') {
        dataToUpdate.isActive = body.isActive.toLowerCase() === 'true' || body.isActive === '1';
      } else {
        dataToUpdate.isActive = !!body.isActive;
      }
    }
    dataToUpdate.updatedBy = req.user.id;

    const updated = await dbService.update(
      model.practomindCompanyCode,
      { id: parseInt(id), isDeleted: false },
      dataToUpdate
    );

    if (!updated || updated.length === 0) {
      return res.failure({ message: 'Update Company Code failed' });
    }

    return res.success({
      message: 'Company Code Updated Successfully',
      data: updated[0]
    });
  } catch (error) {
    console.log(error);
    return res.failure({ message: error.message });
  }
};

const deleteCompanyCode = async (req, res) => {
  try {
    const { id } = req.params || {};
    if (!id) {
      return res.failure({ message: 'id is required' });
    }

    const existingUser = await dbService.findOne(model.user, {
      id: req.user.id,
      isActive: true
    });
    if (!existingUser || existingUser.userRole !== 1) {
      return res.failure({ message: 'Unauthorized access' });
    }

    const existing = await dbService.findOne(model.practomindCompanyCode, {
      id: parseInt(id),
      isDeleted: false
    });

    if (!existing) {
      return res.failure({ message: 'Company Code not found' });
    }

    // Soft delete
    const updated = await dbService.update(
      model.practomindCompanyCode,
      { id: parseInt(id) },
      { isDeleted: true, isActive: false, updatedBy: req.user.id }
    );

    if (!updated || updated.length === 0) {
      return res.failure({ message: 'Delete Company Code failed' });
    }

    return res.success({ message: 'Company Code Deleted Successfully' });
  } catch (error) {
    console.log(error);
    return res.failure({ message: error.message });
  }
};

const getCompanyCodeById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.failure({ message: 'id is required' });
    }

    const found = await dbService.findOne(model.practomindCompanyCode, {
      id: parseInt(id),
      isDeleted: false
    });

    if (!found) {
      return res.failure({ message: 'Company Code not found' });
    }

    return res.success({
      message: 'Company Code Retrieved Successfully',
      data: found
    });
  } catch (error) {
    console.log(error);
    return res.failure({ message: error.message });
  }
};

const getAllCompanyCodes = async (req, res) => {
  try {
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

    const result = await dbService.paginate(model.practomindCompanyCode, query, options);

    // Map results to only include id and description
    const filteredData = (result?.data || []).map(item => {
      const itemData = item?.toJSON ? item.toJSON() : item;
      return {
        id: itemData.id,
        description: itemData.description || null
      };
    });

    return res.success({
      message: 'Company Codes Retrieved Successfully',
      data: filteredData,
      total: result?.total || 0,
      paginator: result?.paginator
    });
  } catch (error) {
    console.log(error);
    return res.failure({ message: error.message });
  }
};


const createState = async (req, res) => {
  try {
    const existingUser = await dbService.findOne(model.user, {
      id: req.user.id,
      isActive: true
    });
    if (!existingUser || existingUser.userRole !== 1) {
      return res.failure({ message: 'Unauthorized access' });
    }

    const dataToCreate = { ...(req.body || {}) };
    const stateId = (dataToCreate.stateId || '').trim();
    const state = (dataToCreate.state || '').trim();
    const stateCode = (dataToCreate.stateCode || '').trim();

    if (!stateId) {
      return res.failure({ message: 'stateId is required' });
    }
    if (!state) {
      return res.failure({ message: 'state is required' });
    }
    if (!stateCode) {
      return res.failure({ message: 'stateCode is required' });
    }

    // Check for duplicates (stateId, state, and stateCode cannot repeat)
    const duplicateCheck = await checkUniqueFieldsInDatabase(
      model.practomindState,
      ['stateId', 'state', 'stateCode'],
      { stateId, state, stateCode },
      'INSERT'
    );

    if (duplicateCheck.isDuplicate) {
      return res.validationError({
        message: `${duplicateCheck.field} already exists`
      });
    }

    const created = await dbService.createOne(model.practomindState, {
      stateId,
      state,
      stateCode,
      isActive: dataToCreate.isActive !== undefined ? !!dataToCreate.isActive : true,
      isDeleted: false,
      addedBy: req.user.id
    });

    return res.success({
      message: 'State Created Successfully',
      data: created
    });
  } catch (error) {
    console.log(error);
    return res.failure({ message: error.message });
  }
};

const updateState = async (req, res) => {
  try {
    const { id } = req.params || {};
    const body = { ...(req.body || {}) };

    const existingUser = await dbService.findOne(model.user, {
      id: req.user.id,
      isActive: true
    });
    if (!existingUser || existingUser.userRole !== 1) {
      return res.failure({ message: 'Unauthorized access' });
    }

    if (!id) {
      return res.failure({ message: 'id is required' });
    }

    const existing = await dbService.findOne(model.practomindState, {
      id: parseInt(id),
      isDeleted: false
    });

    if (!existing) {
      return res.failure({ message: 'State not found' });
    }

    const dataToUpdate = {};
    if (body.stateId !== undefined) {
      const stateId = String(body.stateId).trim();
      if (!stateId) {
        return res.failure({ message: 'stateId cannot be empty' });
      }
      dataToUpdate.stateId = stateId;
    }
    if (body.state !== undefined) {
      const state = String(body.state).trim();
      if (!state) {
        return res.failure({ message: 'state cannot be empty' });
      }
      dataToUpdate.state = state;
    }
    if (body.stateCode !== undefined) {
      const stateCode = String(body.stateCode).trim();
      if (!stateCode) {
        return res.failure({ message: 'stateCode cannot be empty' });
      }
      dataToUpdate.stateCode = stateCode;
    }

    // Check for duplicates if updating unique fields (excluding current record)
    if (dataToUpdate.stateId || dataToUpdate.state || dataToUpdate.stateCode) {
      // Check if stateId already exists (excluding current record)
      if (dataToUpdate.stateId) {
        const existingWithStateId = await dbService.findOne(model.practomindState, {
          stateId: dataToUpdate.stateId,
          id: { [Op.ne]: parseInt(id) },
          isDeleted: false
        });
        if (existingWithStateId) {
          return res.failure({ message: 'stateId already exists' });
        }
      }

      // Check if state already exists (excluding current record)
      if (dataToUpdate.state) {
        const existingWithState = await dbService.findOne(model.practomindState, {
          state: { [Op.iLike]: dataToUpdate.state },
          id: { [Op.ne]: parseInt(id) },
          isDeleted: false
        });
        if (existingWithState) {
          return res.failure({ message: 'state already exists' });
        }
      }

      // Check if stateCode already exists (excluding current record)
      if (dataToUpdate.stateCode) {
        const existingWithStateCode = await dbService.findOne(model.practomindState, {
          stateCode: { [Op.iLike]: dataToUpdate.stateCode },
          id: { [Op.ne]: parseInt(id) },
          isDeleted: false
        });
        if (existingWithStateCode) {
          return res.failure({ message: 'stateCode already exists' });
        }
      }
    }

    if (body.isActive !== undefined) {
      // Properly convert string "false"/"true" to boolean
      if (typeof body.isActive === 'string') {
        dataToUpdate.isActive = body.isActive.toLowerCase() === 'true' || body.isActive === '1';
      } else {
        dataToUpdate.isActive = !!body.isActive;
      }
    }
    dataToUpdate.updatedBy = req.user.id;

    const updated = await dbService.update(
      model.practomindState,
      { id: parseInt(id), isDeleted: false },
      dataToUpdate
    );

    if (!updated || updated.length === 0) {
      return res.failure({ message: 'Update State failed' });
    }

    return res.success({
      message: 'State Updated Successfully',
      data: updated[0]
    });
  } catch (error) {
    return res.failure({ message: error.message });
  }
};

const deleteState = async (req, res) => {
  try {
    const { id } = req.params || {};
    if (!id) {
      return res.failure({ message: 'id is required' });
    }

    const existingUser = await dbService.findOne(model.user, {
      id: req.user.id,
      isActive: true
    });
    if (!existingUser || existingUser.userRole !== 1) {
      return res.failure({ message: 'Unauthorized access' });
    }

    const existing = await dbService.findOne(model.practomindState, {
      id: parseInt(id),
      isDeleted: false
    });

    if (!existing) {
      return res.failure({ message: 'State not found' });
    }

    // Soft delete
    const updated = await dbService.update(
      model.practomindState,
      { id: parseInt(id) },
      { isDeleted: true, isActive: false, updatedBy: req.user.id }
    );

    if (!updated || updated.length === 0) {
      return res.failure({ message: 'Delete State failed' });
    }

    return res.success({ message: 'State Deleted Successfully' });
  } catch (error) {
    console.log(error);
    return res.failure({ message: error.message });
  }
};

const getStateById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.failure({ message: 'id is required' });
    }

    const found = await dbService.findOne(model.practomindState, {
      id: parseInt(id),
      isDeleted: false
    });

    if (!found) {
      return res.failure({ message: 'State not found' });
    }

    return res.success({
      message: 'State Retrieved Successfully',
      data: found
    });
  } catch (error) {
    console.log(error);
    return res.failure({ message: error.message });
  }
};

const getAllStates = async (req, res) => {
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

    const result = await dbService.paginate(model.practomindState, query, options);

    return res.success({
      message: 'States Retrieved Successfully',
      data: result?.data || [],
      total: result?.total || 0,
      paginator: result?.paginator
    });
  } catch (error) {
    console.log(error);
    return res.failure({ message: error.message });
  }
};

module.exports = {
  // Bank exports
  createBank,
  updateBank,
  deleteBank,
  getBankById,
  getAllBanks,
  // Company Code exports
  createCompanyCode,
  updateCompanyCode,
  deleteCompanyCode,
  getCompanyCodeById,
  getAllCompanyCodes,
  // State exports
  createState,
  updateState,
  deleteState,
  getStateById,
  getAllStates
};

