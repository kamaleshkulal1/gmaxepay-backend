/**
 * packages.js
 * @description :: sequelize model of database table packages
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');

let Slab = sequelize.define(
  'Slab',
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
      allowNull: false
    },
    slabName: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    slabType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['level', 'channel']]
      }
    },
    slabScope: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'private',
      validate: {
        isIn: [['global', 'private']]
      }
    },
    remark: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    isSignUpB2B: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    users: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      allowNull: true,
      defaultValue: []
    },

    ...reusableSMSAttribute
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

Slab.prototype.toJSON = function () {
  let values = { ...this.get() };
  delete values.addedBy;
  delete values.updatedBy;
  return values;
};

sequelizeTransforms(Slab);
sequelizePaginate.paginate(Slab);
module.exports = Slab;
