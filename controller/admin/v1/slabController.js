const { slab, commSlab, role } = require('../../../models/index');
const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt');
const { USER_TYPES } = require('../../../constants/authConstant');

const registerService = async (req, res) => {
  try {
    let permissions = req.permission || [];
    
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 13 &&
        permission.dataValues.write === true
    );
    
    // Temporary bypass for SUPER_ADMIN - remove this after fixing permissions
    if (req.user?.userType === USER_TYPES.SUPER_ADMIN) {
      hasPermission = true;
    }

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    // Only SUPER_ADMIN can create slabs
    if (req.user?.userType !== USER_TYPES.SUPER_ADMIN) {
      return res.failure({ message: 'Only SUPER_ADMIN can create slabs' });
    }

    let dataToCreate = { ...(req.body || {}) };
    const companyId = req.user?.companyId ;
    // Set default slabType if not provided
    if (!dataToCreate.slabType) {
      dataToCreate.slabType = 'level'; // Default to 'level' type
    }

    // Set default slabScope if not provided
    if (!dataToCreate.slabScope) {
      dataToCreate.slabScope = 'private'; // Default to 'private' scope
    }

    // Validate slabType
    if (!['level', 'channel'].includes(dataToCreate.slabType)) {
      return res.failure({ message: 'slabType must be either "level" or "channel"' });
    }

    // Validate slabScope
    if (!['global', 'private'].includes(dataToCreate.slabScope)) {
      return res.failure({ message: 'slabScope must be either "global" or "private"' });
    }

    // For global slabs, companyId should be null
    if (dataToCreate.slabScope === 'global') {
      dataToCreate.companyId = null;
    } else {
      // For private slabs, use the companyId from request
      dataToCreate.companyId = companyId;
    }

    dataToCreate = {
      ...dataToCreate,
      companyId: companyId,
      isActive: true,
      addedBy: req.user.id,
      type: req.user.userType
    };

    if (dataToCreate.isSignUpB2B) {
      let findQuery = { isSignUpB2B: true };
      if (dataToCreate.slabScope === 'private' && dataToCreate.companyId !== null && dataToCreate.companyId !== undefined) {
        findQuery.companyId = dataToCreate.companyId;
      }
      let datas = await dbService.findOne(slab, findQuery);
      if (datas) {
        return res.failure({ message: 'Only one isSignUp can be True!' });
      }
    }

    let createdUser = await dbService.createOne(slab, dataToCreate);
    if (!createdUser) {
      return res.failure({ message: 'Create Slab failed' });
    }

    let userToReturn = {
      ...createdUser.dataValues
    };

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

    let roleTypes;
    let roleNames;

    // Updated role mapping based on user requirements:
    // 1-SUPERADMIN, 2-ADMIN(company_Admin(Whitelable)), 3-MASTER_DISTRIBUTOR, 4-DISTRIBUTOR, 5-RETAILER
    // AD = White label (Admin), MD = Master Distributor, DI = Distributor, RE = Retailer
    roleTypes = [1, 2, 3, 4, 5];
    roleNames = ['AD', 'WU', 'MD', 'DI', 'RE'];

    let dataToInsert = [];
    let dataToInsertRangeComm = [];
    let dataToInsertRangeCharges = [];
    let dataToInsertPgCommercials = [];

    operators.forEach((operator) => {
      roleTypes.forEach((roleType, index) => {
        dataToInsert.push({
          slabId: createdUser.id,
          operatorId: operator.id,
          operatorName: operator.operatorName,
          operatorType: operator.operatorType,
          roleType,
          roleName: roleNames[index],
          commAmt: 0,
          commType: 'com',
          amtType: 'fix',
          companyId: roleType === 1 ? null : dataToCreate.companyId // AD (Super Admin) has no companyId, others have companyId
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
            slabId: createdUser.id,
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
            companyId: roleType === 1 ? null : dataToCreate.companyId // AD (Super Admin) has no companyId, others have companyId
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
            slabId: createdUser.id,
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
            companyId: roleType === 1 ? null : dataToCreate.companyId // AD (Super Admin) has no companyId, others have companyId
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
          roleType === 1
            ? 'AD'  // Super Admin
            : roleType === 2
              ? 'AD'  // Admin (White label)
              : roleType === 3
                ? 'MD'  // Master Distributor
                : roleType === 4
                  ? 'DI'  // Distributor  
                  : roleType === 5
                    ? 'RE'  // Retailer
                    :'';

        for (const paymentInstrument of paymentInstruments) {
          const existingPgCommercial = await dbService.findOne(
            model.pgCommercials,
            {
              slabId: createdUser.id,
              operatorId: operator.id,
              roleType,
              paymentInstrumentId: paymentInstrument.id,
              companyId: dataToCreate.companyId
            }
          );

          if (!existingPgCommercial) {
            if (paymentInstrument.isCardType) {
              for (const cardType of cardTypes) {
                dataToInsertPgCommercials.push({
                  slabId: createdUser.id,
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
                  companyId: roleType === 1 ? null : dataToCreate.companyId // AD (Super Admin) has no companyId, others have companyId
                });
              }
            } else {
              dataToInsertPgCommercials.push({
                slabId: createdUser.id,
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
                companyId: roleType === 1 ? null : dataToCreate.companyId // AD (Super Admin) has no companyId, others have companyId
              });
            }
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
      message: 'New Slab Created Successfully',
      data: userToReturn
    });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error });
    }
  }
};

const updateService = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 27 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    let dataToCreate = { ...(req.body || {}) };

    const slabId = dataToCreate.slabId;
    const operatorId = dataToCreate.operatorId;
    const roleType = dataToCreate.roleType;
    const id = dataToCreate.id;

    let query = {};

    query = {
      slabId: slabId,
      operatorId: operatorId,
      roleType: roleType
    };

    const slabData = await dbService.findOne(model.slab, { id: slabId });
    if (!slabData) {
      return res.badRequest({ message: 'Slab not found!' });
    }
    const operator = await dbService.findOne(model.operator, {
      id: operatorId
    });
    if (!operator) {
      return res.badRequest({ message: 'Operator not found!' });
    }
    const slabComm = await dbService.findOne(model.commSlab, { id });
    if (!slabComm) {
      return res.success({
        message: 'Failed to update Data! '
      });
    }
    dataToCreate = {
      ...dataToCreate,
      updatedBy: req.user.id
    };
    let updatedpakackge = await dbService.update(
      model.commSlab,
      { id: slabComm.id },
      dataToCreate
    );
    return res.success({
      message: 'Data updated successfully!',
      data: updatedpakackge
    });
  } catch (error) {
    console.error(error);
    return res.internalServerError({ message: error.message });
  }
};

const findAllService = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 27 &&
        permission.dataValues.read === true
    );

    let dataToFind = req.body;
    const companyId = req.companyId ?? req.user?.companyId ?? null;
    let options = {};
    let query = {};
    let foundUser;

    if (dataToFind && dataToFind.query) {
      query = dataToFind.query;
    }
    if (companyId !== null && companyId !== undefined) {
      query = { ...query, companyId };
    }

    if (dataToFind && dataToFind.isCountOnly) {
      foundUser = await dbService.count(slab, query);
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
            sequelize.where(sequelize.cast(sequelize.col(key), 'varchar'), {
              $iLike: `%${dataToFind.customSearch[key]}%`
            })
          );
        } else {
          orConditions.push({
            [key]: {
              $iLike: `%${dataToFind.customSearch[key]}%`
            }
          });
        }
      });

      if (orConditions.length > 0) {
        query = {
          ...query,
          ['$or']: orConditions
        };
      }
    }

    options = {
      ...options,
      roleType: 1
    };
    if (hasPermission) {
      foundUser = await dbService.smspaginate(slab, query, options);
    } else {
      query = {
        ...query,
        addedBy: req.user.id
      };
      foundUser = await dbService.smspaginate(slab, query, options);
    }
    if (!foundUser || foundUser.length === 0) {
      return res.recordNotFound();
    }
    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Your request is successfully executed',
      data: foundUser.data,
      total: foundUser.total
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ data: error.message });
  }
};

const getAllSlab = async (req, res) => {
  try {
    const companyId = req.companyId ?? req.user?.companyId ?? null;
    const foundSlab = await dbService.findAll(
      slab,
      companyId !== null && companyId !== undefined ? {
        [Op.or]: [
          { companyId: companyId },
          { companyId: null } // Include global slabs
        ]
      } : {},
      {
        select: ['slabName', 'id'],
        sort: {
          id: 1 // {1 - ASC & @- DESC}
        }
      }
    );
    if (!foundSlab || foundSlab.length === 0) {
      return res.recordNotFound();
    }
    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Your request is successfully executed',
      data: foundSlab
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ data: error.message });
  }
};

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
        permission.dataValues.permissionId === 27 &&
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
            sequelize.where(sequelize.cast(sequelize.col(key), 'varchar'), {
              $iLike: `%${dataToFind.customSearch[key]}%`
            })
          );
        } else {
          orConditions.push({
            [key]: {
              $iLike: `%${dataToFind.customSearch[key]}%`
            }
          });
        }
      });

      if (orConditions.length > 0) {
        query = {
          ...query,
          ['$or']: orConditions
        };
      }
    }

    foundUser = await dbService.findAll(model.pgCommercials, query, options);

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
const findAllRechargeSlabComm = async (req, res) => {
  try {
    let dataToFind = req.body;
    const companyId = req.companyId ?? req.user?.companyId ?? null;
    let options = { order: [['id', 'ASC']] };
    let query = {};

    if (dataToFind?.query) {
      query = dataToFind.query;
    }
    if (companyId !== null && companyId !== undefined) {
      query = { ...query, companyId };
    }
    if (dataToFind?.isCountOnly) {
      const countRechargeSlab = await dbService.count(model.commSlab, {
        ...query,
        operatorType: {
          [Op.in]: ['Prepaid', 'Postpaid', 'DTH']
        }
      });
      return res.success({
        data: countRechargeSlab || 0
      });
    }
    if (dataToFind?.options !== undefined) {
      options = dataToFind.options;
    }
    if (dataToFind?.customSearch) {
      const keys = Object.keys(dataToFind.customSearch);
      const orConditions = [];

      keys.forEach((key) => {
        if (typeof dataToFind.customSearch[key] === 'number') {
          orConditions.push(
            sequelize.where(sequelize.cast(sequelize.col(key), 'varchar'), {
              $iLike: `%${dataToFind.customSearch[key]}%`
            })
          );
        } else {
          orConditions.push({
            [key]: {
              $iLike: `%${dataToFind.customSearch[key]}%`
            }
          });
        }
      });

      if (orConditions.length > 0) {
        query = { ...query, ['$or']: orConditions };
      }
    }
    const foundCommSlab = await dbService.findAll(
      model.commSlab,
      {
        ...query,
        operatorType: {
          [Op.in]: ['Prepaid', 'Postpaid', 'DTH']
        }
      },
      options
    );

    if (!foundCommSlab || foundCommSlab.length === 0) {
      return res.recordNotFound();
    }
    const formattedCommSlab = processData(foundCommSlab);
    return res.success({
      message: 'Your request is successfully executed',
      data: formattedCommSlab
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ data: error.message });
  }
};

const bbpsSlabComm = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 27 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    let dataToFind = req.body;
    const companyId = req.companyId ?? req.user?.companyId ?? null;
    let options = { order: [['id', 'ASC']] };
    let query = { operatorType: 'BBPS' };
    let foundUser;

    if (dataToFind && dataToFind.query) {
      query = {
        ...query,
        ...dataToFind.query
      };
    }
    if (companyId !== null && companyId !== undefined) {
      query = { ...query, companyId };
    }

    if (dataToFind && dataToFind.isCountOnly) {
      foundUser = await dbService.count(model.commSlab, query);
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
            sequelize.where(sequelize.cast(sequelize.col(key), 'varchar'), {
              $iLike: `%${dataToFind.customSearch[key]}%`
            })
          );
        } else {
          orConditions.push({
            [key]: {
              $iLike: `%${dataToFind.customSearch[key]}%`
            }
          });
        }
      });

      if (orConditions.length > 0) {
        query = {
          ...query,
          ['$or']: orConditions
        };
      }
    }

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

const creditCardSlabComm = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 27 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    let dataToFind = req.body;
    const companyId = req.companyId;
    let options = { order: [['id', 'ASC']] };
    let query = { operatorType: 'Credit Card' };
    let foundUser;

    if (dataToFind && dataToFind.query) {
      query = {
        ...query,
        ...dataToFind.query
      };
    }
    query = { ...query, companyId };

    if (dataToFind && dataToFind.isCountOnly) {
      foundUser = await dbService.count(model.commSlab, query);
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
            sequelize.where(sequelize.cast(sequelize.col(key), 'varchar'), {
              $iLike: `%${dataToFind.customSearch[key]}%`
            })
          );
        } else {
          orConditions.push({
            [key]: {
              $iLike: `%${dataToFind.customSearch[key]}%`
            }
          });
        }
      });

      if (orConditions.length > 0) {
        query = {
          ...query,
          ['$or']: orConditions
        };
      }
    }

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

const zaakpaySlabComm = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 27 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    let dataToFind = req.body;
    const companyId = req.companyId;
    let options = { order: [['id', 'ASC']] };
    let query = {
      operatorType: 'PayIn',
      operatorName: { [Op.iLike]: 'Zaakpay%' }
    };
    let foundUser;

    if (dataToFind && dataToFind.query) {
      query = {
        ...query,
        ...dataToFind.query
      };
    }
    query = { ...query, companyId };

    if (dataToFind && dataToFind.isCountOnly) {
      foundUser = await dbService.count(model.commSlab, query);
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
            sequelize.where(sequelize.cast(sequelize.col(key), 'varchar'), {
              $iLike: `%${dataToFind.customSearch[key]}%`
            })
          );
        } else {
          orConditions.push({
            [key]: {
              $iLike: `%${dataToFind.customSearch[key]}%`
            }
          });
        }
      });

      if (orConditions.length > 0) {
        query = {
          ...query,
          ['$or']: orConditions
        };
      }
    }

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
const getService = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 27 &&
        permission.dataValues.read === true
    );

    let foundUser;
    if (hasPermission) {
      foundUser = await dbService.findOne(slab, { id: req.params.id });
    } else {
      foundUser = await dbService.findOne(slab, {
        id: req.params.id,
        addedBy: req.user.id
      });
    }
    if (!foundUser) {
      return res.recordNotFound();
    }
    return res.success({ data: foundUser });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

const partialUpdateService = async (req, res) => {
  try {
    const permissions = req.permission;
    const hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 27 &&
        permission.dataValues.write === true
    );
    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    const dataToUpdate = { ...req.body };
    const existingSlab = await dbService.findOne(model.slab, {
      id: req.params.id
    });

    if (!existingSlab) {
      return res.failure({ message: 'Slab not found!' });
    }

    let updatedSlab;
    if (dataToUpdate.isSignUpB2B === true) {
      const existingB2BSlab = await dbService.findOne(model.slab, {
        isSignUpB2B: true
      });

      if (existingB2BSlab && existingB2BSlab.id !== existingSlab.id) {
        await dbService.update(
          model.slab,
          { id: existingB2BSlab.id },
          { isSignUpB2B: false }
        );
      }
    }

    updatedSlab = await dbService.update(
      model.slab,
      { id: req.params.id },
      dataToUpdate
    );

    return res.success({ data: updatedSlab[0] });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error.message });
    }
  }
};

const deleteService = async (req, res) => {
  try {
    const permissions = req.permission;
    const hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 27 &&
        permission.dataValues.write === true
    );
    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    const foundApi = await dbService.findOne(news, {
      id: req.params.id
    });

    if (!foundApi) {
      return res.recordNotFound();
    }

    let dataToUpdate = {
      isActive: false,
      isDelete: true,
      updatedBy: req.user.id
    };

    let deletedAPI;
    deletedAPI = await dbService.update(
      slab,
      { id: foundApi.id },
      dataToUpdate
    );

    return res.success({
      msg: 'Record has been deleted successfully',
      data: deletedAPI
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError();
  }
};

const createRecharge = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 27 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    let dataToCreate = { ...(req.body || {}) };
    const companyId = req.companyId;

    const slabId = dataToCreate.slabId;
    const operatorId = dataToCreate.operatorId;
    const roleType = dataToCreate.roleType;
    const id = dataToCreate.id;

    if (roleType > 10 || roleType < 1) {
      return res.failure({ message: 'Role Type Should be Between 2 - 10' });
    }

    let query = {};

    query = {
      slabId: slabId,
      operatorId: operatorId,
      roleType: roleType,
      companyId
    };

    const slabData = await dbService.findOne(model.slab, { id: slabId });
    if (!slabData) {
      return res.badRequest({ message: 'Slab not found!' });
    }
    const operator = await dbService.findOne(model.operator, {
      id: operatorId
    });
    if (!operator) {
      return res.badRequest({ message: 'Operator not found!' });
    }

    const slabComm = await dbService.findOne(model.pgCommercials, id);

    if (slabComm) {
      dataToCreate = {
        ...dataToCreate,
        updatedBy: req.user.id
      };
      let updatedpakackge = await dbService.update(
        model.pgCommercials,
        { id: slabComm.id },
        dataToCreate
      );
      return res.success({
        message: 'Data is updated Successfully! ',
        data: updatedpakackge
      });
    } else {
      dataToCreate = {
        ...dataToCreate,
        isActive: true,
        addedBy: req.user.id,
        operatorType: operator.operatorType
      };

      const createdPackage = await dbService.createOne(
        model.pgCommercials,
        dataToCreate
      );

      res.success({
        message: 'Data is Created Successfully! ',
        data: createdPackage
      });
    }
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error });
    }
  }
};

const createBulkRecharge = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 27 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    const { slabId, operatorType, roleType, commAmt, commType, amtType } =
      req.body;
    const companyId = req.companyId;

    const slabExist = await dbService.findOne(model.slab, {
      id: slabId,
      companyId
    });

    if (!slabExist) {
      return res.badRequest({ message: `Slab doesn't Exist!` });
    }

    const operators = await dbService.findAll(
      model.commSlab,
      {
        operatorType: operatorType,
        slabId,
        roleType,
        companyId
      },
      { select: ['operatorId'] }
    );

    if (!Array.isArray(operators)) {
      return res.status(400).json({
        success: false,
        message: 'operators should be an array of operator IDs'
      });
    }

    const promises = operators.map(async (operator) => {
      let slabComm = await dbService.update(
        model.commSlab,
        {
          slabId,
          operatorId: operator.dataValues.operatorId,
          roleType
        },
        {
          commAmt,
          commType,
          amtType
        }
      );

      return slabComm;
    });

    const results = await Promise.all(promises);

    return res.status(200).json({
      status: 'SUCCESS',
      message: 'SlabComm entries processed successfully',
      data: results
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while processing the SlabComm entries',
      error: error.message
    });
  }
};

const createDth = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 27 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    let dataToCreate = { ...(req.body || {}) };
    const companyId = req.companyId;

    const slabId = dataToCreate.slabId;
    const operatorId = dataToCreate.operatorId;
    const roleType = dataToCreate.roleType;

    if (roleType > 10 || roleType < 1) {
      return res.failure({ message: 'Role Type Should be Between 2 - 10' });
    }

    let query = {};

    query = {
      slabId: slabId,
      operatorId: operatorId,
      roleType: roleType,
      companyId
    };

    const slabData = await dbService.findOne(model.slab, {
      id: slabId,
      companyId
    });
    if (!slabData) {
      return res.badRequest({ message: 'Slab not found!' });
    }
    const operator = await dbService.findOne(model.operator, {
      id: operatorId
    });
    if (!operator) {
      return res.badRequest({ message: 'Operator not found!' });
    }

    const slabComm = await dbService.findOne(model.commSlab, query);

    if (slabComm) {
      dataToCreate = {
        ...dataToCreate,
        updatedBy: req.user.id
      };
      let updatedpakackge = await dbService.update(
        model.commSlab,
        { id: slabComm.id },
        dataToCreate
      );
      return res.success({
        message: 'Data is updated Successfully! ',
        data: updatedpakackge
      });
    } else {
      dataToCreate = {
        ...dataToCreate,
        isActive: true,
        addedBy: req.user.id,
        operatorType: operator.operatorType
      };

      const createdPackage = await dbService.createOne(
        model.commSlab,
        dataToCreate
      );

      res.success({
        message: 'Data is Created Successfully! ',
        data: createdPackage
      });
    }
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error });
    }
  }
};

const getSlabUser = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 27 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }
    let dataToFind = req.body;
    const companyId = req.companyId;
    let options = {};
    let query = {};
    let foundUser;

    if (dataToFind && dataToFind.query) {
      query = dataToFind.query;
    }
    query = { ...query, companyId };

    if (dataToFind && dataToFind.isCountOnly) {
      foundUser = await dbService.count(commSlab, query);
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
            sequelize.where(sequelize.cast(sequelize.col(key), 'varchar'), {
              $iLike: `%${dataToFind.customSearch[key]}%`
            })
          );
        } else {
          orConditions.push({
            [key]: {
              $iLike: `%${dataToFind.customSearch[key]}%`
            }
          });
        }
      });

      if (orConditions.length > 0) {
        query = {
          ...query,
          ['$or']: orConditions
        };
      }
    }

    const slab = await dbService.findOne(
      model.slab,
      { id: req.params.id },
      { select: ['users'] }
    );
    if (!slab) {
      return res.recordNotFound();
    }

    const usersArray = slab.dataValues.users;
    if (!usersArray || usersArray.length === 0) {
      return res.recordNotFound();
    }

    query.id = usersArray;

    foundUser = await dbService.paginate(model.user, query, options);

    if (!foundUser || foundUser.length === 0) {
      return res.recordNotFound();
    }

    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Your request is successfully executed',
      data: foundUser.data,
      total: foundUser.total
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ data: error.message });
  }
};

const updateSlabUser = async (req, res) => {
  try {
    const permissions = req.permission;
    const hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 27 &&
        permission.dataValues.write === true
    );
    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    const dataToUpdate = { ...req.body };
    const existingSlab = await dbService.findOne(model.slab, {
      id: req.params.id
    });

    if (!existingSlab) {
      return res.failure({ message: 'Slab not found!' });
    }

    const userId = dataToUpdate.userId;
    const user = await dbService.findOne(model.user, { id: req.user.id });
    const pin = dataToUpdate.secureKey;

    if (!user.secureKey) {
      return res.failure({
        message: 'User does not have a secure key, Please Create One'
      });
    }

    if (!pin) {
      return res.failure({ message: 'Please Enter Pin' });
    }

    if (pin) {
      let isPinMatched = await bcrypt.compare(pin, user.secureKey);
      if (!isPinMatched) {
        return res.failure({
          message: 'Incorrect Pin'
        });
      }
    } else {
      return res.failure({
        message: 'Please Provide Pin'
      });
    }

    const currentSlab = await dbService.findOne(model.slab, {
      users: { [Op.contains]: [userId] }
    });

    if (currentSlab) {
      currentSlab.users = currentSlab.users.filter((id) => id !== userId);
      await dbService.update(
        model.slab,
        { id: currentSlab.id },
        { users: currentSlab.users }
      );
    }

    existingSlab.users.push(userId);
    await dbService.update(
      model.slab,
      { id: existingSlab.id },
      { users: existingSlab.users }
    );

    const updatedUser = await dbService.update(
      model.user,
      { id: userId },
      { slab: existingSlab.slabName }
    );

    return res.success({
      message: 'User slab updated successfully!',
      data: updatedUser
    });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error.message });
    }
  }
};

// ============================================
// SUPERADMIN GLOBAL SLAB TEMPLATE FUNCTIONS
// ============================================

/**
 * Create Global Slab Template (SuperAdmin only)
 * Creates a global slab template (Basic, Gold, Platinum, Custom) that can be assigned to companies
 */
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
    
    // If no users with userRole === 2 found, keep users array empty
    // usersArray will remain [] if no matching users found

    const dataToCreate = {
      slabName,
      templateType,
      slabType: slabType || 'level',
      slabScope: 'global',
      companyId: companyId, // Use the companyId of the user creating the slab
      remark: remark || null,
      isSignUpB2B: false,
      users: usersArray, // Include whitelabel user id or company user id
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

    // Only use role types 1 and 2 (AD, WU) for global slab templates
    // No need for MD, DI, RE in admin controller
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
          companyId: companyId // Use the companyId of the user creating the slab
        });
      });
    });

    // Create range commission entries
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
            companyId: companyId // Use the companyId of the user creating the slab
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
            companyId: companyId // Use the companyId of the user creating the slab
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
                companyId: companyId // Use the companyId of the user creating the slab
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

/**
 * Get All Global Slab Templates (SuperAdmin)
 * Returns all global slab templates that can be assigned to companies
 */
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
        companyId: companyId, // Filter by the user's companyId
        isActive: true,
        isDeleted: false
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

/**
 * Assign Global Slab Template to Company (SuperAdmin)
 * Creates a company-specific copy of a global slab template
 */
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

// ============================================
// COMPANY SLAB FUNCTIONS
// ============================================

/**
 * Create Company Slab (Company Admin only)
 * Creates a company-specific slab (Company.Basic, Company.Gold, etc.)
 */
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

/**
 * Get All Company Slabs (Company Admin)
 * Returns all slabs belonging to the company
 */
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
        isActive: true,
        isDeleted: false
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
  registerService,
  updateService,
  findAllService,
  getService,
  partialUpdateService,
  deleteService,
  createBulkRecharge,
  createDth,
  createRecharge,
  findAllslabComm,
  bbpsSlabComm,
  zaakpaySlabComm,
  findAllRechargeSlabComm,
  getSlabUser,
  updateSlabUser,
  getAllSlab,
  creditCardSlabComm,
  // SuperAdmin Global Slab Template functions
  createGlobalSlabTemplate,
  getAllGlobalSlabTemplates,
  assignGlobalSlabToCompany,
  // Company Slab functions
  createCompanySlab,
  getAllCompanySlabs
};
