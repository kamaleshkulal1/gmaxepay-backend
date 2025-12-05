const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableTransactionAttribute } = require('../utils/common');
const Operator = require('./operatorMaster');

let AdminCommission = sequelize.define(
  'adminCommission',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    schemaId: {
      allowNull: true,
      type: DataTypes.INTEGER,
      references: {
        model: 'schema',
        key: 'id'
      },
      comment: 'Optional schema reference for this admin commission'
    },
    slabId: {
      allowNull: false,
      type: DataTypes.INTEGER,
      references: {
        model: 'Slab',
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
        // Allow different commissions per schema for same slab+company+operator
        fields: ['schemaId', 'slabId', 'companyId', 'operatorId', 'commType'],
        name: 'unique_admin_commission'
      }
    ]
  }
);

// Relationships will be defined in models/index.js

sequelizeTransforms(AdminCommission);
sequelizePaginate.paginate(AdminCommission);
module.exports = AdminCommission;

