/**
 * serviceCharge.js
 * @description :: sequelize model of database table serviceCharge
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');
const Service = require('./service');

let ServiceCharge = sequelize.define(
  'serviceCharge',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    serviceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Service,
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
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'user',
        key: 'id'
      }
    },
    roleType: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '1=SUPER_ADMIN, 2=ADMIN, 4=RETAILER, 5=MASTER_DISTRIBUTOR, 6=DISTRIBUTOR, 13=WHITELABEL_ADMIN'
    },
    chargeAmount: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    ...reusableSMSAttribute
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

ServiceCharge.belongsTo(Service, { foreignKey: 'serviceId', as: 'service' });

ServiceCharge.prototype.toJSON = function () {
  let values = Object.assign({}, this.get());
  delete values.addedBy;
  delete values.updatedBy;
  return values;
};

sequelizeTransforms(ServiceCharge);
sequelizePaginate.paginate(ServiceCharge);
module.exports = ServiceCharge;
