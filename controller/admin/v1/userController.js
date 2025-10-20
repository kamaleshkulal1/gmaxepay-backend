const { user, role, userPackage } = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op } = require('sequelize');

/**
 * @description : create record of User in SQL table.
 * @param {Object} req : request including body for creating record.
 * @param {Object} res : response of created record.
 * @return {Object} : created User. {status, message, data}
 */

const createUser = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    let dataToCreate = { ...(req.body || {}) };
    const companyId = req.companyId;
    dataToCreate = {
      ...dataToCreate,
      isActive: true,
      addedBy: req.user.id,
      type: req.user.userType,
      companyId
    };

    let createdUser = await dbService.createOne(user, dataToCreate);
    if (!createdUser) {
      return res.failure({ message: 'Failed to create User' });
    }
    let userToReturn = {
      ...createdUser.dataValues
    };
    return res.success({
      message: 'User Created Successfully',
      data: userToReturn
    });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.validationError({ message: error.errors[0].message });
    }
    return res.internalServerError({ message: error.message });
  }
};

const findAllUsers = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    let query = {};
    const companyId = req.companyId;
    query.companyId = companyId;

    let foundUsers = await dbService.findAll(user, query);
    if (!foundUsers) {
      return res.failure({ message: 'No Users found' });
    }
    return res.success({
      message: 'Users Retrieved Successfully',
      data: foundUsers
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

const getUser = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const { id } = req.params;
    const companyId = req.companyId;

    let foundUser = await dbService.findOne(user, {
      id,
      companyId
    });
    if (!foundUser) {
      return res.failure({ message: 'User not found' });
    }
    return res.success({
      message: 'User Retrieved Successfully',
      data: foundUser
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const { id } = req.params;
    const companyId = req.companyId;
    let dataToUpdate = { ...(req.body || {}) };
    dataToUpdate = {
      ...dataToUpdate,
      updatedBy: req.user.id,
      type: req.user.userType
    };

    let updatedUser = await dbService.update(
      user,
      { id, companyId },
      dataToUpdate
    );
    if (!updatedUser) {
      return res.failure({ message: 'Update User failed' });
    }
    return res.success({
      message: 'User Updated Successfully',
      data: updatedUser
    });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.validationError({ message: error.errors[0].message });
    }
    return res.internalServerError({ message: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const { id } = req.params;
    const companyId = req.companyId;

    let deletedUser = await dbService.deleteOne(user, { id, companyId });
    if (!deletedUser) {
      return res.failure({ message: 'Delete User failed' });
    }
    return res.success({
      message: 'User Deleted Successfully'
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

module.exports = {
  createUser,
  findAllUsers,
  getUser,
  updateUser,
  deleteUser
};