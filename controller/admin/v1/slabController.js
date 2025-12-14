const { slab, commSlab, role } = require('../../../models/index');
const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op, Sequelize } = require('sequelize');
const sequelize = require('../../../config/dbConnection');
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

    // companyId cannot be null - required for all slabs
    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }
    
    dataToCreate.companyId = companyId;

    // Set default amount if not provided
    if (dataToCreate.amount === undefined || dataToCreate.amount === null) {
      dataToCreate.amount = 0;
    }

    dataToCreate = {
      ...dataToCreate,
      isActive: true,
      addedBy: req.user.id,
      type: req.user.userType,
      users: dataToCreate.users || []
    };

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
    
    if (!companyId) {
      return res.failure({ message: 'companyId is required' });
    }

    // Get slabs that belong to this company OR global slabs (slabScope = 'global')
    const foundSlab = await dbService.findAll(
      slab,
      {
        [Op.or]: [
          { companyId: companyId },
          { slabScope: 'global' }
        ],
        isDelete: false,
        isActive: true
      },
      {
        select: ['slabName', 'id', 'slabType', 'slabScope', 'amount'],
        sort: {
          id: 1 // ASC
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
    console.error(error);
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

    // Validate users array contains only company admin IDs (userRole 2) if provided
    if (dataToUpdate.users && Array.isArray(dataToUpdate.users)) {
      const companyId = existingSlab.companyId;
      const companyAdmins = await dbService.findAll(model.user, {
        id: { [Op.in]: dataToUpdate.users },
        userRole: 2,
        companyId: companyId
      });

      if (companyAdmins.length !== dataToUpdate.users.length) {
        return res.failure({ 
          message: 'All users must be company admins (userRole 2) from the same company' 
        });
      }
    }

    const updatedSlab = await dbService.update(
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
    
    // Validate that the user to be assigned is a company admin (userRole 2)
    const userToAssign = await dbService.findOne(model.user, { 
      id: userId,
      userRole: 2, // Only company admin (userRole 2)
      companyId: existingSlab.companyId // Must be from same company
    });

    if (!userToAssign) {
      return res.failure({ 
        message: 'User must be a company admin (userRole 2) from the same company' 
      });
    }

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

    // Remove user from any existing slab
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

    // Add user to this slab (using array methods to avoid duplicates)
    const currentUsers = existingSlab.users || [];
    if (!currentUsers.includes(userId)) {
      existingSlab.users = [...currentUsers, userId];
      await dbService.update(
        model.slab,
        { id: existingSlab.id },
        { users: existingSlab.users }
      );
    }

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

// Upgrade package by assigning slab (for company admins)
const upgradePackage = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 13 &&
        permission.dataValues.write === true
    );

    // Only company admin (userRole 2) can upgrade packages
    if (req.user?.userRole !== 2) {
      return res.failure({ message: 'Only Company Admin can upgrade packages' });
    }

    const { slabId } = req.body;
    const companyId = req.companyId ?? req.user?.companyId;
    const userId = req.user.id;

    if (!slabId) {
      return res.badRequest({ message: 'slabId is required' });
    }

    // Find the slab
    const selectedSlab = await dbService.findOne(model.slab, {
      id: slabId,
      [Op.or]: [
        { companyId: companyId },
        { slabScope: 'global' }
      ],
      isActive: true,
      isDelete: false
    });

    if (!selectedSlab) {
      return res.failure({ message: 'Slab not found or not accessible' });
    }

    // Check if slab has an amount
    const slabAmount = selectedSlab.amount || 0;

    if (slabAmount > 0) {
      // Get user wallet
      const userWallet = await dbService.findOne(model.wallet, {
        refId: userId
      });

      if (!userWallet) {
        return res.failure({ message: 'User wallet not found' });
      }

      // Check if user has sufficient balance (using mainWallet)
      const currentBalance = userWallet.mainWallet || 0;
      if (currentBalance < slabAmount) {
        return res.failure({ 
          message: `Insufficient balance. Required: ${slabAmount}, Available: ${currentBalance}` 
        });
      }

      // Deduct amount from wallet
      const newBalance = currentBalance - slabAmount;
      await dbService.update(
        model.wallet,
        { refId: userId },
        { mainWallet: newBalance }
      );

      // Create wallet history entry
      await dbService.createOne(model.walletHistory, {
        refId: userId,
        companyId: companyId,
        amount: slabAmount,
        debit: slabAmount,
        credit: 0,
        openingAmt: currentBalance,
        closingAmt: newBalance,
        description: `Package upgrade: ${selectedSlab.slabName}`,
        remark: `Slab upgrade payment - ${selectedSlab.slabName}`,
        paymentStatus: 'SUCCESS',
        addedBy: userId
      });
    }

    // Find package associated with this slab
    const packageWithSlab = await dbService.findOne(model.packages, {
      slabAssigned: slabId,
      companyId: companyId
    });

    if (!packageWithSlab) {
      return res.failure({ 
        message: 'No package found for this slab. Please contact admin.' 
      });
    }

    // Get package services
    const packageServices = await dbService.findAll(
      model.packageService,
      { packageId: packageWithSlab.id },
      { select: ['serviceId'] }
    );

    if (!packageServices || packageServices.length === 0) {
      return res.failure({ message: 'No services found for this package' });
    }

    const serviceIds = packageServices.map((ps) => ps.dataValues.serviceId);
    const services = await dbService.findAll(model.services, {
      id: serviceIds
    });

    if (!services || services.length === 0) {
      return res.failure({ message: 'Services not found' });
    }

    // Remove existing user package
    await dbService.destroy(model.userPackage, { userId });

    // Create new user package entries
    const dataToInsert = services.map((service) => ({
      userId,
      packageId: packageWithSlab.id,
      packageName: packageWithSlab.packageName,
      cost: packageWithSlab.cost || 0,
      serviceId: service.id,
      serviceName: service.serviceName,
      isActive: true,
      addedBy: userId
    }));

    const createdUserPackage = await dbService.createMany(
      model.userPackage,
      dataToInsert
    );

    // Update user's slab assignment
    const currentUsers = selectedSlab.users || [];
    if (!currentUsers.includes(userId)) {
      await dbService.update(
        model.slab,
        { id: slabId },
        { users: [...currentUsers, userId] }
      );
    }

    // Update user record
    await dbService.update(
      model.user,
      { id: userId },
      { slab: selectedSlab.slabName }
    );

    return res.success({
      message: 'Package upgraded successfully!',
      data: {
        slab: selectedSlab.slabName,
        package: packageWithSlab.packageName,
        amountDeducted: slabAmount,
        services: services.length
      }
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
  upgradePackage
};
