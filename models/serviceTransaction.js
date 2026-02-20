const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');
const User = require('./user');

let ServiceTransaction = sequelize.define(
  'serviceTransaction',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
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
    // Service type: 'MobileRecharge', 'DTHRecharge', 'Pan'
    serviceType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['MobileRecharge', 'DTHRecharge', 'Pan']]
      },
      index: true
    },
    // Common fields for all services
    orderid: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      index: true
    },
    transactionId: {
      type: DataTypes.STRING,
      allowNull: true,
      index: true
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'PENDING',
      validate: {
        isIn: [['SUCCESS', 'FAILURE', 'PENDING', 'REFUNDED']]
      }
    },
    // Mobile Recharge & DTH specific fields
    mobileNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'For mobile recharge'
    },
    dthNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'For DTH recharge'
    },
    opcode: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Operator code for mobile/DTH'
    },
    circle: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Circle for mobile recharge'
    },
    amount: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Amount for mobile/DTH recharge'
    },
    // PAN Card specific fields
    mobile_number: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Mobile number for PAN card operations'
    },
    redirect_url: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Redirect URL for PAN card'
    },
    action: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isIn: [['new', 'correction', null]]
      },
      comment: 'Action for PAN card: new or correction'
    },
    // Common response fields
    txid: {
      type: DataTypes.STRING,
      allowNull: true
    },
    opid: {
      type: DataTypes.STRING,
      allowNull: true
    },
    message: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Additional value fields for mobile recharge
    value1: {
      type: DataTypes.STRING,
      allowNull: true
    },
    value2: {
      type: DataTypes.STRING,
      allowNull: true
    },
    value3: {
      type: DataTypes.STRING,
      allowNull: true
    },
    value4: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // API response storage
    apiResponse: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Store full API response'
    },
    request: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Store request data (for PAN card)'
    },
    response: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Store response data (for PAN card)'
    },
    // Commission Breakdown (for mobile/DTH recharge)
    superadminComm: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    whitelabelComm: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    masterDistributorCom: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    distributorCom: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    retailerCom: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    timestamps: true,
    indexes: [
      {
        fields: ['refId', 'companyId', 'serviceType']
      },
      {
        fields: ['orderid']
      },
      {
        fields: ['status']
      }
    ]
  }
);

ServiceTransaction.belongsTo(User, { foreignKey: 'refId', as: 'user' });

ServiceTransaction.prototype.toJSON = function () {
  let values = Object.assign({}, this.get());
  return values;
};

sequelizeTransforms(ServiceTransaction);
sequelizePaginate.paginate(ServiceTransaction);

module.exports = ServiceTransaction;
