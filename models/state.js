const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');

let State = sequelize.define(
  'state',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    code: {
      type: DataTypes.INTEGER
    },
    name: {
      type: DataTypes.STRING
    }
  },
  {
    freezeTableName: true
  }
);

sequelizeTransforms(State);
sequelizePaginate.paginate(State);
module.exports = State;
