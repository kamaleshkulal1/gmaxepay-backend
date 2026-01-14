
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');

let fundHistory = sequelize.define(
  'fundHistory',
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
    fundRequestId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'fundRequest',
        key: 'id'
      }
    },
    transactionId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    openingBalance: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0
    },
    closingBalance: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0
    },
    creditAmount: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'APPROVED', 'CREDITED'),
      allowNull: false,
      defaultValue: 'PENDING'
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
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
        fields: ['transactionId']
      },
      {
        unique: false,
        fields: ['fundRequestId']
      }
    ]
  }
);

sequelizeTransforms(fundHistory);
sequelizePaginate.paginate(fundHistory);
module.exports = fundHistory;
