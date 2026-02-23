const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');

let GstHistory = sequelize.define(
    'gstHistory',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        refId: {
            allowNull: false,
            type: DataTypes.INTEGER,
            references: {
                model: 'user',
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
        transactionId: {
            type: DataTypes.STRING,
            allowNull: true
        },
        status: {
            type: DataTypes.STRING,
            allowNull: true
        },
        amount: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 0
        },
        openingAmt: {
            type: DataTypes.FLOAT,
            allowNull: true
        },
        closingAmt: {
            type: DataTypes.FLOAT,
            allowNull: true
        },
        aepsType: {
            type: DataTypes.STRING,
            allowNull: true
        },
        addedBy: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        updatedBy: {
            type: DataTypes.INTEGER,
            allowNull: true
        }
    },
    {
        freezeTableName: true,
        timestamps: true
    }
);

GstHistory.belongsTo(User, { foreignKey: 'refId', as: 'user' });

sequelizeTransforms(GstHistory);
sequelizePaginate.paginate(GstHistory);

module.exports = GstHistory;
