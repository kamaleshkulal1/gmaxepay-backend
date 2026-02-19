const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const User = require('./user');

let SurRecords = sequelize.define(
    'surRecords',
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
        refId: {
            allowNull: false,
            type: DataTypes.INTEGER,
            references: {
                model: User,
                key: 'id'
            }
        },
        service: {
            type: DataTypes.STRING,
            allowNull: true
        },
        operatorType: {
            type: DataTypes.STRING,
            allowNull: true
        },
        transactionId: {
            type: DataTypes.STRING,
            allowNull: true
        },
        amount: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 0
        },
        createdAt: {
            type: DataTypes.DATE
        },
        updatedAt: {
            type: DataTypes.DATE
        },
        addedBy: {
            type: DataTypes.INTEGER
        },
        updatedBy: {
            type: DataTypes.INTEGER
        }
    },
    {
        freezeTableName: true,
        timestamps: true
    }
);

// Define associations if needed, or rely on index.js
// SurRecords.belongsTo(User, { foreignKey: 'refId', as: 'user' });

sequelizeTransforms(SurRecords);
sequelizePaginate.paginate(SurRecords);

module.exports = SurRecords;
