/**
 * company.js
 * @description :: Sequelize model of database table company (for white-label tenants)
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');

let Company = sequelize.define(
  'company',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    companyName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    appName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    companyPan: {
      type: DataTypes.STRING,
      allowNull: false
    },
    companyGst: {
      type: DataTypes.STRING,
      allowNull: false
    },
    logo: {
      type: DataTypes.JSON,
      allowNull: true
    },
    favicon: {
      type: DataTypes.JSON,
      allowNull: true
    },
    primaryColor: {
      type: DataTypes.STRING,
      allowNull: true
    },
    secondaryColor: {
      type: DataTypes.STRING,
      allowNull: true
    },
    customDomain: {
      type: DataTypes.STRING,
      allowNull: true
    },
    contactName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    contactEmail: {
      type: DataTypes.STRING,
      allowNull: true
    },
    mobileNo: {
      type: DataTypes.STRING,
      allowNull: true
    },
    billingAddress: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    shippingAddress: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    modulesEnabled: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      allowNull: true,
    },
    remark: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  },
  {
    freezeTableName: true,
    timestamps: true,
  }
);


module.exports = Company;
