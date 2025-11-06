/**
 * user.js
 * @description :: sequelize model of database table user
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableTransactionAttribute } = require('../utils/common');
const User = require('./user');

let Outlet = sequelize.define(
  'outlet',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    refId: {
      // allowNull: false,
      type: DataTypes.INTEGER,
      references: {
        model: User,
        key: 'id'
      }
    },
    outletGoogleMapsLink: {
      type: DataTypes.STRING,
      allowNull: true
    },
    companyId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'company',
        key: 'id'
      },   
      allowNull: false
    },
    shopName: { type: DataTypes.STRING, allowNull: false },
    shopAddress: { type: DataTypes.STRING, allowNull: false },
    gstNo: { type: DataTypes.STRING, allowNull: true },
    gstCertificate: {
      type: DataTypes.JSON,
      allowNull: true
    },
    shopImage: {
      type: DataTypes.JSON,
      allowNull: true
    },
    shopImageVerify: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    gstCertificateVerify: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    mobileNo: {
      type: DataTypes.STRING,
      allowNull: true
    },
    userRole: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    ifscCode: {
      type: DataTypes.STRING,
      allowNull: true
    },
    zipCode: {
      type: DataTypes.STRING,
      allowNull: true
    },
    accountNo: {
      type: DataTypes.BIGINT,
      allowNull: true,
      unique: true
    },
    bankName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    branchName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    bankAddress: {
      type: DataTypes.STRING,
      allowNull: true
    },
    bankCity: {
      type: DataTypes.STRING,
      allowNull: true
    },
    passPhoto: {
      type: DataTypes.JSON,
      allowNull: true
    },
    holderName: {
      type: DataTypes.STRING
    },
    shopCity:{
      type: DataTypes.STRING,
      allowNull: true
    },
    shopDistrict:{
      type: DataTypes.STRING,
      allowNull: true
    },
    shopState:{
      type: DataTypes.STRING,
      allowNull: true
    },
    shopPincode:{
      type: DataTypes.STRING,
      allowNull: true
    },
    ...reusableTransactionAttribute
  },
  {
    freezeTableName: true
  }
);

Outlet.belongsTo(User, { foreignKey: 'refId', as: 'user' });
User.hasMany(Outlet, { foreignKey: 'refId', as: 'outlet' });

sequelizeTransforms(Outlet);
sequelizePaginate.paginate(Outlet);
module.exports = Outlet;
