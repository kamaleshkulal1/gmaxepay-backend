const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');

const PractomindAepsOnboarding = sequelize.define(
  'practomindAepsOnboarding',
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
    merchantLoginId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    merchantLoginPin: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Merchant login PIN from Practomind'
    },
    merchantPhoneNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    aadhaarNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    userPan: {
      type: DataTypes.STRING,
      allowNull: true
    },
    onboardingStatus: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'PENDING',
      comment: 'PENDING, COMPLETED, FAILED'
    },
    isOtpSent: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    },
    isOtpValidated: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    },
    isBioMetricValidated: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    },
    KeyID: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'KeyID from send OTP response'
    },
    TxnId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Transaction ID from send OTP response'
    },
    primaryKeyId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Primary key ID from validate OTP response'
    },
    encodeFPTxnId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Encoded fingerprint transaction ID'
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'API response status'
    },
    message: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'API response message'
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Error message if any'
    },
    ekycResponseCode: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'EKYC response code (e.g., FP097) - indicates EKYC needs to be repeated'
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    indexes: [
      {
        unique: false,
        fields: ['userId', 'companyId']
      },
      {
        unique: true,
        fields: ['merchantLoginId']
      },
      {
        unique: false,
        fields: ['onboardingStatus']
      }
    ]
  }
);

sequelizeTransforms(PractomindAepsOnboarding);
sequelizePaginate.paginate(PractomindAepsOnboarding);

module.exports = PractomindAepsOnboarding;

