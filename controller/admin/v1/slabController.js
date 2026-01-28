const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op, Sequelize } = require('sequelize');
const { USER_TYPES } = require('../../../constants/authConstant');


const processData = (data) => {
  const groupedData = {};

  data.forEach((item) => {
    const key = `${item.slabId}-${item.operatorId}`;

    if (!groupedData[key]) {
      groupedData[key] = {
        slabId: item.slabId,
        operatorId: item.operatorId,
        operatorName: item.operatorName,
        operatorType: item.operatorType,
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
    if (companyId !== null && companyId !== undefined) {
      query = { ...query, companyId };
    }

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

    foundUser = await dbService.findAll(model.commSlab, query, options);

    if (!foundUser || foundUser.length === 0) {
      return res.recordNotFound();
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
      select: ['id', 'slabName', 'schemaMode', 'schemaType', 'remark', 'createdAt', 'updatedAt']
    });

    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Slabs retrieved successfully',
      data: result?.data || [],
      total: result?.total || 0,
      totalUsers: totalUsers,
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
    // Only SUPER_ADMIN can assign global slabs to companies
    if (req.user?.userType !== USER_TYPES.SUPER_ADMIN) {
      return res.failure({ message: 'Only SUPER_ADMIN can assign global slabs to companies' });
    }

    const { globalSlabId, companyId } = req.body;

    if (!globalSlabId || !companyId) {
      return res.badRequest({ 
        message: 'globalSlabId and companyId are required' 
      });
    }

    // Get the creator's companyId to verify the global slab
    const creatorCompanyId = req.user?.companyId;
    if (!creatorCompanyId) {
      return res.badRequest({ message: 'Creator company ID is required' });
    }

    // Verify global slab exists (should belong to the creator's company)
    const globalSlab = await dbService.findOne(model.slab, {
      id: globalSlabId,
      schemaMode: 'global',
      companyId: creatorCompanyId
    });

    if (!globalSlab) {
      return res.badRequest({ 
        message: 'Global slab template not found' 
      });
    }

    // Verify company exists
    const company = await dbService.findOne(model.company, { id: companyId });
    if (!company) {
      return res.badRequest({ 
        message: 'Company not found' 
      });
    }

    // Check if company already has this slab assigned
    const existingCompanySlab = await dbService.findOne(model.slab, {
      slabName: `${company.companyName}.${globalSlab.templateType}`,
      companyId: companyId,
      templateType: globalSlab.templateType
    });

    if (existingCompanySlab) {
      return res.badRequest({ 
        message: `Company already has a slab with template type "${globalSlab.templateType}"` 
      });
    }

    // Create company-specific slab based on global template
    const companySlabName = `${company.companyName}.${globalSlab.templateType}`;
    const companySlabData = {
      slabName: companySlabName,
      templateType: globalSlab.templateType,
      schemaMode: 'private',
      companyId: companyId,
      remark: `Assigned from global template: ${globalSlab.slabName}`,
      isSignUpB2B: false,
      users: null,
      isActive: true,
      addedBy: req.user.id,
      type: req.user.userType
    };

    const createdCompanySlab = await dbService.createOne(model.slab, companySlabData);

    if (!createdCompanySlab) {
      return res.failure({ message: 'Failed to create company slab' });
    }

    // Copy commission structures from global slab (use creator's companyId)
    const globalCommSlabs = await dbService.findAll(model.commSlab, {
      slabId: globalSlabId,
      companyId: creatorCompanyId
    });

    const globalRangeComms = await dbService.findAll(model.rangeCommission, {
      slabId: globalSlabId,
      companyId: creatorCompanyId
    });

    const globalRangeCharges = await dbService.findAll(model.rangeCharges, {
      slabId: globalSlabId,
      companyId: creatorCompanyId
    });

    const globalPgCommercials = await dbService.findAll(model.pgCommercials, {
      slabId: globalSlabId,
      companyId: creatorCompanyId
    });

    // Create company-specific commission entries
    const companyCommSlabs = globalCommSlabs.map(comm => ({
      ...comm.dataValues,
      id: undefined,
      slabId: createdCompanySlab.id,
      companyId: companyId,
      createdAt: undefined,
      updatedAt: undefined
    }));

    const companyRangeComms = globalRangeComms.map(range => ({
      ...range.dataValues,
      id: undefined,
      slabId: createdCompanySlab.id,
      companyId: companyId,
      createdAt: undefined,
      updatedAt: undefined
    }));

    const companyRangeCharges = globalRangeCharges.map(charge => ({
      ...charge.dataValues,
      id: undefined,
      slabId: createdCompanySlab.id,
      companyId: companyId,
      createdAt: undefined,
      updatedAt: undefined
    }));

    const companyPgCommercials = globalPgCommercials.map(pg => ({
      ...pg.dataValues,
      id: undefined,
      slabId: createdCompanySlab.id,
      companyId: companyId,
      createdAt: undefined,
      updatedAt: undefined
    }));

    await Promise.all([
      dbService.createMany(model.commSlab, companyCommSlabs),
      dbService.createMany(model.rangeCommission, companyRangeComms),
      dbService.createMany(model.rangeCharges, companyRangeCharges),
      dbService.createMany(model.pgCommercials, companyPgCommercials)
    ]);

    return res.success({
      message: 'Global slab template assigned to company successfully',
      data: createdCompanySlab
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
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
