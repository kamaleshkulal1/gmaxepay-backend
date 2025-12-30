const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizeTransforms = require('sequelize-transforms');
const sequelizePaginate = require('sequelize-paginate');
const { reusableAttributes } = require('../utils/common');

const BBPSBillerInfo = sequelize.define(
  'bbpsBillerInfo',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    billerId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    requestId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    response: {
      type: DataTypes.JSON,
      defaultValue: {},
      allowNull: true
    },
    responseCode: {
      type: DataTypes.STRING,
      allowNull: true
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    ...reusableAttributes
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

sequelizeTransforms(BBPSBillerInfo);
sequelizePaginate.paginate(BBPSBillerInfo);

module.exports = BBPSBillerInfo;
