const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');
const User = require('./user');

let Recharge = sequelize.define(
  'recharge',
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
    mobileNumber: {
      type: DataTypes.STRING,
      allowNull: false
    },
    opcode: {
      type: DataTypes.STRING,
      allowNull: false
    },
    circle: {
      type: DataTypes.STRING,
      allowNull: true
    },
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    orderid: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    txid: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'PENDING',
      validate: {
        isIn: [['Success', 'Failure', 'Pending']]
      }
    },
    opid: {
      type: DataTypes.STRING,
      allowNull: true
    },
    message: {
      type: DataTypes.STRING,
      allowNull: true
    },
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
    apiResponse: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Store full API response'
    },
    // --- Commission Breakdown (nullable) ---
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
    timestamps: true
  }
);

Recharge.belongsTo(User, { foreignKey: 'refId', as: 'user' });

Recharge.prototype.toJSON = function () {
  let values = Object.assign({}, this.get());
  return values;
};

sequelizeTransforms(Recharge);
sequelizePaginate.paginate(Recharge);

module.exports = Recharge;

