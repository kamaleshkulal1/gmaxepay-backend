/**
 * user.js
 * @description :: sequelize model of database table user
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');

let Operator = sequelize.define(
  'operator',
  {
    operatorName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    operatorCode: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    commSettingType: {
      type: DataTypes.STRING
    },
    allowedChannel: {
      type: DataTypes.STRING
    },
    length: {
      type: DataTypes.INTEGER
    },
    maxLength: {
      type: DataTypes.INTEGER
    },
    operatorType: {
      type: DataTypes.STRING
    },
    businessModel: {
      type: DataTypes.STRING
    },
    minValue: {
      type: DataTypes.INTEGER
    },
    maxValue: {
      type: DataTypes.INTEGER
    },
    hsnCode: {
      type: DataTypes.STRING
    },
    startWithValue: {
      type: DataTypes.STRING
    },
    isAccountNumeric: {
      type: DataTypes.BOOLEAN
    },
    isBBPS: {
      type: DataTypes.BOOLEAN
    },
    accountName: {
      type: DataTypes.STRING
    },
    accountRemark: {
      type: DataTypes.STRING
    },
    isBillingAllowed: {
      type: DataTypes.BOOLEAN
    },
    exactness: {
      type: DataTypes.STRING
    },
    inSlab: {
      type: DataTypes.BOOLEAN
    },
    isTakeCustomerNum: {
      type: DataTypes.BOOLEAN
    },
    image: {
      type: DataTypes.JSON
    },
    tollFree: {
      type: DataTypes.STRING
    },
    billerId: {
      type: DataTypes.STRING
    },
    planService: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    circleValidationType: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isIn: [['NO', 'API', 'TABLE']]
      }
    },
    ...reusableSMSAttribute
  },
  {
    freezeTableName: true
  }
);

sequelizeTransforms(Operator);
sequelizePaginate.paginate(Operator);
module.exports = Operator;
