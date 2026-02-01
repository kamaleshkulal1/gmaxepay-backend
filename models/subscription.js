
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');

let Subscription = sequelize.define(
  'Subscription',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    slabId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'slab',
        key: 'id'
      }
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'user',
        key: 'id'
      }
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'company',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'SUCCESS',
      validate: {
        isIn: [['SUCCESS', 'FAILED', 'PENDING', 'CANCELLED']]
      }
    },
    ...reusableSMSAttribute
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

Subscription.prototype.toJSON = function () {
  let values = { ...this.get() };
  delete values.addedBy;
  delete values.updatedBy;
  return values;
};

sequelizeTransforms(Subscription);
sequelizePaginate.paginate(Subscription);
module.exports = Subscription;
