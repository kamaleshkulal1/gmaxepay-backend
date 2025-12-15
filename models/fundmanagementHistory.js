const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');
const User = require('./user');
const Company = require('./company');

let FundManagementHistory = sequelize.define(
  'fundManagementHistory',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    fundManagementId: {
      allowNull: false,
      type: DataTypes.INTEGER,
      references: {
        model: 'fundManagement',
        key: 'id'
      }
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
      }
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
      allowNull: false
    },
    transactionId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['Pending', 'Approved', 'Rejected']]
      }
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['Requested', 'Approved', 'Rejected', 'TransferCompleted']]
      }
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    performedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: User,
        key: 'id'
      }
    },
    oldAmount: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Superior wallet balance before transfer'
    },
    newAmount: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Superior wallet balance after transfer'
    },
    requesterOldAmount: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Requester wallet balance before transfer'
    },
    requesterNewAmount: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Requester wallet balance after transfer'
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

sequelizeTransforms(FundManagementHistory);
sequelizePaginate.paginate(FundManagementHistory);
module.exports = FundManagementHistory;

