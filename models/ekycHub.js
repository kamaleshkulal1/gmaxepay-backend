/**
 * KycPanAndAadhar.js
 * @description :: sequelize model of database table kycPanAndAadhar
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');

const ekycHub = sequelize.define(
  'ekycHub',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    identityNumber1: {
      type: DataTypes.STRING,
      allowNull: false
    },
    identityNumber2: {
      type: DataTypes.STRING,
      allowNull: true
    },
    request: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    response: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    identityType: {
      type: DataTypes.STRING,
      allowNull: false,
      attribute: ['PAN', 'AADHAR', 'BANK']
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'company',
        key: 'id'
      }
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true
  }
);

sequelizeTransforms(ekycHub);
sequelizePaginate.paginate(ekycHub);
module.exports = ekycHub;

