const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');

let CustomerBank = sequelize.define('customerBank', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  retailerName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  refId: {
    allowNull: false,
    type: DataTypes.INTEGER,
    references: {
      model: "user",
      key: 'id'
    }
  },
  customerId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'customer',
      key: 'id'
    }
  },
  companyId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'company',
      key: 'id'
    },
    allowNull: false
  },
  
  bankName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  beneficiaryName: {
    type: DataTypes.STRING
  },
  accountNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  ifsc: {
    type: DataTypes.STRING,
    allowNull: false
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true
  },
  branch: {
    type: DataTypes.STRING,
    allowNull: true
  },
  utrn: {
    type: DataTypes.STRING,
    allowNull: true
  },
  orderId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  referenceId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN
  }
});

sequelizeTransforms(CustomerBank);
sequelizePaginate.paginate(CustomerBank);
module.exports = CustomerBank;
