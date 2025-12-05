const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');

let Schema = sequelize.define(
  'schema',
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
    schemaName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    schemaType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['good', 'bad', 'custom']]
      },
      defaultValue: 'custom'
    },
    createdBy: {
      type: DataTypes.INTEGER,
      references: {
        model: 'user',
        key: 'id'
      },
      allowNull: false
    },
    assignedTo: {
      type: DataTypes.INTEGER,
      references: {
        model: 'user',
        key: 'id'
      },
      allowNull: true
    },
    roleType: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '1-SuperAdmin, 2-CompanyAdmin, 3-MasterDistributor, 4-Distributor, 5-Retailer'
    },
    roleName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['companyId', 'schemaName', 'roleType', 'createdBy'],
        name: 'unique_schema_company_role'
      }
    ]
  }
);

// Relationships will be defined in models/index.js

sequelizeTransforms(Schema);
sequelizePaginate.paginate(Schema);
module.exports = Schema;

