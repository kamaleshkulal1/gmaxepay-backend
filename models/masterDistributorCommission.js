const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableTransactionAttribute } = require('../utils/common');
const Operator = require('./operatorMaster');
const Schema = require('./schema');
const Company = require('./company');
const User = require('./user');

let MasterDistributorCommission = sequelize.define(
  'masterDistributorCommission',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    schemaId: {
      allowNull: false,
      type: DataTypes.INTEGER,
      references: {
        model: 'schema',
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
    masterDistributorId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'user',
        key: 'id'
      },
      allowNull: false,
      comment: 'Master Distributor user ID'
    },
    assignedToUserId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'user',
        key: 'id'
      },
      allowNull: true,
      comment: 'User ID of downline (Distributor/Retailer)'
    },
    operatorId: {
      allowNull: false,
      type: DataTypes.INTEGER,
      references: {
        model: Operator,
        key: 'id'
      }
    },
    operatorName: {
      type: DataTypes.STRING
    },
    operatorType: {
      allowNull: false,
      type: DataTypes.STRING
    },
    roleType: {
      allowNull: false,
      type: DataTypes.INTEGER,
      comment: '4-Distributor, 5-Retailer'
    },
    roleName: {
      allowNull: false,
      type: DataTypes.STRING
    },
    commAmt: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    commType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['com', 'sur']]
      }
    },
    amtType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['fix', 'per']]
      }
    },
    paymentMode: {
      allowNull: true,
      type: DataTypes.STRING
    },
    ...reusableTransactionAttribute
  },
  {
    freezeTableName: true,
    indexes: [
      {
        unique: true,
        fields: ['schemaId', 'operatorId', 'roleType', 'commType', 'masterDistributorId', 'assignedToUserId'],
        name: 'unique_md_commission'
      }
    ]
  }
);

// Relationships will be defined in models/index.js

sequelizeTransforms(MasterDistributorCommission);
sequelizePaginate.paginate(MasterDistributorCommission);
module.exports = MasterDistributorCommission;

