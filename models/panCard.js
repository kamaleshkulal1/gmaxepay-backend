/**
 * panCard.js
 * @description :: sequelize model of database table pan_cards
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');

const PanCard = sequelize.define(
  'panCard',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      index: true
    },
    session_id: {
      type: DataTypes.STRING,
      unique: true,
      index: true,
      allowNull: false
    },
    pan_number: {
      type: DataTypes.STRING,
      allowNull: true,
      index: true
    },
    pan_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    pan_front_image:{
        type: DataTypes.TEXT,
        allowNull: true
    },
    dob: {
      type: DataTypes.STRING,
      allowNull: true
    },
    number_matches: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: true
    }
  },
  {
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

sequelizeTransforms(PanCard);
sequelizePaginate.paginate(PanCard);
module.exports = PanCard;

