const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');

// Master bank list (supports logo + IIN)
let AslBankList = sequelize.define(
  'aslBankList',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    bankName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    bankIIN: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    bankLogo: {
      type: DataTypes.STRING,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  },
  {
    freezeTableName: true
  }
);

sequelizeTransforms(AslBankList);
sequelizePaginate.paginate(AslBankList);
module.exports = AslBankList;

