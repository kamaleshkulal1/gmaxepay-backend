/**
 * rechargePlanFetch.js
 * @description :: sequelize model of database table recharge_plan_fetch
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');

const RechargePlanFetch = sequelize.define(
  'rechargePlanFetch',
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
      comment: 'Stores the recharge plan fetch response'
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

sequelizeTransforms(RechargePlanFetch);
sequelizePaginate.paginate(RechargePlanFetch);

module.exports = RechargePlanFetch;
