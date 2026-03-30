const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');

let ZupayBankList = sequelize.define(
  'zupayBankList',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    bankName: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    bankIin: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    bankLogo: {
      type: DataTypes.STRING,
      allowNull: true
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

ZupayBankList.prototype.toJSON = function () {
  let values = { ...this.get() };
  delete values.addedBy;
  delete values.updatedBy;
  return values;
};

sequelizeTransforms(ZupayBankList);
sequelizePaginate.paginate(ZupayBankList);
module.exports = ZupayBankList;
