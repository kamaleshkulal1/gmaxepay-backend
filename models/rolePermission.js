const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');
const Role = require('./roles');
const Permission = require('./permissions');
const models = require('./index');

let rolePermission = sequelize.define(
  'rolePermission',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    roleId: {
      type: DataTypes.INTEGER,
      references: {
        model: Role,
        key: 'id'
      }
    },
    permissionId: {
      type: DataTypes.INTEGER,
      references: {
        model: Permission,
        key: 'id'
      }
    },
    read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    write: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true
  }
);

rolePermission.associate = () => {
  rolePermission.belongsTo(models.role, { foreignKey: 'roleId' });
  rolePermission.belongsTo(models.permission, { foreignKey: 'permissionId' });
};

rolePermission.prototype.toJSON = function () {
  let values = { ...this.get() };
  return values;
};

sequelizeTransforms(rolePermission);
sequelizePaginate.paginate(rolePermission);

module.exports = rolePermission;
