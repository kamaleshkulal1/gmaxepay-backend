/**
 * practomindCompanyCode.js
 * @description :: sequelize model of database table practomindCompanyCode
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');

let PractomindCompanyCode = sequelize.define(
  'practomindCompanyCode',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    c_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    mccCode: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

PractomindCompanyCode.prototype.toJSON = function () {
  let values = { ...this.get() };
  delete values.addedBy;
  delete values.updatedBy;
  return values;
};

sequelizeTransforms(PractomindCompanyCode);
sequelizePaginate.paginate(PractomindCompanyCode);
module.exports = PractomindCompanyCode;

