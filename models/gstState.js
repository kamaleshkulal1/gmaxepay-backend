const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');

let GstState = sequelize.define(
  'gstState',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    gstCode: {
      type: DataTypes.STRING
    },
    state: {
      type: DataTypes.STRING
    }
  },
  {
    freezeTableName: true
  }
);

sequelizeTransforms(GstState);
sequelizePaginate.paginate(GstState);
module.exports = GstState;
