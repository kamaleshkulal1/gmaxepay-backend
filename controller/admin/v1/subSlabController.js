const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op } = require('sequelize');
const { USER_TYPES } = require('../../../constants/authConstant');

// Create Sub-Slab (for Company, MD, Distributor to create their own commercials)
const createSubSlab = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 13 &&
        permission.dataValues.write === true
    );

    // Allow SUPER_ADMIN, ADMIN (Whitelabel), MASTER_DISTRIBUTOR, DISTRIBUTOR to create sub-slabs
    if (req.user?.userType === USER_TYPES.SUPER_ADMIN) {
      hasPermission = true;
    }

    if (!hasPermission && ![USER_TYPES.ADMIN, USER_TYPES.WHITELABEL_ADMIN, USER_TYPES.MASTER_DISTRIBUTOR, USER_TYPES.DISTRIBUTOR].includes(req.user?.userType)) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    let dataToCreate = { ...(req.body || {}) };
    const companyId = req.companyId ?? req.user?.companyId;
    
    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    // Validate parentSlabId exists
    if (dataToCreate.parentSlabId) {
      const parentSlab = await dbService.findOne(model.slab, {
        id: dataToCreate.parentSlabId,
        [Op.or]: [
          { companyId: companyId }
        ]
      });
      
      if (!parentSlab) {
        return res.failure({ message: 'Parent slab not found or not accessible' });
      }
    }

    // Set default values
    if (!dataToCreate.slabType) {
      dataToCreate.slabType = 'level';
    }

    // Validate slabType
    if (!['level', 'channel'].includes(dataToCreate.slabType)) {
      return res.failure({ message: 'slabType must be either "level" or "channel"' });
    }

    // Set userId based on user type
    // SUPER_ADMIN creates company-level slabs (userId = null)
    // ADMIN/WHITELABEL_ADMIN creates company-level slabs (userId = null)
    // MD/DISTRIBUTOR creates their own sub-slabs (userId = req.user.id)
    if ([USER_TYPES.MASTER_DISTRIBUTOR, USER_TYPES.DISTRIBUTOR].includes(req.user?.userType)) {
      dataToCreate.userId = req.user.id;
      dataToCreate.userType = req.user.userType;
    } else {
      dataToCreate.userId = null;
      dataToCreate.userType = req.user?.userType || null;
    }

    dataToCreate = {
      ...dataToCreate,
      companyId,
      isActive: true,
      isDelete: false,
      addedBy: req.user.id,
      users: dataToCreate.users || []
    };

    const createdSubSlab = await dbService.createOne(model.subSlabs, dataToCreate);
    
    if (!createdSubSlab) {
      return res.failure({ message: 'Failed to create Sub-Slab' });
    }

    // Create commercials for the sub-slab (similar to slab creation)
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

    let dataToInsertSubSlabComm = [];
    let dataToInsertSubSlabPgCommercials = [];

    // Create SubSlabComm entries
    operators.forEach((operator) => {
      roleTypes.forEach((roleType, index) => {
        dataToInsertSubSlabComm.push({
          subSlabId: createdSubSlab.id,
          operatorId: operator.id,
          operatorName: operator.operatorName,
          operatorType: operator.operatorType,
          roleType,
          roleName: roleNames[index],
          commAmt: 0,
          commType: 'com',
          amtType: 'fix',
          companyId: roleType === 1 ? null : companyId
        });
      });
    });

    // Create SubSlabPgCommercials entries for PayIn operators
    const payInOperators = operators.filter(
      (op) => op.dataValues.operatorType === 'PayIn'
    );

    for (const operator of payInOperators) {
      for (const roleType of roleTypes) {
        const roleNameValue = roleNames[roleType - 1] || 'AD';

        for (const paymentInstrument of paymentInstruments) {
          const existingPgCommercial = await dbService.findOne(
            model.subSlabPgCommercials,
            {
              subSlabId: createdSubSlab.id,
              operatorId: operator.id,
              roleType,
              paymentInstrumentId: paymentInstrument.id,
              companyId: companyId
            }
          );

          if (!existingPgCommercial) {
            if (paymentInstrument.isCardType) {
              for (const cardType of cardTypes) {
                dataToInsertSubSlabPgCommercials.push({
                  subSlabId: createdSubSlab.id,
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
                  companyId: roleType === 1 ? null : companyId
                });
              }
            } else {
              dataToInsertSubSlabPgCommercials.push({
                subSlabId: createdSubSlab.id,
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
                companyId: roleType === 1 ? null : companyId
              });
            }
          }
        }
      }
    }

    // Create commercials for sub-slabs using dedicated subSlabComm and subSlabPgCommercials tables
    const promises = [dbService.createMany(model.subSlabComm, dataToInsertSubSlabComm)];
    if (dataToInsertSubSlabPgCommercials.length > 0) {
      promises.push(dbService.createMany(model.subSlabPgCommercials, dataToInsertSubSlabPgCommercials));
    }
    await Promise.all(promises);

    return res.success({
      message: 'Sub-Slab Created Successfully',
      data: createdSubSlab.dataValues
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

// Get All Sub-Slabs
const getAllSubSlabs = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 13 &&
        permission.dataValues.read === true
    );

    const companyId = req.companyId ?? req.user?.companyId ?? null;
    let query = {};

    if (companyId !== null && companyId !== undefined) {
      query.companyId = companyId;
    }

    // Filter by user if MD or Distributor
    if ([USER_TYPES.MASTER_DISTRIBUTOR, USER_TYPES.DISTRIBUTOR].includes(req.user?.userType)) {
      query.userId = req.user.id;
    }

    // Filter by parentSlabId if provided
    if (req.query.parentSlabId) {
      query.parentSlabId = req.query.parentSlabId;
    }

    let options = {
      order: [['id', 'DESC']],
      include: [
        {
          model: model.slab,
          as: 'parentSlab',
          attributes: ['id', 'slabName', 'slabType', 'slabScope']
        }
      ]
    };

    const foundSubSlabs = await dbService.findAll(model.subSlabs, query, options);

    if (!foundSubSlabs || foundSubSlabs.length === 0) {
      return res.recordNotFound();
    }

    return res.success({
      message: 'Sub-Slabs retrieved successfully',
      data: foundSubSlabs
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

// Get Single Sub-Slab
const getSubSlab = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 13 &&
        permission.dataValues.read === true
    );

    const companyId = req.companyId ?? req.user?.companyId ?? null;
    const subSlabId = req.params.id;

    let query = {
      id: subSlabId
    };

    if (companyId !== null && companyId !== undefined) {
      query.companyId = companyId;
    }

    // Filter by user if MD or Distributor
    if ([USER_TYPES.MASTER_DISTRIBUTOR, USER_TYPES.DISTRIBUTOR].includes(req.user?.userType)) {
      query.userId = req.user.id;
    }

    const foundSubSlab = await dbService.findOne(
      model.subSlabs,
      query,
      {
        include: [
          {
            model: model.slab,
            as: 'parentSlab',
            attributes: ['id', 'slabName', 'slabType', 'slabScope']
          }
        ]
      }
    );

    if (!foundSubSlab) {
      return res.recordNotFound({ message: 'Sub-Slab not found' });
    }

    return res.success({
      message: 'Sub-Slab retrieved successfully',
      data: foundSubSlab
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

// Update Sub-Slab
const updateSubSlab = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 13 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    const companyId = req.companyId ?? req.user?.companyId ?? null;
    const subSlabId = req.params.id;
    let dataToUpdate = { ...req.body };

    let query = {
      id: subSlabId
    };

    if (companyId !== null && companyId !== undefined) {
      query.companyId = companyId;
    }

    // Filter by user if MD or Distributor
    if ([USER_TYPES.MASTER_DISTRIBUTOR, USER_TYPES.DISTRIBUTOR].includes(req.user?.userType)) {
      query.userId = req.user.id;
    }

    const existingSubSlab = await dbService.findOne(model.subSlabs, query);

    if (!existingSubSlab) {
      return res.failure({ message: 'Sub-Slab not found!' });
    }

    dataToUpdate.updatedBy = req.user.id;

    const updatedSubSlab = await dbService.update(
      model.subSlabs,
      { id: subSlabId },
      dataToUpdate
    );

    return res.success({
      message: 'Sub-Slab updated successfully',
      data: updatedSubSlab[0]
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

// Assign Users to Sub-Slab (using array methods)
const assignUsersToSubSlab = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 13 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    const companyId = req.companyId ?? req.user?.companyId ?? null;
    const subSlabId = req.params.id;
    const { userIds } = req.body;

    if (!Array.isArray(userIds)) {
      return res.badRequest({ message: 'userIds must be an array' });
    }

    let query = {
      id: subSlabId
    };

    if (companyId !== null && companyId !== undefined) {
      query.companyId = companyId;
    }

    const existingSubSlab = await dbService.findOne(model.subSlabs, query);

    if (!existingSubSlab) {
      return res.failure({ message: 'Sub-Slab not found!' });
    }

    // Validate user IDs exist
    const users = await dbService.findAll(model.user, {
      id: { [Op.in]: userIds },
      companyId: companyId
    });

    if (users.length !== userIds.length) {
      return res.failure({ message: 'Some user IDs are invalid' });
    }

    // Merge with existing users array (avoid duplicates)
    const currentUsers = existingSubSlab.users || [];
    const uniqueUserIds = [...new Set([...currentUsers, ...userIds])];

    const updatedSubSlab = await dbService.update(
      model.subSlabs,
      { id: subSlabId },
      {
        users: uniqueUserIds,
        updatedBy: req.user.id
      }
    );

    return res.success({
      message: 'Users assigned to Sub-Slab successfully',
      data: updatedSubSlab[0]
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

// Remove Users from Sub-Slab
const removeUsersFromSubSlab = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 13 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    const companyId = req.companyId ?? req.user?.companyId ?? null;
    const subSlabId = req.params.id;
    const { userIds } = req.body;

    if (!Array.isArray(userIds)) {
      return res.badRequest({ message: 'userIds must be an array' });
    }

    let query = {
      id: subSlabId
    };

    if (companyId !== null && companyId !== undefined) {
      query.companyId = companyId;
    }

    const existingSubSlab = await dbService.findOne(model.subSlabs, query);

    if (!existingSubSlab) {
      return res.failure({ message: 'Sub-Slab not found!' });
    }

    // Remove user IDs from array
    const currentUsers = existingSubSlab.users || [];
    const filteredUsers = currentUsers.filter(id => !userIds.includes(id));

    const updatedSubSlab = await dbService.update(
      model.subSlabs,
      { id: subSlabId },
      {
        users: filteredUsers,
        updatedBy: req.user.id
      }
    );

    return res.success({
      message: 'Users removed from Sub-Slab successfully',
      data: updatedSubSlab[0]
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

// Delete Sub-Slab (soft delete)
const deleteSubSlab = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 13 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    const companyId = req.companyId ?? req.user?.companyId ?? null;
    const subSlabId = req.params.id;

    let query = {
      id: subSlabId
    };

    if (companyId !== null && companyId !== undefined) {
      query.companyId = companyId;
    }

    const existingSubSlab = await dbService.findOne(model.subSlabs, query);

    if (!existingSubSlab) {
      return res.recordNotFound({ message: 'Sub-Slab not found' });
    }

    const deletedSubSlab = await dbService.update(
      model.subSlabs,
      { id: subSlabId },
      {
        isActive: false,
        isDelete: true,
        updatedBy: req.user.id
      }
    );

    return res.success({
      message: 'Sub-Slab deleted successfully',
      data: deletedSubSlab[0]
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

// Update Sub-Slab Commercial (CommSlab)
const updateSubSlabCommercial = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 13 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    let dataToUpdate = { ...(req.body || {}) };
    const companyId = req.companyId ?? req.user?.companyId;

    const subSlabId = dataToUpdate.subSlabId;
    const operatorId = dataToUpdate.operatorId;
    const roleType = dataToUpdate.roleType;
    const id = dataToUpdate.id;

    if (roleType > 10 || roleType < 1) {
      return res.failure({ message: 'Role Type Should be Between 1 - 10' });
    }

    const subSlabData = await dbService.findOne(model.subSlabs, {
      id: subSlabId,
      companyId
    });
    
    if (!subSlabData) {
      return res.badRequest({ message: 'Sub-Slab not found!' });
    }

    const operator = await dbService.findOne(model.operator, {
      id: operatorId
    });
    
    if (!operator) {
      return res.badRequest({ message: 'Operator not found!' });
    }

    let query = {
      subSlabId: subSlabId,
      operatorId: operatorId,
      roleType: roleType,
      companyId
    };

    const subSlabComm = await dbService.findOne(model.subSlabComm, query);

    if (subSlabComm) {
      dataToUpdate = {
        ...dataToUpdate,
        updatedBy: req.user.id
      };
      const updatedComm = await dbService.update(
        model.subSlabComm,
        { id: subSlabComm.id },
        dataToUpdate
      );
      return res.success({
        message: 'Sub-Slab Commercial updated successfully!',
        data: updatedComm
      });
    } else {
      dataToUpdate = {
        ...dataToUpdate,
        isActive: true,
        addedBy: req.user.id,
        operatorType: operator.operatorType
      };

      const createdComm = await dbService.createOne(
        model.subSlabComm,
        dataToUpdate
      );

      return res.success({
        message: 'Sub-Slab Commercial created successfully!',
        data: createdComm
      });
    }
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

// Update Sub-Slab PG Commercial
const updateSubSlabPgCommercial = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 13 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    let dataToUpdate = { ...(req.body || {}) };
    const companyId = req.companyId ?? req.user?.companyId;
    const id = dataToUpdate.id;

    const subSlabData = await dbService.findOne(model.subSlabs, {
      id: dataToUpdate.subSlabId,
      companyId
    });
    
    if (!subSlabData) {
      return res.badRequest({ message: 'Sub-Slab not found!' });
    }

    const subSlabPgComm = await dbService.findOne(model.subSlabPgCommercials, {
      id: id || 0
    });

    if (subSlabPgComm) {
      dataToUpdate = {
        ...dataToUpdate,
        updatedBy: req.user.id
      };
      const updatedPgComm = await dbService.update(
        model.subSlabPgCommercials,
        { id: subSlabPgComm.id },
        dataToUpdate
      );
      return res.success({
        message: 'Sub-Slab PG Commercial updated successfully!',
        data: updatedPgComm
      });
    } else {
      const operator = await dbService.findOne(model.operator, {
        id: dataToUpdate.operatorId
      });
      
      if (!operator) {
        return res.badRequest({ message: 'Operator not found!' });
      }

      dataToUpdate = {
        ...dataToUpdate,
        isActive: true,
        addedBy: req.user.id,
        operatorType: operator.operatorType
      };

      const createdPgComm = await dbService.createOne(
        model.subSlabPgCommercials,
        dataToUpdate
      );

      return res.success({
        message: 'Sub-Slab PG Commercial created successfully!',
        data: createdPgComm
      });
    }
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
  createSubSlab,
  getAllSubSlabs,
  getSubSlab,
  updateSubSlab,
  assignUsersToSubSlab,
  removeUsersFromSubSlab,
  deleteSubSlab,
  updateSubSlabCommercial,
  updateSubSlabPgCommercial
};

