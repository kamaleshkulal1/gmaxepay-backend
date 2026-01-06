/**
 * practomindState.js
 * @description :: sequelize model of database table practomindState
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');

let PractomindState = sequelize.define(
  'practomindState',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    stateId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    state: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    stateCode: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

PractomindState.prototype.toJSON = function () {
  let values = { ...this.get() };
  delete values.addedBy;
  delete values.updatedBy;
  return values;
};

sequelizeTransforms(PractomindState);
sequelizePaginate.paginate(PractomindState);
module.exports = PractomindState;

