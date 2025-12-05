const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableTransactionAttribute } = require('../utils/common');
const Operator = require('./operatorMaster');

let RetailerCommission = sequelize.define(
  'retailerCommission',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    schemaId: {
      allowNull: false,
      type: DataTypes.INTEGER,
      references: {
        model: 'schema',
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
    retailerId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'user',
        key: 'id'
      },
      allowNull: false,
      comment: 'Retailer user ID'
    },
    operatorId: {
      allowNull: false,
      type: DataTypes.INTEGER,
      references: {
        model: Operator,
        key: 'id'
      }
    },
    operatorName: {
      type: DataTypes.STRING
    },
    operatorType: {
      allowNull: false,
      type: DataTypes.STRING
    },
    roleType: {
      allowNull: false,
      type: DataTypes.INTEGER,
      defaultValue: 5,
      comment: '5-Retailer'
    },
    roleName: {
      allowNull: false,
      type: DataTypes.STRING,
      defaultValue: 'RE'
    },
    commAmt: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    commType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['com', 'sur']]
      }
    },
    amtType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['fix', 'per']]
      }
    },
    paymentMode: {
      allowNull: true,
      type: DataTypes.STRING
    },
    ...reusableTransactionAttribute
  },
  {
    freezeTableName: true,
    indexes: [
      {
        unique: true,
        fields: ['schemaId', 'operatorId', 'commType', 'retailerId'],
        name: 'unique_retailer_commission'
      }
    ]
  }
);

// Relationships will be defined in models/index.js

sequelizeTransforms(RetailerCommission);
sequelizePaginate.paginate(RetailerCommission);
module.exports = RetailerCommission;

