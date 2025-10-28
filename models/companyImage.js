/**
 * companyImage.js
 * @description :: Sequelize model of database table companyImage
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');

let CompanyImage = sequelize.define(
  'companyImage',
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
    image: {
      type: DataTypes.STRING, // S3 URL
      allowNull: false
    },
    s3Key: {
      type: DataTypes.STRING, // S3 object key for deletion
      allowNull: false
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Type: loginSlider, signature'
    },
    subtype: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'For signature type: logo,favicon, banner, stamp, signature'
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'company',
        key: 'id'
      }
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'user',
        key: 'id'
      }
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

module.exports = CompanyImage;

