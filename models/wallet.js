const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');
const User = require('./user');

let Wallet = sequelize.define(
  'wallet',
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
      },
      unique: true
    },
    companyId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'company',
        key: 'id'
      },
      allowNull: false
    },
    roleType: {
      type: DataTypes.INTEGER
    },
    mainWallet: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      set(value) {
        this.setDataValue('mainWallet', parseFloat(value.toFixed(4)));
      }
    },
    apes1Wallet: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      set(value) {
        this.setDataValue('apes1Wallet', parseFloat(value.toFixed(4)));
      }
    },
    apes2Wallet: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      set(value) {
        this.setDataValue('apes2Wallet', parseFloat(value.toFixed(4)));
      }
    },
    ...reusableSMSAttribute
  },
  {
    freezeTableName: true
  }
);

Wallet.belongsTo(User, { foreignKey: 'refId', as: 'user' });

sequelizeTransforms(Wallet);
sequelizePaginate.paginate(Wallet);
module.exports = Wallet;
