const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');

let Bank = sequelize.define(
  'bank',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    bankId: {
      type: DataTypes.STRING
    },
    bankName: {
      type: DataTypes.STRING
    }
  },
  {
    freezeTableName: true
  }
);

sequelizeTransforms(Bank);
sequelizePaginate.paginate(Bank);
module.exports = Bank;
