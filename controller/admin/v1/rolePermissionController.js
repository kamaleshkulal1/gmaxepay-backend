const dbService = require('../../../utils/dbService');
const { permission, rolePermission, role } = require('../../../models/index');
const { Op } = require('sequelize');

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
      return res.failure({ message: error.errors[0].message });
    } else {
      return res.failure({ message: error });
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

    const options = {
      include: [
        {
          model: rolePermission,
          attributes: ['id', 'roleId', 'permissionId', 'read', 'write'],
          required: false,
          query: { roleId: Number(roleId) }
        }
      ]
    };

    const allPermissions = await dbService.findAll(permission, {}, options);

    if (!allPermissions || !allPermissions.length) {
      return res.recordNotFound();
    }

    const permissionMap = {};

    allPermissions.forEach((perm) => {
      const isParent = perm.isParent;
      const parentId = isParent ? perm.id : perm.parentId;

      if (!parentId) return;

      let read = false;
      let write = false;
      let roleIdForPerm = Number(roleId);

      if (Array.isArray(perm.rolePermissions) && perm.rolePermissions.length) {
        const rp = perm.rolePermissions[0];
        read = Boolean(rp.read);
        write = Boolean(rp.write);
        roleIdForPerm = rp.roleId || roleIdForPerm;
      }

      const permData = {
        id: perm.id,
        moduleName: perm.moduleName,
        isParent: perm.isParent,
        parentId: perm.parentId,
        read,
        write,
        roleId: roleIdForPerm,
        permissionId: perm.id
      };

      if (!permissionMap[parentId]) {
        permissionMap[parentId] = {
          id: parentId,
          moduleName: isParent ? perm.moduleName : null,
          isParent: true,
          parentId: null,
          read: false,
          write: false,
          roleId: roleIdForPerm,
          permissionId: parentId,
          children: []
        };
      }

      if (isParent) {
        permissionMap[parentId] = {
          ...permissionMap[parentId],
          ...permData,
          children: permissionMap[parentId].children || []
        };
      } else {
        if (!permissionMap[parentId].moduleName) {
          permissionMap[parentId].moduleName = perm.moduleName;
        }
        permissionMap[parentId].children.push(permData);
      }
    });

    const organizedPermissions = Object.values(permissionMap);

    return res.success({
      message: 'Data Found!',
      data: organizedPermissions
    });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.failure({ message: error.errors[0].message });
    } else {
      return res.failure({ message: error.message });
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
      return res.failure({ message: error.errors[0].message });
    } else {
      return res.failure({ message: error });
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
      return res.failure({ message: error.errors[0].message });
    } else {
      return res.failure({ message: error });
    }
  }
};

module.exports = {
  updatePermission,
  getPermissionByRoleId,
  createPermission,
  createRolePermission
};
