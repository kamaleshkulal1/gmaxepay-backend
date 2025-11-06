/**
 * onboardingToken.js
 * @description :: Sequelize model of database table onboardingToken
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const { reusableModelAttribute } = require('../utils/common');

let OnboardingToken = sequelize.define(
  'onboardingToken',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'user',
        key: 'id'
      }
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'company',
        key: 'id'
      }
    },
    token: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    isDeactivated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    isUsed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['token']
      },
      {
        fields: ['userId', 'isUsed']
      },
      {
        fields: ['expiresAt']
      }
    ]
  }
);

module.exports = OnboardingToken;

