const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableTransactionAttribute } = require('../utils/common');
const Operator = require('./operatorMaster');
const Slab = require('./slab');

let SlabComm = sequelize.define(
  'SlabComm',
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
      allowNull: true
    },
    slabId: {
      allowNull: false,
      type: DataTypes.INTEGER,
      references: {
        model: Slab,
        key: 'id'
      }
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
      type: DataTypes.INTEGER
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
    paymentMode: {
      allowNull: true,
      type: DataTypes.STRING
    },
    amtType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['fix', 'per']]
      }
    },
    ...reusableTransactionAttribute
  },
  {
    freezeTableName: true
  }
);

SlabComm.belongsTo(Operator, { foreignKey: 'operatorId', as: 'operator' });
Operator.hasMany(SlabComm, { foreignKey: 'operatorId', as: 'slabcomm' });

sequelizeTransforms(SlabComm);
sequelizePaginate.paginate(SlabComm);
module.exports = SlabComm;
