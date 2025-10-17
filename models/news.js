/**
 * userverification.js
 * @description :: sequelize model of database table userverification
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');
let news = sequelize.define(
  'news',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
   companyId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'company',
        key: 'id'
      },
      allowNull: true
    },
    title: {
      type: DataTypes.STRING
    },
    msg: {
      type: DataTypes.STRING
    },
    roles: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      defaultValue: []
    },

    ...reusableSMSAttribute
  },
  {
    freezeTableName: true
  }
);

sequelizeTransforms(news);
sequelizePaginate.paginate(news);
module.exports = news;
