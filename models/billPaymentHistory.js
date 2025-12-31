const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const User = require('./user');
const { reusableAttributes } = require('../utils/common');

let BillPaymentHistory = sequelize.define(
  'billPaymentHistory',
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
      },
      comment: 'User ID reference'
    },
    companyId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'company',
        key: 'id'
      }
    },
    agentId: {
      allowNull: true,
      type: DataTypes.STRING
    },
    walletType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['MainWallet']]
      }
    },
    operator: {
      type: DataTypes.STRING,
      allowNull: true
    },
    billNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    api: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'BBPS'
    },
    amount: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: true
    },
    comm: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    surcharge: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    companyCommission: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    distributerComm: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    opening: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: true,
      comment: 'Opening wallet balance'
    },
    mobileNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    cardNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    closing: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
      comment: 'Closing wallet balance'
    },
    billerName:{
      type: DataTypes.STRING,
      allowNull: true
    },
    credit: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    debit: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    transactionType: {
      type: DataTypes.STRING,
      allowNull: true
    },
    transactionId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    paymentStatus: {
      type: DataTypes.STRING,
      validate: {
        isIn: [['Success', 'Pending', 'Failed']]
      }
    },
    refundStatus: {
      type: DataTypes.STRING,
      defaultValue: 'Dispute'
    },
    paymentMethod: {
      type: DataTypes.STRING,
      allowNull: true
    },
    fetchBillId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    remarks: {
      type: DataTypes.STRING
    },
    response: {
      type: DataTypes.JSON,
      defaultValue: {},
      allowNull: true
    },
    addedBy: {
      type: DataTypes.INTEGER
    },
    updatedBy: {
      type: DataTypes.INTEGER
    },
    isStatusChecked: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
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
    adminComm: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    whitelabelCommission: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      comment: 'Commission amount for whitelabel partner'
    },
    userDetails: {
      type: DataTypes.JSON
    },
    txnRefId: {
      type: DataTypes.STRING
    },
    respAmount: {
      type: DataTypes.STRING
    },
    respCustomerName: {
      type: DataTypes.STRING,
      comment: 'Customer name from provider response'
    },
    respBillNumber: {
      type: DataTypes.STRING,
      comment: 'Bill number from provider response'
    },
    respBillDate: {
      type: DataTypes.STRING,
      comment: 'Bill date from provider response'
    },
    respBillPeriod: {
      type: DataTypes.STRING,
      comment: 'Bill period from provider response'
    },
    respDueDate: {
      type: DataTypes.STRING,
      comment: 'Due date from provider response'
    },
    approvalRefNumber: {
      type: DataTypes.STRING
    },
    initiatingChannel: {
      type: DataTypes.STRING
    },
    checkStatus: {
      type: DataTypes.JSON,
      defaultValue: {},
      allowNull: true
    },
    customerConvenienceFees: {
      type: DataTypes.FLOAT,
      allowNull: true,
      validate: {
        min: {
          args: [0],
          msg: 'Customer convenience fee must be at least 0'
        },
        max: {
          args: [25],
          msg: 'Customer convenience fee cannot exceed 25'
        }
      }
    },
    ...reusableAttributes
  },
  {
    freezeTableName: true
  }
);

BillPaymentHistory.belongsTo(User, {
  foreignKey: 'refId',
  as: 'user'
});

sequelizeTransforms(BillPaymentHistory);
sequelizePaginate.paginate(BillPaymentHistory);

module.exports = BillPaymentHistory;
