const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');

let PayoutList = sequelize.define('payoutList', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  freezeTableName: true,
  timestamps: true
});

module.exports = PayoutList;
