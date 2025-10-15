const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');

let KycDocumentSetting = sequelize.define(
  'KycDocumentSetting',
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
    docName: {
      allowNull: false,
      type: DataTypes.STRING,
      unique: true
    },
    isOptional: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    remark: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    updatedBy: { type: DataTypes.INTEGER }
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

sequelizeTransforms(KycDocumentSetting);
sequelizePaginate.paginate(KycDocumentSetting);
module.exports = KycDocumentSetting;
