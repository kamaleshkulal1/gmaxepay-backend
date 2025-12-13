const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableTransactionAttribute } = require('../utils/common');
const Operator = require('./operatorMaster');
const SubSlab = require('./subSlabs');
const CardType = require('./cardType');
const PaymentInsturment = require('./paymentInsturment');

let SubSlabPgCommercials = sequelize.define(
  'SubSlabPgCommercials',
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
    subSlabId: {
      allowNull: false,
      type: DataTypes.INTEGER,
      references: {
        model: SubSlab,
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    paymentInstrumentId: {
      allowNull: false,
      type: DataTypes.INTEGER,
      references: {
        model: PaymentInsturment,
        key: 'id'
      }
    },
    paymentInstrumentName: {
      type: DataTypes.STRING
    },
    cardTypeId: {
      allowNull: true,
      type: DataTypes.INTEGER,
      references: {
        model: CardType,
        key: 'id'
      }
    },
    cardTypeName: {
      type: DataTypes.STRING
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
      defaultValue: 'com',
      validate: {
        isIn: [['com', 'sur']]
      }
    },
    amtType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'fix',
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

// Relationships are defined in models/index.js

sequelizeTransforms(SubSlabPgCommercials);
sequelizePaginate.paginate(SubSlabPgCommercials);

module.exports = SubSlabPgCommercials;

