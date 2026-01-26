/**
 * dmtRegistration.js
 * @description :: sequelize model of database table dmtRegistration
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const model = require('./index');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');

const DmtRegistration = sequelize.define(
  'dmtRegistration',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    refId: {
      type: DataTypes.INTEGER,
      references: {
        model: model.user,
        key: 'id'
      },
      allowNull: false
    },
    companyId: {
      type: DataTypes.INTEGER,
      references: {
        model: model.company,
        key: 'id'
      },
      allowNull: false
    },
    senderMobileNo: {
      type: DataTypes.STRING,
      allowNull: false
    },
    senderName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    senderGender: {
      type: DataTypes.STRING,
      allowNull: true
    },
    senderId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    isRegistrationSuccess: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    isOtpVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    otpReference: {
      type: DataTypes.STRING,
      allowNull: true
    },
    registrationResponse: {
      type: DataTypes.JSON,
      allowNull: true
    },
    otpRequestResponse: {
      type: DataTypes.JSON,
      allowNull: true
    },
    otpVerifyResponse: {
      type: DataTypes.JSON,
      allowNull: true
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    indexes: [
      {
        unique: false,
        fields: ['refId', 'companyId']
      },
      {
        unique: false,
        fields: ['senderMobileNo']
      },
      {
        unique: false,
        fields: ['senderId']
      }
    ]
  }
);

sequelizeTransforms(DmtRegistration);
sequelizePaginate.paginate(DmtRegistration);
module.exports = DmtRegistration;
