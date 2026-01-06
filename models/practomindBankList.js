/**
 * practomindBankList.js
 * @description :: sequelize model of database table practomindBankList
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');

let PractomindBankList = sequelize.define(
  'practomindBankList',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    aeps_bank_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    bankName: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    bankLogo: {
      type: DataTypes.STRING,
      allowNull: true
    },
    iinno: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

PractomindBankList.prototype.toJSON = function () {
  let values = { ...this.get() };
  delete values.addedBy;
  delete values.updatedBy;
  return values;
};

sequelizeTransforms(PractomindBankList);
sequelizePaginate.paginate(PractomindBankList);
module.exports = PractomindBankList;

