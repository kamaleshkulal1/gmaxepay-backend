const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');
const User = require('./user');

const CmsHistory = sequelize.define(
  'cmsHistory',
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
    referenceId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    amount: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    billerId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    billerName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    mobileNo: {
      type: DataTypes.STRING,
      allowNull: true
    },
    commission: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'PENDING'
    },
    event: {
      type: DataTypes.STRING,
      allowNull: true
    },
    utr: {
      type: DataTypes.STRING,
      allowNull: true
    },
    ackno: {
      type: DataTypes.STRING,
      allowNull: true
    },
    uniqueId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    errorMsg: {
      type: DataTypes.STRING,
      allowNull: true
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true
    },
    openingWallet: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    closingWallet: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    debit: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    credit: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    superadminComm: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    whitelabelComm: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    masterDistributorCom: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    distributorCom: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    retailerCom: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    superadminCommTDS: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    whitelabelCommTDS: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    masterDistributorComTDS: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    distributorComTDS: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    retailerComTDS: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    superAdminAvail: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    whitelabelAvail: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    masterDistributorAvail: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    distributorAvail: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    retailerAvail: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    requestPayload: {
      type: DataTypes.JSON,
      allowNull: true
    },
    responsePayload: {
      type: DataTypes.JSON,
      allowNull: true
    },
    addedBy: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    timestamps: true,
    indexes: [
      { fields: ['referenceId'] },
      { fields: ['refId', 'companyId'] },
      { fields: ['status'] },
      { fields: ['createdAt'] }
    ]
  }
);

CmsHistory.belongsTo(User, { foreignKey: 'refId', as: 'user' });

sequelizeTransforms(CmsHistory);
sequelizePaginate.paginate(CmsHistory);

module.exports = CmsHistory;
