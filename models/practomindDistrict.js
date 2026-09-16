const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');

let PractomindDistrict = sequelize.define(
  'practomindDistrict',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    districtId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    district: {
      type: DataTypes.STRING,
      allowNull: false
    },
    districtCode: {
      type: DataTypes.STRING,
      allowNull: false
    },
    stateCode: {
      type: DataTypes.STRING,
      allowNull: false
    },
    stateId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    timestamps: true,
    indexes: [
      {
        fields: ['stateCode']
      },
      {
        fields: ['districtCode']
      },
      {
        fields: ['district']
      },
      {
        fields: ['stateCode', 'districtCode']
      }
    ]
  }
);

PractomindDistrict.prototype.toJSON = function () {
  let values = { ...this.get() };
  delete values.addedBy;
  delete values.updatedBy;
  if (!values.code && values.districtCode) {
    values.code = values.districtCode;
  }
  if (!values.description && values.district) {
    values.description = values.district;
  }
  return values;
};

sequelizeTransforms(PractomindDistrict);
sequelizePaginate.paginate(PractomindDistrict);
module.exports = PractomindDistrict;
