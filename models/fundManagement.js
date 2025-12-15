const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');
const User = require('./user');
const Company = require('./company');

let FundManagement = sequelize.define(
  'fundManagement',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    requestUserId: {
      allowNull: false,
      type: DataTypes.INTEGER,
      references: {
        model: User,
        key: 'id'
      }
    },
    superiorUserId: {
      allowNull: true,
      type: DataTypes.INTEGER,
      references: {
        model: User,
        key: 'id'
      },
      comment: 'If null, company admin is the superior'
    },
    companyId: {
      type: DataTypes.INTEGER,
      references: {
        model: Company,
        key: 'id'
      },
      allowNull: false
    },
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false,
      set(value) {
        this.setDataValue('amount', parseFloat(value.toFixed(2)));
      }
    },
    bankId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'customerBank',
        key: 'id'
      },
      comment: 'Selected bank account ID from superior'
    },
    paymentMode: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['IMPS / NEFT / UPI', 'CASH DEPOSIT', 'CASH IN HAND']]
      },
      comment: 'Payment mode: IMPS / NEFT / UPI, CASH DEPOSIT, CASH IN HAND'
    },
    payDate: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Payment date'
    },
    refNo: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Reference number for the payment'
    },
    paySlip: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Payslip file path (S3 key)'
    },
    transactionId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Pending',
      validate: {
        isIn: [['Pending', 'Approved', 'Rejected']]
      }
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Message from approver/rejector'
    },
    approvedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: User,
        key: 'id'
      }
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    rejectedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: User,
        key: 'id'
      }
    },
    rejectedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    remark: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ...reusableSMSAttribute
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

// Associations are defined in models/index.js to avoid duplicates

sequelizeTransforms(FundManagement);
sequelizePaginate.paginate(FundManagement);
module.exports = FundManagement;

