const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');

let Category = sequelize.define(
  'category',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    isParent: {
      type: DataTypes.BOOLEAN,
      defaultValue: null
    },
    parentId: {
      type: DataTypes.INTEGER,
      defaultValue: null
    }
  },
  {
    freezeTableName: true
  }
);

sequelizeTransforms(Category);
sequelizePaginate.paginate(Category);
module.exports = Category;
