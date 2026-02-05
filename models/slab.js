
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
      allowNull: false,
      references: {
        model: 'company',
        key: 'id'
      }
    },
    slabName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    templateType: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isIn: [['Basic', 'Gold', 'Platinum']]
      }
    },
    schemaMode: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isIn: [['global', 'private']]
      },
      comment: 'Schema mode: global or private (customization)'
    },
    schemaType: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isIn: [['free', 'premium']]
      },
      comment: 'Schema type: free or premium'
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
    views: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      allowNull: true,
      defaultValue: []
    },
    subscriptionAmount: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0
    },
    addedByRole: {
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

Slab.prototype.toJSON = function () {
  let values = { ...this.get() };
  delete values.addedBy;
  delete values.updatedBy;
  return values;
};

sequelizeTransforms(Slab);
sequelizePaginate.paginate(Slab);
module.exports = Slab;
