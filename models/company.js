const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const { reusableModelAttribute } = require('../utils/common');

let Company = sequelize.define(
  'company',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    companyName: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    companyPan: {
      type: DataTypes.STRING,
      allowNull: false
    },
    companyGst: {
      type: DataTypes.STRING,
      allowNull: true
    },
    logo: {
      type: DataTypes.STRING,
      allowNull: true
    },
    favicon: {
      type: DataTypes.STRING,
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
      type: DataTypes.STRING(500),
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
    customerSupportEmail: {
      type: DataTypes.STRING,
      allowNull: true
    },
    singupPageDesign: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    navigationBar: {
      type: DataTypes.STRING,
      defaultValue: 'HORIZONTAL',
      attribute: ['HORIZONTAL', 'VERTICAL'],
    },
    mobileNo: {
      type: DataTypes.STRING,
      allowNull: true
    },
    supportPhoneNumbers: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true
    },
    BussinessEntity: {
      type: DataTypes.STRING(500),
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
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    timestamps: true,
  }
);


module.exports = Company;
