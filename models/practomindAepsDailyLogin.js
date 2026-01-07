/**
 * practomindAepsDailyLogin.js
 * @description :: sequelize model to store daily AEPS login records for Practomind
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');

/**
 * Get current date in Indian timezone (IST) as YYYY-MM-DD.
 * Kept here to ensure loginDate is always populated consistently even if controller forgets.
 */
const getIndianDateOnly = () => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now);
};

const PractomindAepsDailyLogin = sequelize.define(
  'practomindAepsDailyLogin',
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
      },
      comment: 'User ID reference'
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
      defaultValue: () => getIndianDateOnly(),
      comment: 'Date in Indian timezone (IST) for tracking daily logins'
    },
    responseMessage: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Response message from 2FA API'
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Response status from 2FA API'
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    hooks: {
      beforeValidate: (instance) => {
        if (!instance) return;
        if (!instance.loginDate) {
          instance.loginDate = getIndianDateOnly();
        }
      }
    },
    indexes: [
      {
        unique: false,
        fields: ['refId', 'companyId', 'loginDate']
      },
      {
        unique: false,
        fields: ['refId', 'companyId', 'isLoggedIn']
      },
      {
        unique: false,
        fields: ['loginDate', 'isLoggedIn']
      }
    ]
  }
);

sequelizeTransforms(PractomindAepsDailyLogin);
sequelizePaginate.paginate(PractomindAepsDailyLogin);

module.exports = PractomindAepsDailyLogin;

