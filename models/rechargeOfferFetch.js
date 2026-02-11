/**
 * rechargeOfferFetch.js
 * @description :: sequelize model of database table recharge_offer_fetch
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');

const RechargeOfferFetch = sequelize.define(
  'rechargeOfferFetch',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      index: true
    },
    opCode: {
      type: DataTypes.STRING,
      allowNull: false,
      index: true,
      comment: 'Operator code'
    },
    response: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: 'Stores the recharge offer fetch response'
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

sequelizeTransforms(RechargeOfferFetch);
sequelizePaginate.paginate(RechargeOfferFetch);

module.exports = RechargeOfferFetch;
