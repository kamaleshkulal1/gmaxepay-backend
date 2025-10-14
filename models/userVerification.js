/**
 * userverification.js
 * @description :: sequelize model of database table userverification
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');
let userverification = sequelize.define(
  'userverification',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: { type: DataTypes.INTEGER },
    emailVerify: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    mobileVerify: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    emailDetails: {
      type: DataTypes.JSON,
      allowNull: true
    },
    mobileDetails: {
      type: DataTypes.JSON,
      allowNull: true
    },
    aadharVerify: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    panVerify: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    aadharDetails: {
      type: DataTypes.JSON,
      allowNull: true
    },
    panDetails: {
      type: DataTypes.JSON,
      allowNull: true
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    hooks: {
      beforeCreate: [
        async function (userverification, options) {
          userverification.isActive = true;
          userverification.isDeleted = false;
        }
      ],
      beforeBulkCreate: [
        async function (userverification, options) {
          userverification.isActive = true;
          userverification.isDeleted = false;
        }
      ],
      beforeUpdate: [
        async function (userverification, options) {
          userverification.updatedAt = new Date();
        }
      ]
    }
  }
);
userverification.prototype.toJSON = function () {
  let values = Object.assign({}, this.get());
  return values;
};
sequelizeTransforms(userverification);
sequelizePaginate.paginate(userverification);
module.exports = userverification;
