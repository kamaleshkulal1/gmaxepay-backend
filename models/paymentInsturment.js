const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableTransactionAttribute } = require('../utils/common');

let PaymentInsturment = sequelize.define(
  'paymentInsturment',
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
    type: {
      type: DataTypes.STRING,
      allowNull: false
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    ...reusableTransactionAttribute
  },
  {
    freezeTableName: true
  }
);

sequelizeTransforms(PaymentInsturment);
sequelizePaginate.paginate(PaymentInsturment);

module.exports = PaymentInsturment;
