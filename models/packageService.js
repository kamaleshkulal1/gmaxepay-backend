/**
 * packages.js
 * @description :: sequelize model of database table packages
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');
const packages = require('./packages');
const service = require('./service');
let PackageService = sequelize.define(
  'packageService',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    packageId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: packages,
        key: 'id'
      }
    },
    serviceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: service,
        key: 'id'
      }
    },
    ...reusableSMSAttribute
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

PackageService.belongsTo(packages, { foreignKey: 'packageId', as: 'Package' });
PackageService.belongsTo(service, { foreignKey: 'serviceId', as: 'service' });
packages.hasMany(PackageService, {
  foreignKey: 'packageId',
  as: 'PackageServices'
});

PackageService.prototype.toJSON = function () {
  let values = Object.assign({}, this.get());
  delete values.addedBy;
  delete values.updatedBy;
  return values;
};

sequelizeTransforms(PackageService);
sequelizePaginate.paginate(PackageService);

module.exports = PackageService;
