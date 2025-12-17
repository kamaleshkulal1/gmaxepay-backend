/**
 * aepsDailyLogin.js
 * @description :: sequelize model to store daily AEPS login records
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
      defaultValue: () => getIndianDateOnly(),
      comment: 'Date in Indian timezone (IST) for tracking daily logins'
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
      }
    ]
  }
);

sequelizeTransforms(AepsDailyLogin);
sequelizePaginate.paginate(AepsDailyLogin);

module.exports = AepsDailyLogin;

