/**
 * aepsOnboarding.js
 * @description :: sequelize model of database table aepsOnboarding
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');

const AepsOnboarding = sequelize.define(
  'aepsOnboarding',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'user',
        key: 'id'
      },
      allowNull: false
    },
    companyId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'company',
        key: 'id'
      },
      allowNull: false
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true
    },
    uniqueID: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    otpReferenceId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    hash: {
      type: DataTypes.STRING,
      allowNull: true
    },
    message: {
      type: DataTypes.STRING,
      allowNull: true
    },
    merchantStatus: {
      type: DataTypes.BOOLEAN,
      allowNull: true
    },
    remarks: {
      type: DataTypes.STRING,
      allowNull: true
    },
    superMerchantId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    merchantLoginId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    errorCodes: {
      type: DataTypes.STRING,
      allowNull: true
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true
  }
);

sequelizeTransforms(AepsOnboarding);
sequelizePaginate.paginate(AepsOnboarding);
module.exports = AepsOnboarding;

