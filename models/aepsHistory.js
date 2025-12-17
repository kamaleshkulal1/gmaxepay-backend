const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const User = require('./user');

/**
 * aepsHistory.js
 * @description :: sequelize model of database table aepsHistory
 * Separate history for AEPS transactions (in addition to walletHistory ledger entries).
 */
let AepsHistory = sequelize.define(
  'aepsHistory',
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
      },
      allowNull: false
    },
    operator: {
      type: DataTypes.STRING,
      allowNull: true
    },
    bankiin: {
      type: DataTypes.STRING,
      allowNull: true
    },
    aepsTxnType: {
      type: DataTypes.STRING,
      allowNull: true
    },
    captureType: {
      type: DataTypes.STRING,
      allowNull: true
    },
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0
    },
    transactionId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    merchantTransactionId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    bankRRN: {
      type: DataTypes.STRING,
      allowNull: true
    },
    fpTransactionId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    responseCode: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true
    },
    message: {
      type: DataTypes.STRING,
      allowNull: true
    },
    requestPayload: {
      type: DataTypes.JSON,
      allowNull: true
    },
    responsePayload: {
      type: DataTypes.JSON,
      allowNull: true
    },
    // Wallet snapshot for AEPS wallet crediting
    openingAepsWallet: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    closingAepsWallet: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    credit: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    // --- AEPS commission breakdown (nullable) ---
    superadminComm: { type: DataTypes.FLOAT, allowNull: true },
    whitelabelComm: { type: DataTypes.FLOAT, allowNull: true },
    masterDistributorCom: { type: DataTypes.FLOAT, allowNull: true },
    masterDistrbutorCom: { type: DataTypes.FLOAT, allowNull: true },
    distributorCom: { type: DataTypes.FLOAT, allowNull: true },
    retailerCom: { type: DataTypes.FLOAT, allowNull: true },
    reatilerCom: { type: DataTypes.FLOAT, allowNull: true },
    superadminCommTDS: { type: DataTypes.FLOAT, allowNull: true },
    superAdminComTDS: { type: DataTypes.FLOAT, allowNull: true },
    whitelabelCommTDS: { type: DataTypes.FLOAT, allowNull: true },
    whitelabelComTDS: { type: DataTypes.FLOAT, allowNull: true },
    masterDistributorComTDS: { type: DataTypes.FLOAT, allowNull: true },
    masterDistrbutorComTDS: { type: DataTypes.FLOAT, allowNull: true },
    distributorComTDS: { type: DataTypes.FLOAT, allowNull: true },
    retailerComTDS: { type: DataTypes.FLOAT, allowNull: true },
    reatilerComTDS: { type: DataTypes.FLOAT, allowNull: true },
    addedBy: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

AepsHistory.belongsTo(User, { foreignKey: 'refId', as: 'user' });

sequelizeTransforms(AepsHistory);
sequelizePaginate.paginate(AepsHistory);

module.exports = AepsHistory;


