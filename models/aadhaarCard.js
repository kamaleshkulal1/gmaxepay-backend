/**
 * aadhaarCard.js
 * @description :: sequelize model of database table aadhaar_cards
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');

const AadhaarCard = sequelize.define(
  'aadhaarCard',
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
    // Front side fields
    front_photo: {
      type: DataTypes.TEXT, // Base64 encoded photo
      allowNull: true
    },
    front_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    front_dob: {
      type: DataTypes.STRING,
      allowNull: true
    },
    front_gender: {
      type: DataTypes.STRING,
      allowNull: true
    },
    front_aadhaar_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    front_confidence: {
      type: DataTypes.FLOAT,
      defaultValue: 0.0,
      allowNull: true
    },
    // Back side fields
    back_address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    back_aadhaar_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    back_confidence: {
      type: DataTypes.FLOAT,
      defaultValue: 0.0,
      allowNull: true
    },
    // Status
    is_complete: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: true
    }
  },
  {
    tableName: 'aadhaar_cards',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

sequelizeTransforms(AadhaarCard);
sequelizePaginate.paginate(AadhaarCard);
module.exports = AadhaarCard;

