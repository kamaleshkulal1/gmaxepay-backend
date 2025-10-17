/**
 * service.js
 * @description :: sequelize model of database table service
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');
const models = require('./index');

let Services = sequelize.define(
  'services',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    serviceName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    ...reusableSMSAttribute
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

Services.prototype.toJSON = function () {
  let values = { ...this.get() };
  delete values.addedBy;
  delete values.updatedBy;
  return values;
};

sequelizeTransforms(Services);
sequelizePaginate.paginate(Services);

module.exports = Services;
