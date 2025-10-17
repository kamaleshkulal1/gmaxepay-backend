const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const User = require('./user');

let EServiceReport = sequelize.define(
  'eServiceReport',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      allowNull: false,
      type: DataTypes.INTEGER,
      references: {
        model: User,
        key: 'id'
      }
    },
    service: {
      type: DataTypes.STRING
    },
    idNo: {
      allowNull: false,
      type: DataTypes.STRING
    },
    amount: {
      allowNull: false,
      type: DataTypes.FLOAT
    },
    createdAt: {
      type: DataTypes.DATE
    }
  },
  {
    freezeTableName: true
  }
);

EServiceReport.belongsTo(User, { foreignKey: 'userId', as: 'user' });

sequelizeTransforms(EServiceReport);
sequelizePaginate.paginate(EServiceReport);
module.exports = EServiceReport;
