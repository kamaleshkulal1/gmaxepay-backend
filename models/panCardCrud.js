/**
 * panCardCrud.js
 * @description :: sequelize model of database table pan_card_crud
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');

const panCardCrud = sequelize.define(
  'panCardCrud',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    refId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'user',
        key: 'id'
      }
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'company',
        key: 'id'
      }
    },
    orderid: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      index: true
    },
    transactionId: {
      type: DataTypes.STRING,
      allowNull: true,
      index: true
    },
    mobile_number: {
      type: DataTypes.STRING,
      allowNull: false
    },
    redirect_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'Pending'
    },
    action: {
      type: DataTypes.STRING ,
      allowNull: false,
      defaultValue: 'new'
    },
    request: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    response: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true
  }
);

sequelizeTransforms(panCardCrud);
sequelizePaginate.paginate(panCardCrud);
module.exports = panCardCrud;

