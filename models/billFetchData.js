const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const User = require('./user');
const sequelizeTransforms = require('sequelize-transforms');

let BillFetchData = sequelize.define(
  'billFetchData',
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
        model: 'user',
        key: 'id'
      }
    },
    agentId: {
      type: DataTypes.STRING
    },
    billerId: {
      type: DataTypes.STRING
    },
    billerAdhoc: {
      type: DataTypes.STRING
    },
    operatorService: {
      type: DataTypes.STRING
    },
    agentDeviceInfo: {
      type: DataTypes.TEXT
    },
    customerInfo: {
      type: DataTypes.TEXT
    },
    inputParams: {
      type: DataTypes.TEXT
    },
    billerDetails: {
      type: DataTypes.TEXT
    },
    additionalInfo: {
      type: DataTypes.TEXT
    },
    responseData: {
      type: DataTypes.TEXT
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    fetchRefId: {
      allowNull: false,
      type: DataTypes.STRING
    },
    expiresAt: {
      type: DataTypes.DATE
    },
    status: {
      type: DataTypes.STRING,
      validate: {
        isIn: [['Success', 'Pending', 'Failed']]
      }
    },
    initiatingChannel: {
      allowNull: true,
      type: DataTypes.STRING
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
    }
  },
  {
    freezeTableName: true
  }
);

sequelizeTransforms(BillFetchData);
sequelizePaginate.paginate(BillFetchData);

module.exports = BillFetchData;
