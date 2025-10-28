/**
 * employee.js
 * @description :: sequelize model of database table employee
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { convertObjectToEnum } = require('../utils/common');
const authConstantEnum = require('../constants/authConstant');

let userLogin = sequelize.define(
  'userLogin',
  {
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    companyId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'company',
        key: 'id'
      },
      allowNull: false
    },
    user_type: {
      type: DataTypes.INTEGER,
      // allowNull: false,
      values: convertObjectToEnum(authConstantEnum.USERS)
    },
    isLoggedIn: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    login_time: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    logout_time: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    latitude: {
      type: DataTypes.STRING
    },
    longitude: {
      type: DataTypes.STRING
    },
    ipAddress: {
      type: DataTypes.TEXT
    }
  },
  {
    freezeTableName: true,
    hooks: {
      beforeCreate: (userLogin, options) => {
        userLogin.login_time = new Date();
      },
      beforeUpdate: (userLogin, options) => {
        if (userLogin.changed('isLoggedIn') && !userLogin.isLoggedIn) {
          userLogin.logout_time = new Date();
        }
      }
    }
  }
);

sequelizeTransforms(userLogin);
sequelizePaginate.paginate(userLogin);
module.exports = userLogin;
