const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizeTransforms = require('sequelize-transforms');
const sequelizePaginate = require('sequelize-paginate');

const BBPSPaymentInfo = sequelize.define(
  'bbpsPaymentInfo',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    initiatingChannel: {
      type: DataTypes.STRING,
      allowNull: true
    },
    paymentMethod: {
      type: DataTypes.JSON,
      allowNull: false
    },
    paymentInfo: {
      type: DataTypes.JSON,
      allowNull: false
    }
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

sequelizeTransforms(BBPSPaymentInfo);
sequelizePaginate.paginate(BBPSPaymentInfo);

module.exports = BBPSPaymentInfo;
