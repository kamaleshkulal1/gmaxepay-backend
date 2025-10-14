/**
 * notification.js
 * @description :: sequelize model of database table notification
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableAttributes } = require('../utils/common');

let notification = sequelize.define(
  'notification',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING
    },
    msg: {
      type: DataTypes.STRING
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    ...reusableAttributes
  },
  {
    freezeTableName: true
  }
);

sequelizeTransforms(notification);
sequelizePaginate.paginate(notification);
module.exports = notification;
