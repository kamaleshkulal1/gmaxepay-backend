const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op, Sequelize } = require('sequelize');
const { USER_TYPES } = require('../../../constants/authConstant');


const processData = (data) => {
  const groupedData = {};

  data.forEach((item) => {
    const key = `${item.slabId}-${item.operatorId}`;

    const operatorMargin = item.operator || {};

    if (!groupedData[key]) {
      groupedData[key] = {
        slabId: item.slabId,
        operatorId: item.operatorId,
        operatorName: item.operatorName,
        operatorType: item.operatorType,
        marginCommAmt: operatorMargin.comm,
        marginCommType: operatorMargin.commType,
        marginAmtType: operatorMargin.amtType,
        instruments: []
      };
    }

    let instrument = groupedData[key].instruments.find(
      (inst) =>
        inst.paymentInstrument === item.paymentInstrumentName &&
        inst.cardType === item.cardTypeName
    );

    if (!instrument) {
      instrument = {
        paymentInstrument: item.paymentInstrumentName,
        cardType: item.cardTypeName,
        roles: []
      };
      groupedData[key].instruments.push(instrument);
    }

    instrument.roles.push({
      id: item.id,
      roleType: item.roleType,
      roleName: item.roleName,
      commType: item.commType,
      commAmt: item.commAmt,
      amtType: item.amtType,
      updatedAt: item.updatedAt
    });
  });

  return Object.values(groupedData);
};

const findAllslabComm = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }
    let dataToFind = req.body;
    const companyId = req.companyId ?? req.user?.companyId ?? null;
    let options = { order: [['id', 'ASC']] };
    let query = {};
    let foundUser;

    if (dataToFind && dataToFind.query) {
      query = dataToFind.query;
    }
    const filteredSlabs = await dbService.findAll(
      model.slab,
      {
        addedBy: 1,
        isActive: true
      },
      {
        attributes: ['id']
      }
    );

    if (!filteredSlabs || filteredSlabs.length === 0) {
      return res.failure({ message: 'No slabs found' });
    }

    const slabIds = filteredSlabs.map((s) => s.id || s.dataValues?.id).filter(Boolean);

    if (!slabIds.length) {
      return res.failure({ message: 'No slabs found' });
    }

    query.slabId = { [Op.in]: slabIds };

    if (dataToFind && dataToFind.isCountOnly) {
      foundUser = await dbService.count(model.pgCommercials, query);
      if (!foundUser) {
        return res.recordNotFound();
      }
      foundUser = { totalRecords: foundUser };
      return res.success({ data: foundUser });
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
            Sequelize.where(Sequelize.cast(Sequelize.col(key), 'varchar'), {
              [Op.iLike]: `%${dataToFind.customSearch[key]}%`
            })
          );
        } else {
          orConditions.push({
            [key]: {
              [Op.iLike]: `%${dataToFind.customSearch[key]}%`
            }
          });
        }
      });

      if (orConditions.length > 0) {
        query = {
          ...query,
          [Op.or]: orConditions
        };
      }
    }

    // Filter to only include roleType 1 (AD) and 2 (WU)
    query.roleType = { [Op.in]: [1, 2] };

    foundUser = await dbService.findAll(model.commSlab, query, {
      ...options,
      include: [
        {
          model: model.operator,
          as: 'operator',
          attributes: ['comm', 'commType', 'amtType']
        }
      ]
    });

    if (!foundUser || foundUser.length === 0) {
      return res.failure({ message: 'No slabs Commissions found' });
    }

    const formattedResponse = processData(foundUser);

    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Your request is successfully executed',
      data: formattedResponse,
      total: formattedResponse.length
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ data: error.message });
  }
};

const updateSlabName = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    const { slabId, slabName, schemaMode, schemaType } = req.body;

    if (!slabId) {
      return res.failure({ message: 'slabId is required' });
    }

    // At least one field must be provided for update
    if (!slabName && !schemaMode && !schemaType) {
      return res.failure({ message: 'At least one field (slabName, schemaMode, schemaType) must be provided' });
    }

    const companyId = req.companyId ?? req.user?.companyId ?? null;

    // Find the slab
    const slab = await dbService.findOne(model.slab, {
      id: slabId,
      ...(companyId !== null && companyId !== undefined ? { companyId } : {})
    });

    if (!slab) {
      return res.failure({ message: 'Slab not found' });
    }

    // Build update data
    const updateData = {
      updatedBy: req.user.id
    };

    if (slabName !== undefined) {
      if (!slabName || slabName.trim() === '') {
        return res.failure({ message: 'slabName cannot be empty' });
      }
      updateData.slabName = slabName.trim();
      
      // Check if new slabName already exists for this company (excluding current slab)
      const existingSlab = await dbService.findOne(model.slab, {
        slabName: slabName.trim(),
        companyId: companyId,
        id: { [Op.ne]: slabId }
      });

      if (existingSlab) {
        return res.failure({ 
          message: `Slab with name "${slabName.trim()}" already exists for this company` 
        });
      }
    }

    if (schemaMode !== undefined) {
      if (!['global', 'private'].includes(schemaMode)) {
        return res.failure({ message: 'schemaMode must be either "global" or "private"' });
      }
      updateData.schemaMode = schemaMode;
    }

    if (schemaType !== undefined) {
      if (!['free', 'premium'].includes(schemaType)) {
        return res.failure({ message: 'schemaType must be either "free" or "premium"' });
      }
      updateData.schemaType = schemaType;
    }

    // Update the slab
    const updatedSlab = await dbService.update(
      model.slab,
      { id: slabId },
      updateData
    );

    if (!updatedSlab || updatedSlab.length === 0) {
      return res.failure({ message: 'Failed to update slab' });
    }

    return res.success({
      message: 'Slab updated successfully',
      data: updatedSlab[0]
    });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.failure({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.failure({ message: error.errors[0].message });
    } else {
      return res.failure({ message: error.message });
    }
  }
};

const updateSlabComm = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    const { id, commAmt, commType, amtType } = req.body;

    if (!id) {
      return res.failure({ message: 'slabComm id is required' });
    }

    if (commAmt === undefined && commType === undefined && amtType === undefined) {
      return res.failure({ message: 'At least one of commAmt, commType, or amtType must be provided' });
    }

    // Validate commType if provided
    if (commType !== undefined && !['com', 'sur'].includes(commType)) {
      return res.failure({ message: 'commType must be either "com" or "sur"' });
    }
    if(amtType !== undefined && !['fix', 'per'].includes(amtType)) {
      return res.failure({ message: 'amtType must be either "fix" or "per"' });
    }

    // Validate commAmt if provided
    if (commAmt !== undefined && (isNaN(commAmt) || commAmt < 0)) {
      return res.failure({ message: 'commAmt must be a valid non-negative number' });
    }

    const companyId = req.companyId ?? req.user?.companyId ?? null;

    // Find the slab commission entry
    const slabComm = await dbService.findOne(model.commSlab, {
      id,
      ...(companyId !== null && companyId !== undefined ? { companyId } : {})
    });

    if (!slabComm) {
      return res.failure({ message: 'Slab commission entry not found' });
    }

    // Build update data
    const updateData = {
        updatedBy: req.user.id
      };

    if (commAmt !== undefined) {
      updateData.commAmt = parseFloat(commAmt);
    }

    if (commType !== undefined) {
      updateData.commType = commType;
    }
    if(amtType !== undefined) {
      updateData.amtType = amtType;
    }

    // Update the slab commission
    const updatedSlabComm = await dbService.update(
      model.commSlab,
      { id },
      updateData
    );

    if (!updatedSlabComm || updatedSlabComm.length === 0) {
      return res.failure({ message: 'Failed to update slab commission' });
    }

    return res.success({
      message: 'Slab commission updated successfully',
      data: updatedSlabComm[0]
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.failure({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.failure({ message: error.errors[0].message });
    } else {
      return res.failure({ message: error.message });
    }
  }
};

const createSlab = async (req, res) => {
  try {
    const { slabName, schemaMode, schemaType } = req.body;

    // Validate required fields
    if (!slabName) {
      return res.failure({ 
        message: 'slabName is required' 
      });
    }

    if (!schemaMode) {
      return res.failure({ 
        message: 'schemaMode is required' 
      });
    }

    if (!schemaType) {
      return res.failure({ 
        message: 'schemaType is required' 
      });
    }

    // Validate schemaMode
    if (!['global', 'private'].includes(schemaMode)) {
      return res.failure({ 
        message: 'schemaMode must be either "global" or "private"' 
      });
    }

    // Validate schemaType
    if (!['free', 'premium'].includes(schemaType)) {
      return res.failure({ 
        message: 'schemaType must be either "free" or "premium"' 
      });
    }

    // Get companyId from the user creating the slab
    const companyId = req.companyId ?? req.user?.companyId ?? null;
    
    if (!companyId) {
      return res.failure({ 
        message: 'Company ID is required. User must belong to a company.' 
      });
    }

    // Check if slab with same name already exists for this company
    const existingSlab = await dbService.findOne(model.slab, {
      slabName,
      companyId: companyId
    });

    if (existingSlab) {
      return res.failure({ 
        message: `Slab with name "${slabName}" already exists for this company` 
      });
    }

    const dataToCreate = {
      slabName: slabName,
      schemaMode,
      schemaType,
      companyId: companyId, 
      remark: null,
      isSignUpB2B: false,
      users: [],
      isActive: true,
      addedBy: req.user.id,
      type: req.user.userType
    };

    // Create the slab
    const createdSlab = await dbService.createOne(model.slab, dataToCreate);

    if (!createdSlab) {
      return res.failure({ message: 'Failed to create slab' });
    }

    return res.success({
      message: 'Slab created successfully',
      data: createdSlab
    });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error.message });
    }
  }
};

const getAllSlabs = async (req, res) => {
  try {
    const companyId = req.user.companyId;
    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }
    
    const dataToFind = req.body || {};
    let options = {};
    let query = {
      companyId: companyId,
      isActive: true
    };

    if (dataToFind && dataToFind.query) {
      query = { ...query, ...dataToFind.query };
    }

    if (dataToFind && dataToFind.options !== undefined) {
      options = { ...dataToFind.options };
    }

    if (dataToFind?.customSearch && typeof dataToFind.customSearch === 'object') {
      const keys = Object.keys(dataToFind.customSearch);
      const searchOrConditions = [];

      for (const key of keys) {
        const value = dataToFind.customSearch[key];
        if (value === undefined || value === null || String(value).trim() === '') continue;

        if (key === 'slabName') {
          searchOrConditions.push({
            slabName: {
              [Op.iLike]: `%${String(value).trim()}%`
            }
          });
        }
      }

      if (searchOrConditions.length > 0) {
        if (searchOrConditions.length === 1) {
          Object.assign(query, searchOrConditions[0]);
        } else {
          query[Op.and] = [
            { [Op.or]: searchOrConditions }
          ];
        }
      }
    }

    const allSlabs = await dbService.findAll(model.slab, query, {
      attributes: ['users']
    });

    const allUserIds = new Set();
    if (allSlabs && allSlabs.length > 0) {
      allSlabs.forEach(slab => {
        const users = slab.users || [];
        if (Array.isArray(users) && users.length > 0) {
          users.forEach(userId => {
            if (userId) {
              allUserIds.add(userId);
            }
          });
        }
      });
    }

    const totalUsers = allUserIds.size;

    const result = await dbService.paginate(model.slab, query, {
      ...options,
      select: ['id', 'slabName', 'schemaMode', 'schemaType', 'isActive', 'remark', 'users', 'createdAt', 'updatedAt']
    });

    const processedData = (result?.data || []).map(slab => {
      const slabData = slab.toJSON ? slab.toJSON() : slab;
      const users = slabData.users || [];
      const totalUsersInSlab = Array.isArray(users) ? users.filter(id => id).length : 0;
      
      const { users: _, ...rest } = slabData;
      
      return {
        ...rest,
        totalUsers: totalUsersInSlab
      };
    });

    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Slabs retrieved successfully',
      data: processedData,
      total: result?.total || 0,
      paginator: result?.paginator || {
        page: options.page || 1,
        paginate: options.paginate || 10,
        totalPages: 0
      }
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send({
      status: 'FAILURE',
      message: error.message || 'Internal server error'
    });
  }
};

const assignSlabToCompany = async (req, res) => {
  try {
    const { slabId, companyId } = req.body;
    
    if (req.user.companyId !== companyId && req.user.userRole !== 1) {
      return res.failure({ message: 'You are not authorized to assign this slab to this company' });
    }
    
    if (!slabId) {
      return res.failure({ message: 'slabId is required' });
    }
    
    if (!companyId) {
      return res.failure({ message: 'companyId is required' });
    }

    const slab = await dbService.findOne(model.slab, {
      id: slabId,
      isActive: true
    });

    if (!slab) {
      return res.failure({ message: 'Slab not found' });
    }

    const company = await dbService.findOne(model.company, { id: companyId });
    if (!company) {
      return res.failure({ message: 'Company not found' });
    }

    const companyAdmin = await dbService.findOne(model.user, {
      companyId: companyId,
      userRole: 2,
      isActive: true
    });

    if (!companyAdmin) {
      return res.failure({ message: 'Company admin not found' });
    }

    const isSlabAssigned = companyAdmin.slab === String(slabId);
    const slabUsers = slab.users || [];
    const isUserInSlab = Array.isArray(slabUsers) && slabUsers.includes(companyAdmin.id);

    if (!isSlabAssigned) {
      await dbService.update(
        model.user,
        { id: companyAdmin.id },
        { slabId: slabId }
      );
    }

    if (!isUserInSlab) {
      const updatedUsers = Array.isArray(slabUsers) ? [...slabUsers, companyAdmin.id] : [companyAdmin.id];
      await dbService.update(
        model.slab,
        { id: slabId },
        { users: updatedUsers }
      );
    }

    const originalCompanyId = slab.companyId;
    
    // 1) Try to copy existing commissions from the slab's original company
    if (originalCompanyId !== companyId) {
      const existingCommissions = await dbService.findAll(model.commSlab, {
        slabId: slabId,
        companyId: originalCompanyId
      });

      if (existingCommissions && existingCommissions.length > 0) {
        const existingForNewCompany = await dbService.findAll(model.commSlab, {
          slabId: slabId,
          companyId: companyId
        });

        if (!existingForNewCompany || existingForNewCompany.length === 0) {
          const commissionsToCreate = existingCommissions.map((comm) => {
            const commData = comm.toJSON ? comm.toJSON() : comm;
            return {
              slabId: slabId,
              companyId: companyId,
              operatorId: commData.operatorId,
              operatorName: commData.operatorName,
              operatorType: commData.operatorType,
              roleType: commData.roleType,
              roleName: commData.roleName,
              commAmt: commData.commAmt || 0,
              commType: commData.commType || 'com',
              amtType: commData.amtType || 'fix',
              paymentMode: commData.paymentMode || null,
              addedBy: req.user.id,
              updatedBy: req.user.id
            };
          });

          await dbService.createMany(model.commSlab, commissionsToCreate);
        }
      }
    }

    // 2) If still no commissions for this slab + company, create default ones
    const companyCommissions = await dbService.findAll(model.commSlab, {
      slabId: slabId,
      companyId: companyId
    });

    if (!companyCommissions || companyCommissions.length === 0) {
      const operators = await dbService.findAll(
        model.operator,
        { inSlab: true },
        { select: ['id', 'operatorName', 'operatorType'] }
      );

      if (operators && operators.length > 0) {
        const roleTypes = [1, 2];
        const roleNames = ['AD', 'WU'];

        const defaultCommissions = operators.flatMap((op) =>
          roleTypes.map((roleType, index) => ({
            slabId: slabId,
            companyId: companyId,
            operatorId: op.id,
            operatorName: op.operatorName,
            operatorType: op.operatorType,
            roleType,
            roleName: roleNames[index] || 'RE',
            commAmt: 0,
            commType: 'com',
            amtType: 'fix',
            paymentMode: null,
            addedBy: req.user.id,
            updatedBy: req.user.id
          }))
        );

        if (defaultCommissions.length > 0) {
          await dbService.createMany(model.commSlab, defaultCommissions);
        }
      }
    }

    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Slab assigned to company admin successfully',
      data: {
        slabId: slabId,
        companyId: companyId,
        adminId: companyAdmin.id,
        wasAlreadyAssigned: isSlabAssigned && isUserInSlab
      }
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send({
      status: 'FAILURE',
      message: error.message || 'Internal server error'
    });
  }
};


module.exports = {
  findAllslabComm,
  updateSlabName,
  updateSlabComm,
  createSlab,
  getAllSlabs,
  assignSlabToCompany
};
