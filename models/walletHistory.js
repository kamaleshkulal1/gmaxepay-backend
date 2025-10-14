const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const User = require('./user');

let WalletHistory = sequelize.define(
  'walletHistory',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    refId: {
      allowNull: false,
      type: DataTypes.INTEGER,
      references: {
        model: User,
        key: 'id'
      }
    },
    companyId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'company',
        key: 'id'
      }
    },
    walletType: {
      type: DataTypes.STRING,
      allowNull: true
    },
    remark: {
      type: DataTypes.STRING,
      allowNull: true
    },
    operator: {
      type: DataTypes.STRING
    },
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    comm: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    surcharge: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    openingAmt: {
      type: DataTypes.FLOAT
    },
    closingAmt: {
      type: DataTypes.FLOAT
    },
    credit: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    debit: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    merchantTransactionId: {
      type: DataTypes.STRING
    },
    transactionId: {
      type: DataTypes.STRING
    },
    paymentStatus: {
      type: DataTypes.STRING,
      validate: {
        isIn: [['SUCCESS', 'PENDING', 'FAILED', 'REFUND']]
      }
    },
    paymentInstrument: {
      type: DataTypes.JSON
    },
    createdAt: {
      type: DataTypes.DATE
    },
    updatedAt: {
      type: DataTypes.DATE
    },
    addedBy: {
      type: DataTypes.INTEGER
    },
    updatedBy: {
      type: DataTypes.INTEGER
    },
    beneficiaryName: {
      type: DataTypes.STRING
    },
    beneficiaryAccountNumber: {
      type: DataTypes.STRING
    },
    UTR: {
      type: DataTypes.STRING
    },
    beneficiaryBankName: {
      type: DataTypes.STRING
    },
    beneficiaryIfsc: {
      type: DataTypes.STRING
    },
    paymentMode: {
      type: DataTypes.STRING
    },
    CUSTOMER_NAME: {
      type: DataTypes.STRING
    },
    CUSTOMER_EMAIL: {
      type: DataTypes.STRING
    },
    CUSTOMER_PHONE: {
      type: DataTypes.STRING
    },
    CARD_NUMBER: {
      type: DataTypes.STRING
    },
    CARD_TYPE: {
      type: DataTypes.STRING
    },
    refundStatus: {
      type: DataTypes.STRING,
      defaultValue: 'Pending'
    },
    isStatusChecked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    distributerSurcharge: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    distributorAmount: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    adminSurcharge: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    adminAmount: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    whitelabelCommission: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    payOutId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    userDetails: {
      type: DataTypes.JSON
    },
    whitelabelCommission: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    }
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

// Define associations
// Association moved to models/index.js to avoid duplicate alias conflicts

// Apply plugins
sequelizeTransforms(WalletHistory);
sequelizePaginate.paginate(WalletHistory);

module.exports = WalletHistory;
