const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableTransactionAttribute } = require('../utils/common');
const Operator = require('./operatorMaster');
const Slab = require('./slab');
const Range = require('./range');

let RangeCharges = sequelize.define(
  'rangeCharges',
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
    },
    slabId: {
      allowNull: false,
      type: DataTypes.INTEGER,
      references: {
        model: Slab,
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    rangeId: {
      allowNull: false,
      type: DataTypes.INTEGER,
      references: {
        model: Range,
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    min: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    max: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    operatorId: {
      allowNull: false,
      type: DataTypes.INTEGER,
      references: {
        model: Operator,
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
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

// Define Associations
RangeCharges.belongsTo(Operator, {
  foreignKey: 'operatorId',
  as: 'operator'
});
RangeCharges.belongsTo(Range, {
  foreignKey: 'rangeId',
  as: 'range'
});
Operator.hasMany(RangeCharges, {
  foreignKey: 'operatorId',
  as: 'rangeCharges'
});

// Apply Transforms and Pagination
sequelizeTransforms(RangeCharges);
sequelizePaginate.paginate(RangeCharges);

module.exports = RangeCharges;
