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
      allowNull: true // Nullable for global slabs created by SuperAdmin
    },
    slabName: {
      type: DataTypes.STRING,
      allowNull: false
      // Unique constraint will be handled at application level (companyId + slabName)
    },
    templateType: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isIn: [['Basic', 'Gold', 'Platinum', 'Custom', null]]
      }
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
