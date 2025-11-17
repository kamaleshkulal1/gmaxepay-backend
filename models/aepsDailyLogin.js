/**
 * aepsDailyLogin.js
 * @description :: sequelize model to store daily AEPS login records
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');

const AepsDailyLogin = sequelize.define(
  'aepsDailyLogin',
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
    loginTime: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    logoutTime: {
      type: DataTypes.DATE,
      allowNull: true
    },
    isLoggedIn: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false
    },
    loginDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: 'Date in Indian timezone (IST) for tracking daily logins'
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    indexes: [
      {
        unique: false,
        fields: ['refId', 'companyId', 'loginDate']
      },
      {
        unique: false,
        fields: ['refId', 'companyId', 'isLoggedIn']
      }
    ]
  }
);

sequelizeTransforms(AepsDailyLogin);
sequelizePaginate.paginate(AepsDailyLogin);

module.exports = AepsDailyLogin;

