/**
 * findMobileOperators.js
 * @description :: sequelize model of database table find_mobile_operators
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');

const FindMobileOperators = sequelize.define(
  'findMobileOperators',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      index: true
    },
    mobileNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      index: true
    },
    response: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: 'Stores the operator fetch response'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

sequelizeTransforms(FindMobileOperators);
sequelizePaginate.paginate(FindMobileOperators);

module.exports = FindMobileOperators;
