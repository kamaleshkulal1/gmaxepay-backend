const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableTransactionAttribute } = require('../utils/common');
const Operator = require('./operatorMaster');
const Slab = require('./slab');

let DistributorSlabCom = sequelize.define(
  'distributorSlabCom',
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

DistributorSlabCom.belongsTo(Operator, {
  foreignKey: 'operatorId',
  as: 'operator'
});
Operator.hasMany(DistributorSlabCom, {
  foreignKey: 'operatorId',
  as: 'distributorSlabCom'
});

sequelizeTransforms(DistributorSlabCom);
sequelizePaginate.paginate(DistributorSlabCom);
module.exports = DistributorSlabCom;
