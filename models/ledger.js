const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const User = require('./user');

let Ledger = sequelize.define(
  'ledger',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    companyId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'company',
        key: 'id'
      },
      allowNull: false
    },
    credit: {
      allowNull: true,
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    debit: {
      allowNull: true,
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    currentAmt: {
      allowNull: true,
      type: DataTypes.DOUBLE
    },
    oldAmt: {
      allowNull: true,
      type: DataTypes.DOUBLE
    },
    createdAt: {
      type: DataTypes.DATE
    },
    service: {
      type: DataTypes.STRING
    },
    userId: {
      allowNull: false,
      type: DataTypes.INTEGER,
      references: {
        model: User,
        key: 'id'
      }
    },
    roleType: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    walletType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['Bank', 'Prepaid']]
      }
    },
    transactionId: {
      type: DataTypes.STRING
    },
    description: {
      type: DataTypes.STRING
    },
    rechargeNo: {
      type: DataTypes.BIGINT
    },
    UTRNo: {
      type: DataTypes.STRING
    },
    bankName: {
      type: DataTypes.STRING
    },
    remark: {
      type: DataTypes.STRING
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isIn: [['Success', 'Failed', 'Pending']]
      }
    }
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

Ledger.belongsTo(User, { foreignKey: 'userId', as: 'user' });

sequelizeTransforms(Ledger);
sequelizePaginate.paginate(Ledger);
module.exports = Ledger;
