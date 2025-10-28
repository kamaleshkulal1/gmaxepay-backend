/**
 * packages.js
 * @description :: sequelize model of database table packages
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');
const slab = require('./slab');
let Package = sequelize.define(
  'packages',
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
      allowNull: false
    },
    packageName: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    remark: {
      type: DataTypes.STRING
    },
    isMore: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    isSelfAssigned: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    slabAssigned: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: slab,
        key: 'id'
      }
    },
    ...reusableSMSAttribute
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

Package.prototype.toJSON = function () {
  let values = Object.assign({}, this.get());
  delete values.addedBy;
  delete values.updatedBy;
  return values;
};

sequelizeTransforms(Package);
sequelizePaginate.paginate(Package);
module.exports = Package;
