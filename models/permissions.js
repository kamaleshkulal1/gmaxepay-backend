const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');
const models = require('./index');

let permission = sequelize.define(
  'permissions',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    moduleName: {
      type: DataTypes.STRING,
      unique: true
    },
    isParent: {
      type: DataTypes.BOOLEAN,
      defaultValue: null
    },
    parentId: {
      type: DataTypes.INTEGER,
      defaultValue: null
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true
  }
);

permission.associate = () => {
  permission.hasMany(models.rolePermission, { foreignKey: 'permissionId' });
};

permission.prototype.toJSON = function () {
  let values = Object.assign({}, this.get());
  return values;
};

sequelizeTransforms(permission);
sequelizePaginate.paginate(permission);

module.exports = permission;
