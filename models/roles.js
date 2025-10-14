const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');
const models = require('./index');

let role = sequelize.define(
  'roles',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
   companyId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'company',
        key: 'id'
      },      
    },
    roleType: {
      type: DataTypes.STRING
    },
    roleName: {
      type: DataTypes.STRING
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

role.associate = () => {
  role.hasMany(models.rolePermission, { foreignKey: 'roleId' });
};

role.prototype.toJSON = function () {
  let values = { ...this.get() };
  return values;
};

sequelizeTransforms(role);
sequelizePaginate.paginate(role);

module.exports = role;
