const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableAttributes } = require('../utils/common');

let CardType = sequelize.define(
  'cardType',
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
    ...reusableAttributes
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

sequelizeTransforms(CardType);
sequelizePaginate.paginate(CardType);
module.exports = CardType;
