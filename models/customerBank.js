const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const User = require('./user');
const Customer = require('./customer');
const Company = require('./company');

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
CustomerBank.belongsTo(User, { foreignKey: 'refId', as: 'user' });
User.hasMany(CustomerBank, { foreignKey: 'refId', as: 'customerBanks' });

CustomerBank.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Company.hasMany(CustomerBank, { foreignKey: 'companyId', as: 'customerBanks' });

CustomerBank.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
Customer.hasMany(CustomerBank, { foreignKey: 'customerId', as: 'customerBanks' });

sequelizeTransforms(CustomerBank);
sequelizePaginate.paginate(CustomerBank);
module.exports = CustomerBank;
