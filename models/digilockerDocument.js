
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');

const DigilockerDocument = sequelize.define(
  'digilockerDocument',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      index: true
    },
    refId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      index: true,
      references: {
        model: 'user',
        key: 'id'
      }
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      index: true,
      references: {
        model: 'company',
        key: 'id'
      }
    },
    documentType: {
      type: DataTypes.ENUM('AADHAAR', 'PAN'),
      allowNull: false,
      index: true
    },
    verificationId: {
      type: DataTypes.STRING,
      allowNull: false,
      index: true
    },
    referenceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      index: true
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Aadhaar specific fields
    name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    uid: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Aadhaar number (masked)'
    },
    dob: {
      type: DataTypes.STRING,
      allowNull: true
    },
    gender: {
      type: DataTypes.STRING,
      allowNull: true
    },
    careOf: {
      type: DataTypes.STRING,
      allowNull: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    splitAddress: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Structured address components'
    },
    yearOfBirth: {
      type: DataTypes.STRING,
      allowNull: true
    },
    photoLink: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Base64 encoded photo (Aadhaar only)'
    },
    xmlFile: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'XML file URL'
    },
    // PAN specific fields
    panNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'PAN number'
    },
    panName: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Name on PAN card'
    },
    panFatherName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    panDob: {
      type: DataTypes.STRING,
      allowNull: true
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    txid: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    // Store full response as JSON for flexibility
    fullResponse: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Complete API response stored as JSON'
    },
    ...reusableModelAttribute
  },
  {
    tableName: 'digilocker_documents',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

sequelizeTransforms(DigilockerDocument);
sequelizePaginate.paginate(DigilockerDocument);
module.exports = DigilockerDocument;

