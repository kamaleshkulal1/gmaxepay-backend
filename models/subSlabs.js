/**
 * subSlabs.js
 * @description :: sequelize model of database table subSlabs
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');
const Slab = require('./slab');

let SubSlab = sequelize.define(
  'SubSlab',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    parentSlabId: {
      type: DataTypes.INTEGER,
      references: {
        model: Slab,
        key: 'id'
      },
      allowNull: true,
      comment: 'Reference to parent slab (null for company-level slabs)'
    },
    companyId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'company',
        key: 'id'
      },
      allowNull: false
    },
    userId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'user',
        key: 'id'
      },
      allowNull: true,
      comment: 'User who owns this sub-slab (MD, Distributor, etc.)'
    },
    userType: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'User type: 5=MASTER_DISTRIBUTOR, 6=DISTRIBUTOR, 4=RETAILER'
    },
    subSlabName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    slabType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'level',
      validate: {
        isIn: [['level', 'channel']]
      }
    },
    remark: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    users: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      allowNull: true,
      defaultValue: [],
      comment: 'Array of user IDs assigned to this sub-slab'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    isDelete: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    ...reusableSMSAttribute
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

// Relationships are defined in models/index.js

SubSlab.prototype.toJSON = function () {
  let values = { ...this.get() };
  delete values.addedBy;
  delete values.updatedBy;
  return values;
};

sequelizeTransforms(SubSlab);
sequelizePaginate.paginate(SubSlab);
module.exports = SubSlab;

