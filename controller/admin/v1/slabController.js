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

const createGlobalSlabTemplate = async (req, res) => {
  try {
    // Only SUPER_ADMIN can create global slab templates
    if (req.user?.userType !== USER_TYPES.SUPER_ADMIN) {
      return res.failure({ message: 'Only SUPER_ADMIN can create global slab templates' });
    }

    const { slabName, templateType, slabType, remark } = req.body;

    // Validate required fields
    if (!slabName || !templateType) {
      return res.badRequest({ 
        message: 'slabName and templateType are required' 
      });
    }

    // Validate templateType - only Free (Basic), Gold, and Platinum are allowed
    if (!['Basic', 'Gold', 'Platinum'].includes(templateType)) {
      return res.badRequest({ 
        message: 'templateType must be one of: Basic, Gold, Platinum' 
      });
    }

    // Get companyId from the user creating the slab
    const companyId = req.user?.companyId;
    
    if (!companyId) {
      return res.badRequest({ 
        message: 'Company ID is required. User must belong to a company.' 
      });
    }

    // Check if global slab template with same name and templateType already exists
    const existingSlab = await dbService.findOne(model.slab, {
      slabName,
      templateType,
      slabScope: 'global',
      companyId: companyId
    });

    if (existingSlab) {
      return res.badRequest({ 
        message: `Global slab template "${slabName}" with type "${templateType}" already exists` 
      });
    }

    // Get users for the company - only users with userRole === 2 (Admin/WhiteLabel Admin)
    let usersArray = [];
    if (companyId) {
      const companyUsers = await dbService.findAll(
        model.user,
        { 
          userRole: 2,
          isActive: true
        },
        { select: ['id'] }
      );
      usersArray = companyUsers.map(user => user.id);
    }
    
    const dataToCreate = {
      slabName,
      templateType,
      slabType: slabType || 'level',
      slabScope: 'global',
      companyId: companyId, 
      remark: remark || null,
      isSignUpB2B: false,
      users: usersArray,
      isActive: true,
      addedBy: req.user.id,
      type: req.user.userType
    };

    // Create the global slab template
    const createdSlab = await dbService.createOne(model.slab, dataToCreate);

    if (!createdSlab) {
      return res.failure({ message: 'Failed to create global slab template' });
    }

    // Initialize commission structures (similar to registerService)
    let operators = await dbService.findAll(
      model.operator,
      {},
      { select: ['id', 'operatorName', 'operatorType'] }
    );

    let cardTypes = await dbService.findAll(
      model.cardType,
      {},
      { select: ['id', 'name'] }
    );

    let paymentInstruments = await dbService.findAll(
      model.paymentInstrument,
      {},
      { select: ['id', 'name', 'isCardType'] }
    );


    let roleTypes = [1, 2];
    let roleNames = ['AD', 'WU'];

    let dataToInsert = [];
    let dataToInsertRangeComm = [];
    let dataToInsertRangeCharges = [];
    let dataToInsertPgCommercials = [];

    // Create commission entries for all operators and roles
    operators.forEach((operator) => {
      roleTypes.forEach((roleType, index) => {
        dataToInsert.push({
          slabId: createdSlab.id,
          operatorId: operator.id,
          operatorName: operator.operatorName,
          operatorType: operator.operatorType,
          roleType,
          roleName: roleNames[index],
          commAmt: 0,
          commType: 'com',
          amtType: 'fix',
          companyId: companyId 
        });
      });
    });

    for (const operator of operators) {
      const ranges = await dbService.findAll(
        model.range,
        { operatorType: operator.operatorType },
        { select: ['id', 'min', 'max'] }
      );
      for (const range of ranges) {
        roleTypes.forEach((roleType, index) => {
          dataToInsertRangeComm.push({
            slabId: createdSlab.id,
            operatorId: operator.id,
            operatorName: operator.operatorName,
            operatorType: operator.operatorType,
            rangeId: range.id,
            min: range.min,
            max: range.max,
            roleType,
            roleName: roleNames[index],
            commAmt: 0,
            commType: 'com',
            amtType: 'fix',
            companyId: companyId 
          });
        });
      }
    }

    // Create range charges entries
    for (const operator of operators) {
      const ranges = await dbService.findAll(
        model.range,
        { operatorType: operator.operatorType },
        { select: ['id', 'min', 'max'] }
      );
      for (const range of ranges) {
        roleTypes.forEach((roleType, index) => {
          dataToInsertRangeCharges.push({
            slabId: createdSlab.id,
            operatorId: operator.id,
            operatorName: operator.operatorName,
            operatorType: operator.operatorType,
            rangeId: range.id,
            min: range.min,
            max: range.max,
            roleType,
            roleName: roleNames[index],
            commAmt: 0,
            commType: 'com',
            amtType: 'fix',
            companyId: companyId 
          });
        });
      }
    }

    // Create PG commercial entries
    const payInOperators = operators.filter(
      (op) => op.dataValues.operatorType === 'PayIn'
    );

    for (const operator of payInOperators) {
      for (const roleType of roleTypes) {
        // Only AD (roleType 1) and WU (roleType 2) are used
        const roleNameValue = roleType === 1 ? 'AD' : roleType === 2 ? 'WU' : '';

        for (const paymentInstrument of paymentInstruments) {
          if (paymentInstrument.isCardType) {
            for (const cardType of cardTypes) {
              dataToInsertPgCommercials.push({
                slabId: createdSlab.id,
                operatorId: operator.id,
                operatorName: operator.operatorName,
                operatorType: operator.operatorType,
                roleType,
                roleName: roleNameValue,
                commAmt: 0,
                commType: 'com',
                amtType: 'fix',
                paymentInstrumentId: paymentInstrument.id,
                paymentInstrumentName: paymentInstrument.name,
                cardTypeId: cardType.id,
                cardTypeName: cardType.name,
                companyId: companyId 
              });
            }
          } else {
            dataToInsertPgCommercials.push({
              slabId: createdSlab.id,
              operatorId: operator.id,
              operatorName: operator.operatorName,
              operatorType: operator.operatorType,
              roleType,
              roleName: roleNameValue,
              commAmt: 0,
              commType: 'com',
              amtType: 'fix',
              paymentInstrumentId: paymentInstrument.id,
              paymentInstrumentName: paymentInstrument.name,
              cardTypeId: null,
              cardTypeName: null,
              companyId: companyId // Use the companyId of the user creating the slab
            });
          }
        }
      }
    }

    await Promise.all([
      dbService.createMany(model.commSlab, dataToInsert),
      dbService.createMany(model.rangeCommission, dataToInsertRangeComm),
      dbService.createMany(model.rangeCharges, dataToInsertRangeCharges)
    ]);

    if (dataToInsertPgCommercials.length > 0) {
      await dbService.createMany(
        model.pgCommercials,
        dataToInsertPgCommercials
      );
    }

    return res.success({
      message: 'Global slab template created successfully',
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

const getAllGlobalSlabTemplates = async (req, res) => {
  try {
    // Only SUPER_ADMIN can view global slab templates
    if (req.user?.userType !== USER_TYPES.SUPER_ADMIN) {
      return res.failure({ message: 'Only SUPER_ADMIN can view global slab templates' });
    }

    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.badRequest({ message: 'Company ID is required' });
    }

    const globalSlabs = await dbService.findAll(
      model.slab,
      {
        slabScope: 'global',
        companyId: companyId,
        isActive: true
      },
      {
        select: ['id', 'slabName', 'templateType', 'slabType', 'remark', 'createdAt', 'updatedAt'],
        order: [['templateType', 'ASC'], ['slabName', 'ASC']]
      }
    );

    if (!globalSlabs || globalSlabs.length === 0) {
      return res.success({
        message: 'No global slab templates found',
        data: []
      });
    }

    return res.success({
      message: 'Global slab templates retrieved successfully',
      data: globalSlabs
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

const assignGlobalSlabToCompany = async (req, res) => {
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
      slabScope: 'global',
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
      slabType: globalSlab.slabType,
      slabScope: 'private',
      companyId: companyId,
      remark: `Assigned from global template: ${globalSlab.slabName}`,
      isSignUpB2B: false,
      users: [],
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

const createCompanySlab = async (req, res) => {
  try {
    // Only ADMIN (Company/WhiteLabel) can create company slabs
    if (req.user?.userType !== USER_TYPES.ADMIN && req.user?.userType !== USER_TYPES.WHITELABEL_ADMIN) {
      return res.failure({ message: 'Only Company Admin can create company slabs' });
    }

    const { slabName, templateType, slabType, remark } = req.body;
    const companyId = req.user?.companyId;

    if (!companyId) {
      return res.badRequest({ message: 'Company ID not found' });
    }

    // Validate required fields
    if (!slabName || !templateType) {
      return res.badRequest({ 
        message: 'slabName and templateType are required' 
      });
    }

    // Validate templateType - only Free (Basic), Gold, and Platinum are allowed
    if (!['Basic', 'Gold', 'Platinum'].includes(templateType)) {
      return res.badRequest({ 
        message: 'templateType must be one of: Basic, Gold, Platinum' 
      });
    }

    // Get company name for slab naming
    const company = await dbService.findOne(model.company, { id: companyId });
    if (!company) {
      return res.badRequest({ message: 'Company not found' });
    }

    // Check if company slab with same templateType already exists
    const existingSlab = await dbService.findOne(model.slab, {
      companyId: companyId,
      templateType: templateType,
      slabScope: 'private'
    });

    if (existingSlab) {
      return res.badRequest({ 
        message: `Company already has a slab with template type "${templateType}"` 
      });
    }

    // Create company slab name: CompanyName.TemplateType
    const companySlabName = slabName || `${company.companyName}.${templateType}`;

    const dataToCreate = {
      slabName: companySlabName,
      templateType,
      slabType: slabType || 'level',
      slabScope: 'private',
      companyId: companyId,
      remark: remark || null,
      isSignUpB2B: false,
      users: [],
      isActive: true,
      addedBy: req.user.id,
      type: req.user.userType
    };

    // Create the company slab
    const createdSlab = await dbService.createOne(model.slab, dataToCreate);

    if (!createdSlab) {
      return res.failure({ message: 'Failed to create company slab' });
    }

    // Initialize commission structures
    let operators = await dbService.findAll(
      model.operator,
      {},
      { select: ['id', 'operatorName', 'operatorType'] }
    );

    let cardTypes = await dbService.findAll(
      model.cardType,
      {},
      { select: ['id', 'name'] }
    );

    let paymentInstruments = await dbService.findAll(
      model.paymentInstrument,
      {},
      { select: ['id', 'name', 'isCardType'] }
    );

    let roleTypes = [1, 2, 3, 4, 5];
    let roleNames = ['AD', 'WU', 'MD', 'DI', 'RE'];

    let dataToInsert = [];
    let dataToInsertRangeComm = [];
    let dataToInsertRangeCharges = [];
    let dataToInsertPgCommercials = [];

    operators.forEach((operator) => {
      roleTypes.forEach((roleType, index) => {
        dataToInsert.push({
          slabId: createdSlab.id,
          operatorId: operator.id,
          operatorName: operator.operatorName,
          operatorType: operator.operatorType,
          roleType,
          roleName: roleNames[index],
          commAmt: 0,
          commType: 'com',
          amtType: 'fix',
          companyId: companyId
        });
      });
    });

    for (const operator of operators) {
      const ranges = await dbService.findAll(
        model.range,
        { operatorType: operator.operatorType },
        { select: ['id', 'min', 'max'] }
      );
      for (const range of ranges) {
        roleTypes.forEach((roleType, index) => {
          dataToInsertRangeComm.push({
            slabId: createdSlab.id,
            operatorId: operator.id,
            operatorName: operator.operatorName,
            operatorType: operator.operatorType,
            rangeId: range.id,
            min: range.min,
            max: range.max,
            roleType,
            roleName: roleNames[index],
            commAmt: 0,
            commType: 'com',
            amtType: 'fix',
            companyId: companyId
          });
        });
      }
    }

    for (const operator of operators) {
      const ranges = await dbService.findAll(
        model.range,
        { operatorType: operator.operatorType },
        { select: ['id', 'min', 'max'] }
      );
      for (const range of ranges) {
        roleTypes.forEach((roleType, index) => {
          dataToInsertRangeCharges.push({
            slabId: createdSlab.id,
            operatorId: operator.id,
            operatorName: operator.operatorName,
            operatorType: operator.operatorType,
            rangeId: range.id,
            min: range.min,
            max: range.max,
            roleType,
            roleName: roleNames[index],
            commAmt: 0,
            commType: 'com',
            amtType: 'fix',
            companyId: companyId
          });
        });
      }
    }

    const payInOperators = operators.filter(
      (op) => op.dataValues.operatorType === 'PayIn'
    );

    for (const operator of payInOperators) {
      for (const roleType of roleTypes) {
        const roleNameValue =
          roleType === 1 ? 'AD'
            : roleType === 2 ? 'AD'
              : roleType === 3 ? 'MD'
                : roleType === 4 ? 'DI'
                  : roleType === 5 ? 'RE'
                    : '';

        for (const paymentInstrument of paymentInstruments) {
          if (paymentInstrument.isCardType) {
            for (const cardType of cardTypes) {
              dataToInsertPgCommercials.push({
                slabId: createdSlab.id,
                operatorId: operator.id,
                operatorName: operator.operatorName,
                operatorType: operator.operatorType,
                roleType,
                roleName: roleNameValue,
                commAmt: 0,
                commType: 'com',
                amtType: 'fix',
                paymentInstrumentId: paymentInstrument.id,
                paymentInstrumentName: paymentInstrument.name,
                cardTypeId: cardType.id,
                cardTypeName: cardType.name,
                companyId: companyId
              });
            }
          } else {
            dataToInsertPgCommercials.push({
              slabId: createdSlab.id,
              operatorId: operator.id,
              operatorName: operator.operatorName,
              operatorType: operator.operatorType,
              roleType,
              roleName: roleNameValue,
              commAmt: 0,
              commType: 'com',
              amtType: 'fix',
              paymentInstrumentId: paymentInstrument.id,
              paymentInstrumentName: paymentInstrument.name,
              cardTypeId: null,
              cardTypeName: null,
              companyId: companyId
            });
          }
        }
      }
    }

    await Promise.all([
      dbService.createMany(model.commSlab, dataToInsert),
      dbService.createMany(model.rangeCommission, dataToInsertRangeComm),
      dbService.createMany(model.rangeCharges, dataToInsertRangeCharges)
    ]);

    if (dataToInsertPgCommercials.length > 0) {
      await dbService.createMany(
        model.pgCommercials,
        dataToInsertPgCommercials
      );
    }

    return res.success({
      message: 'Company slab created successfully',
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

const getAllCompanySlabs = async (req, res) => {
  try {
    // Only ADMIN (Company/WhiteLabel) can view company slabs
    if (req.user?.userType !== USER_TYPES.ADMIN && req.user?.userType !== USER_TYPES.WHITELABEL_ADMIN) {
      return res.failure({ message: 'Only Company Admin can view company slabs' });
    }

    const companyId = req.user?.companyId;

    if (!companyId) {
      return res.badRequest({ message: 'Company ID not found' });
    }

    const companySlabs = await dbService.findAll(
      model.slab,
      {
        companyId: companyId,
        slabScope: 'private',
        isActive: true
      },
      {
        select: ['id', 'slabName', 'templateType', 'slabType', 'remark', 'createdAt', 'updatedAt'],
        order: [['templateType', 'ASC'], ['slabName', 'ASC']]
      }
    );

    if (!companySlabs || companySlabs.length === 0) {
      return res.success({
        message: 'No company slabs found',
        data: []
      });
    }

    return res.success({
      message: 'Company slabs retrieved successfully',
      data: companySlabs
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

module.exports = {
  findAllslabComm,
  createGlobalSlabTemplate,
  getAllGlobalSlabTemplates,
  assignGlobalSlabToCompany,
  createCompanySlab,
  getAllCompanySlabs
};
