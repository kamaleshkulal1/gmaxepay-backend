const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizeTransforms = require('sequelize-transforms');
const sequelizePaginate = require('sequelize-paginate');
const { reusableAttributes } = require('../utils/common');

const BBPSOperator = sequelize.define(
  'bbpsOperator',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    billerId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'bbpsOperatorCategory',
        key: 'id'
      }
    },
    billerImage: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    initChannel: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'INT'
    },
    ...reusableAttributes
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

sequelizeTransforms(BBPSOperator);
sequelizePaginate.paginate(BBPSOperator);

module.exports = BBPSOperator;
