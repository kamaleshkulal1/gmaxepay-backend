const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizeTransforms = require('sequelize-transforms');
const sequelizePaginate = require('sequelize-paginate');
const { reusableAttributes } = require('../utils/common');

const BBPSOperatorCategory = sequelize.define(
  'bbpsOperatorCategory',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    custConvFee: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    flatFee: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    isCCF1Category: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    percentFee: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    gstRate: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    ...reusableAttributes
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

sequelizeTransforms(BBPSOperatorCategory);
sequelizePaginate.paginate(BBPSOperatorCategory);

module.exports = BBPSOperatorCategory;
