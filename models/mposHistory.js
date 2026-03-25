const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');
const User = require('./user');

const MposHistory = sequelize.define(
    'mposHistory',
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
                model: User,
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
        amount: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0
        },
        orderid: {
            type: DataTypes.STRING,
            allowNull: true
        },
        transactionId: {
            type: DataTypes.STRING,
            allowNull: true
        },
        txid: {
            type: DataTypes.STRING,
            allowNull: true
        },
        status: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: 'PENDING'
        },
        message: {
            type: DataTypes.STRING,
            allowNull: true
        },
        superadminComm: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0
        },
        whitelabelComm: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0
        },
        masterDistributorCom: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0
        },
        distributorCom: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0
        },
        retailerCom: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0
        },
        superadminSurcharge: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0
        },
        whitelabelSurcharge: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0
        },
        masterDistributorSurcharge: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0
        },
        distributorSurcharge: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0
        },
        retailerSurcharge: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0
        },
        surchargeAmt: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0
        },
        apiResponse: {
            type: DataTypes.JSON,
            allowNull: true
        },
        addedBy: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        updatedBy: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        ...reusableModelAttribute
    },
    {
        freezeTableName: true,
        timestamps: true,
        indexes: [
            { fields: ['transactionId'] },
            { fields: ['refId', 'companyId'] },
            { fields: ['status'] },
            { fields: ['createdAt'] }
        ]
    }
);

MposHistory.belongsTo(User, { foreignKey: 'refId', as: 'user' });

sequelizeTransforms(MposHistory);
sequelizePaginate.paginate(MposHistory);

module.exports = MposHistory;
