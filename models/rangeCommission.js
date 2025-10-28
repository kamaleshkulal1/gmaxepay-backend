const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableTransactionAttribute } = require('../utils/common');
const Operator = require('./operatorMaster');
const Slab = require('./slab');
const Range = require('./range');

let RangeCommission = sequelize.define(
  'rangeCommission',
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
    slabId: {
      allowNull: false,
      type: DataTypes.INTEGER,
      references: {
        model: Slab,
        key: 'id'
      }
    },
    rangeId: {
      allowNull: false,
      type: DataTypes.INTEGER,
      references: {
        model: Range,
        key: 'id'
      }
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

RangeCommission.belongsTo(Operator, {
  foreignKey: 'operatorId',
  as: 'operator'
});
RangeCommission.belongsTo(Range, { foreignKey: 'rangeId', as: 'range' });
Operator.hasMany(RangeCommission, {
  foreignKey: 'operatorId',
  as: 'rangeCommission'
});

sequelizeTransforms(RangeCommission);
sequelizePaginate.paginate(RangeCommission);
module.exports = RangeCommission;
