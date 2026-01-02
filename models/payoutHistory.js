const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const User = require('./user');

let PayoutHistory = sequelize.define('payoutHistory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  refId: {
    allowNull: false,
    type: DataTypes.INTEGER,
    references: {
      model: User,
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
  customerBankId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'customerBank',
      key: 'id'
    },
    allowNull: true
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isIn: [['internal', 'external']]
    },
    comment: 'internal for wallet transfer, external for bank transfer'
  },
  transactionID: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  amount: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  walletType: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'mainWallet or apesWallet'
  },
  paymentMode: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isIn: [['IMPS', 'NEFT']]
    }
  },
  // Bank details (for external payouts)
  accountNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  ifscCode: {
    type: DataTypes.STRING,
    allowNull: true
  },
  beneficiaryName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bankName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  mobile: {
    type: DataTypes.STRING,
    allowNull: true
  },
  latitude: {
    type: DataTypes.STRING,
    allowNull: true
  },
  longitude: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // ASL API response fields
  agentTransactionID: {
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
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'PENDING',
    validate: {
      isIn: [['SUCCESS', 'PENDING', 'FAILED', 'REFUND']]
    }
  },
  statusMessage: {
    type: DataTypes.STRING,
    allowNull: true
  },
  apiResponse: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Store full ASL API response'
  },
  openingBalance: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  closingBalance: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  remark: {
    type: DataTypes.STRING,
    allowNull: true
  },
  addedBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  updatedBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  freezeTableName: true,
  timestamps: true
});

PayoutHistory.belongsTo(User, { foreignKey: 'refId', as: 'user' });

sequelizeTransforms(PayoutHistory);
sequelizePaginate.paginate(PayoutHistory);
module.exports = PayoutHistory;

