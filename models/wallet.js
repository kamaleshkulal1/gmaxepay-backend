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
      }
    },
    roleType: {
      type: DataTypes.INTEGER
    },
    mainWallet: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      set(value) {
        this.setDataValue('prepaid', parseFloat(value.toFixed(2)));
      }
    },
    apesWallet: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      set(value) {
        this.setDataValue('mobikwik', parseFloat(value.toFixed(2)));
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
