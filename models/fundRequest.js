

const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const CustomerBank = require('./customerBank');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');

let fundRequest = sequelize.define(
  'fundRequest',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'company',
        key: 'id'
      }
    },
    refId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'user',
        key: 'id'
      }
    },
    approvalRefId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'user',
        key: 'id'
      }
    },
    transactionId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    bankId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    paymentMode: {
      type: DataTypes.ENUM('NEFT', 'RTGS', 'IMPS', 'UPI', 'CASH', 'CHEQUE'),
      allowNull: false
    },
    transactionDate: {
      type: DataTypes.DATE,
      allowNull: false
    },
    referenceNo: {
      type: DataTypes.STRING,
      allowNull: true
    },
    paySlip: {
      type: DataTypes.STRING,
      allowNull: true
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
      allowNull: false,
      defaultValue: 'PENDING'
    },
    approvalRemarks: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    ...reusableSMSAttribute
  },
  {
    freezeTableName: true,
    indexes: [
      {
        unique: false,
        fields: ['companyId']
      },
      {
        unique: false,
        fields: ['refId']
      },
      {
        unique: false,
        fields: ['approvalRefId']
      },
      {
        unique: false,
        fields: ['status']
      },
      {
        unique: true,
        fields: ['transactionId']
      }
    ]
  }
);

sequelizeTransforms(fundRequest);
sequelizePaginate.paginate(fundRequest);
module.exports = fundRequest;
