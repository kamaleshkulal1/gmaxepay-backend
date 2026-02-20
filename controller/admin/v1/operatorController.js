const { operator, operatorType, state, user } = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const model = require('../../../models/index');
const { Op } = require('sequelize');
const fs = require('fs');

const registerOperator = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 8 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    let dataToCreate = { ...(req.body || {}) };
    let { operator_image } = req.files || {};
    const companyId = req.user.companyId;

    if (operator_image) {
      operator_image.map((file) => ({
        filename: file.filename,
        mimetype: file.mimetype,
        originalname: file.originalname,
        size: file.size,
        path: file.path
      }));
    }

    dataToCreate = {
      ...dataToCreate,
      companyId: companyId,
      image: operator_image,
      addedBy: req.user.id,
      type: req.user.userType
    };

    let createdUser = await dbService.createOne(operator, dataToCreate);
    if (!createdUser) {
      return res.failure({ message: 'Create Operator failed' });
    }
    let userToReturn = {
      ...createdUser.dataValues
    };

    // Fetch all slabs (for all companies) so that the new operator
    // is available in commission slabs for every company.
    const slabs = await dbService.findAll(
      model.slab,
      { isDelete: false },
      { select: ['id', 'addedByRole', 'addedBy', 'companyId'] }
    );

    const getRoleConfig = (userRole) => {
      switch (userRole) {
        case 1:
          return { roleTypes: [1, 2], roleNames: ['AD', 'WU'] };
        case 2:
          return { roleTypes: [2, 3, 4, 5], roleNames: ['WU', 'MD', 'DI', 'RE'] };
        case 3:
          return { roleTypes: [3, 4, 5], roleNames: ['MD', 'DI', 'RE'] };
        case 4:
          return { roleTypes: [4, 5], roleNames: ['DI', 'RE'] };
        default:
          return { roleTypes: [1, 2, 3, 4, 5], roleNames: ['AD', 'WU', 'MD', 'DI', 'RE'] };
      }
    };

    const dataToInsert = [];

    // Use commType and amtType from request body if provided, else fallback to defaults
    const commType = dataToCreate.commType || dataToCreate.CommType || 'com';
    const amtType = dataToCreate.amtType || dataToCreate.AmtType || 'fix';

    for (const slab of slabs) {
      const slabData = slab.dataValues || slab;
      const addedByRole = slabData.addedByRole;
      const slabCompanyId = slabData.companyId;
      const addedBy = slabData.addedBy;


      const config = getRoleConfig(addedByRole);
      // Filter roles based on companyId
      // If companyId is 1 (Super Admin), we only create AD (1) and WU (2)
      let roleTypes = config.roleTypes;
      let roleNames = config.roleNames;

      roleTypes.forEach((roleType, index) => {
        dataToInsert.push({
          slabId: slab.id,
          companyId: slabCompanyId,
          operatorId: userToReturn.id,
          operatorName: userToReturn.operatorName,
          operatorType: userToReturn.operatorType,
          roleType,
          addedBy: addedBy,
          roleName: roleNames[index],
          commAmt: 0,
          commType: commType,
          amtType: amtType
        });
      });
    }

    await dbService.createMany(model.commSlab, dataToInsert);

    return res.success({
      message: 'New Operator Created Successfully',
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

const findAllOperator = async (req, res) => {
  try {
    let dataToFind = req.body;
    const companyId = req.companyId;
    let options = {};
    let query = {};
    let foundUser;

    if (dataToFind && dataToFind.query) {
      query = dataToFind.query;
    }

    if (dataToFind && dataToFind.isCountOnly) {
      foundUser = await dbService.count(operator, query);
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

    foundUser = await dbService.paginate(model.operator, query, options);

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
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error });
    }
  }
};

const getOperator = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 24 &&
        permission.dataValues.read === true
    );

    let foundUser;
    if (hasPermission) {
      foundUser = await dbService.findOne(operator, { id: req.params.id });
    } else {
      foundUser = await dbService.findOne(operator, {
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
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error });
    }
  }
};

const partialUpdateOperator = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 24 &&
        permission.dataValues.write === true
    );

    let dataToUpdate = { ...req.body };
    let id = req.params.id;

    const operatorExist = await dbService.findOne(operator, { id: id });
    if (!operatorExist) {
      return res.badRequest({ message: `Operator Doesn't Exist!` });
    }

    let { operator_image } = req.files || {};

    if (operator_image && operator_image.length > 0) {
      if (operatorExist.image && operatorExist.image.length > 0) {
        if (fs.existsSync(operatorExist.image[0].path)) {
          fs.unlinkSync(operatorExist.image[0].path);
        }
      }

      const newImages = operator_image.map((file) => ({
        filename: file.filename,
        mimetype: file.mimetype,
        originalname: file.originalname,
        size: file.size,
        path: file.path
      }));

      dataToUpdate = {
        ...dataToUpdate,
        updatedBy: req.user.id,
        image: newImages
      };
    } else {
      dataToUpdate = {
        ...dataToUpdate,
        updatedBy: req.user.id
      };
    }

    if (dataToUpdate.operatorName || dataToUpdate.operatorType) {
      const updateData = {
        operatorName: dataToUpdate.operatorName,
        operatorType: dataToUpdate.operatorType
      };

      // Only update commSlab – other commission tables are not needed
      if (model.commSlab) {
        await dbService.update(
          model.commSlab,
          { operatorId: operatorExist.id },
          updateData
        );
      }
    }

    let updatedUser;
    if (hasPermission || req.user.id == operatorExist.addedBy) {
      updatedUser = await dbService.update(
        operator,
        { id: req.params.id },
        dataToUpdate
      );
    } else {
      return res.failure({ message: `User doesn't have Permission!` });
    }
    return res.success({ data: updatedUser });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error });
    }
  }
};

const deleteOperator = async (req, res) => {
  try {
    const foundApi = await dbService.findOne(operator, {
      id: req.params.id
    });

    if (!foundApi) {
      return res.recordNotFound();
    }

    let dataToUpdate = {
      isDelete: true,
      isActive: false,
      updatedBy: req.user.id
    };

    if (req.user.id === foundApi.addedBy) {
      await dbService.update(template, { id: foundApi.id }, dataToUpdate);
    } else if (hasPermission) {
      await dbService.update(template, { id: foundApi.id }, dataToUpdate);
    } else {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    return res.success({
      msg: 'Record has been deleted successfully',
      data: dataToUpdate
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

const findAllOperatorType = async (req, res) => {
  try {
    let query = {};
    const datas = await dbService.findAll(operatorType, query);

    return res.success({ data: datas });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ data: error.message });
  }
};

const findAllState = async (req, res) => {
  try {
    let query = {};
    const datas = await dbService.findAll(state, query);

    return res.success({ data: datas });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ data: error.message });
  }
};

const operatorList = async (req, res) => {
  try {
    let query = { ...req.body };
    const datas = await dbService.findAll(model.operator, query, {
      select: ['id', 'operatorName']
    });

    return res.success({ data: datas });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ data: error.message });
  }
};

module.exports = {
  registerOperator,
  findAllOperator,
  getOperator,
  partialUpdateOperator,
  deleteOperator,
  findAllOperatorType,
  findAllState,
  operatorList
};
