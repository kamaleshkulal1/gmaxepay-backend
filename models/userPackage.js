/**
 * userPackage.js
 * @description :: sequelize model of database table userPackage
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');
const Package = require('./packages');
const User = require('./user');

let userPackage = sequelize.define(
  'userPackage',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: 'id'
      }
    },
    packageId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Package,
        key: 'id'
      }
    },
    packageName: {
      type: DataTypes.STRING
    },
    serviceId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    serviceName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    cost: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    ...reusableSMSAttribute
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

userPackage.prototype.toJSON = function () {
  let values = Object.assign({}, this.get());
  delete values.addedBy;
  delete values.updatedBy;
  return values;
};

sequelizeTransforms(userPackage);
sequelizePaginate.paginate(userPackage);

module.exports = userPackage;
