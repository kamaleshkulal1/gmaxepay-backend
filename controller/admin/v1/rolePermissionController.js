const dbService = require('../../../utils/dbService');
const { permission, rolePermission, role } = require('../../../model/index');
const { Op } = require('sequelize');

/**
 * @description : create record of User in SQL table.
 * @param {Object} req : request including body for creating record.
 * @param {Object} res : response of created record.
 * @return {Object} : created User. {status, message, data}
 */

const updatePermission = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 16 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    let dataToCreate = { ...(req.body || {}) };
    dataToCreate = {
      ...dataToCreate,
      updatedBy: req.user.id,
      type: req.user.userType
    };

    let updatePermission = await dbService.update(
      rolePermission,
      {
        roleId: dataToCreate.roleId,
        permissionId: dataToCreate.permissionId
      },
      {
        read: dataToCreate.read,
        write: dataToCreate.write
      }
    );

    if (!updatePermission) {
      return res.failure({ message: 'Update permission failed' });
    }

    const parentPermission = await permission.findOne({
      where: { id: dataToCreate.permissionId, isParent: true }
    });

    let updatedChild = [];
    let updatedParent = null;

    if (parentPermission) {
      const childPermissions = await permission.findAll({
        where: { parentId: parentPermission.id },
        attributes: ['id']
      });

      const childPermissionIds = childPermissions.map((child) => child.id);

      if (childPermissionIds.length > 0) {
        updatedChild = await dbService.update(
          rolePermission,
          {
            roleId: dataToCreate.roleId,
            permissionId: { [Op.in]: childPermissionIds }
          },
          {
            read: dataToCreate.read,
            write: dataToCreate.write
          }
        );
      }

      updatedParent = await rolePermission.findOne({
        where: {
          roleId: dataToCreate.roleId,
          permissionId: parentPermission.id
        }
      });
    } else {
      const childPermission = await permission.findOne({
        where: { id: dataToCreate.permissionId }
      });

      if (childPermission && childPermission.parentId) {
        let parentPermissionUpdate = await rolePermission.findOne({
          where: {
            roleId: dataToCreate.roleId,
            permissionId: childPermission.parentId
          }
        });

        if (parentPermissionUpdate) {
          if (!parentPermissionUpdate.read && dataToCreate.read) {
            parentPermissionUpdate.read = true;
          }
          if (!parentPermissionUpdate.write && dataToCreate.write) {
            parentPermissionUpdate.write = true;
          }

          await parentPermissionUpdate.save();
        } else {
          parentPermissionUpdate = await rolePermission.create({
            roleId: dataToCreate.roleId,
            permissionId: childPermission.parentId,
            read: dataToCreate.read,
            write: dataToCreate.write,
            updatedBy: req.user.id,
            type: req.user.userType
          });
        }

        updatedParent = parentPermissionUpdate;
      }
    }

    let updatedData = {
      updatedParent,
      updatedChild: parentPermission ? updatedChild : [updatePermission]
    };

    if (updatedData.updatedChild) {
      updatedData.updatedChild.sort((a, b) => a.id - b.id);
    }

    return res.success({
      message: 'Permission Updated Successfully',
      data: updatedData
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

const getPermissionByRoleId = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 16 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const { roleId } = req.params;

    let options = {
      include: [
        {
          model: rolePermission,
          attributes: ['id', 'roleId', 'permissionId', 'read', 'write'],
          include: [
            {
              model: permission,
              attributes: ['id', 'moduleName', 'isParent', 'parentId']
            }
          ]
        }
      ]
    };

    let query = {};
    query = { id: roleId };
    const foundPermissions = await dbService.findAll(role, query, options);

    if (!foundPermissions) {
      return res.recordNotFound();
    }
    foundPermissions.forEach((role) => {
      role.rolePermissions.sort((a, b) => a.permissionId - b.permissionId);
    });

    const organizedPermissions = [];

    foundPermissions.forEach((role) => {
      const permissionMap = {};
      role.rolePermissions.forEach((rolePerm) => {
        const permData = {
          id: rolePerm.permission.id,
          moduleName: rolePerm.permission.moduleName,
          isParent: rolePerm.permission.isParent,
          parentId: rolePerm.permission.parentId,
          read: rolePerm.read,
          write: rolePerm.write,
          roleId: rolePerm.roleId,
          permissionId: rolePerm.permissionId
        };
        if (rolePerm.permission.isParent) {
          if (!permissionMap[rolePerm.permission.id]) {
            permissionMap[rolePerm.permission.id] = {
              ...permData,
              children: []
            };
            organizedPermissions.push(permissionMap[rolePerm.permission.id]);
          } else {
            if (typeof permissionMap[rolePerm.permission.id] === 'object') {
              permissionMap[rolePerm.permission.id] = {
                ...permissionMap[rolePerm.permission.id],
                ...permData
              };
            }
          }
        } else {
          if (!permissionMap[rolePerm.permission.parentId]) {
            permissionMap[rolePerm.permission.parentId] = { children: [] };
          }
          if (
            Array.isArray(permissionMap[rolePerm.permission.parentId].children)
          ) {
            permissionMap[rolePerm.permission.parentId].children.push(permData);
          }
        }
      });
    });

    return res.success({
      message: 'Data Found!',
      data: organizedPermissions
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

const createPermission = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 16 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }
    let dataToCreate = { ...(req.body || {}) };

    dataToCreate = {
      ...dataToCreate,
      isActive: true
    };

    let createdPackage = await dbService.createOne(permission, dataToCreate);
    if (!createdPackage) {
      return res.failure({ message: 'Falied to create Package' });
    }
    let packageToReturn = {
      ...createdPackage.dataValues
    };
    return res.success({
      message: 'Permissions Created Successfully',
      data: packageToReturn
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

const createRolePermission = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 16 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }
    let dataToCreate = { ...(req.body || {}) };

    let where = {
      roleId: dataToCreate.roleId,
      permissionId: dataToCreate.permissionId
    };

    const foundRoleAndPermission = await dbService.findOne(
      rolePermission,
      where
    );

    if (foundRoleAndPermission) {
      return res.failure({ message: 'Role and Permission already exist!' });
    }

    const createdPermission = await dbService.createOne(
      rolePermission,
      dataToCreate
    );
    if (!createdPermission) {
      return res.failure({ message: 'Failed to create role permissions' });
    }

    return res.success({
      message: 'Role permissions created successfully',
      data: createdPermission
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

module.exports = {
  updatePermission,
  getPermissionByRoleId,
  createPermission,
  createRolePermission
};
