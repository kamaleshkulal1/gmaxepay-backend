/**
 * subscription.js
 * @description :: sequelize model of database table subscription
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');
const User = require('./user');
const Service = require('./service');

let Subscription = sequelize.define(
  'subscription',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    refId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: 'id'
      }
    },
    serviceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Service,
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
    subscriptionType: {
      type: DataTypes.ENUM('one_time'),
      defaultValue: 'one_time',
      allowNull: false
    },
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'failed', 'cancelled'),
      defaultValue: 'pending',
      allowNull: false
    },
    paymentMethod: {
      type: DataTypes.STRING,
      allowNull: true
    },
    transactionId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    subscribedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    userType: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '1=SUPER_ADMIN, 2=ADMIN, 4=RETAILER, 5=MASTER_DISTRIBUTOR, 6=DISTRIBUTOR, 13=WHITELABEL_ADMIN'
    },
    creditUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'user',
        key: 'id'
      },
      comment: 'User who receives credit/benefit from this subscription'
    },
    debitUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'user',
        key: 'id'
      },
      comment: 'User who pays/debits for this subscription'
    },
    action: {
      type: DataTypes.ENUM('subscribed', 'renewed', 'cancelled', 'expired', 'failed'),
      allowNull: false,
      defaultValue: 'subscribed'
    },
    actionDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ...reusableSMSAttribute
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

Subscription.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Subscription.belongsTo(User, { foreignKey: 'creditUserId', as: 'creditUser' });
Subscription.belongsTo(User, { foreignKey: 'debitUserId', as: 'debitUser' });
Subscription.belongsTo(Service, { foreignKey: 'serviceId', as: 'service' });

Subscription.prototype.toJSON = function () {
  let values = Object.assign({}, this.get());
  delete values.addedBy;
  delete values.updatedBy;
  return values;
};

sequelizeTransforms(Subscription);
sequelizePaginate.paginate(Subscription);
module.exports = Subscription;
