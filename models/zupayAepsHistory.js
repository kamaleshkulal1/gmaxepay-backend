const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');

const ZupayAepsHistory = sequelize.define(
    'zupayAepsHistory',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        refId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'user',
                key: 'id'
            },
        },
        companyId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'company',
                key: 'id'
            }
        },

        subMerchantCode: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        merchantCode: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        merchantReferenceId: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: true,
        },
        transactionId: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        bankReferenceNumber: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        bankRRN: {
            type: DataTypes.STRING,
            allowNull: true,
        },

        serviceCode: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        transactionType: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        transactionAmount: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0,
        },
        accountBalance: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        aadhaarLastFour: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        uidaiAuthCode: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        miniStatement: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        bankIin: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        bankName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        customerName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        mobileNumber: {
            type: DataTypes.STRING,
            allowNull: true,
        },

        transactionStatus: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        responseCode: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        responseMessage: {
            type: DataTypes.STRING,
            allowNull: true,
        },

        latitude: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
        longitude: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
        ipAddress: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        deviceType: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        deviceOs: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        deviceModel: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        peripheral: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        pidType: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        requestPayload: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        responsePayload: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        superAdminAvail: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        whitelabelAvail: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        masterDistributorAvail: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        distributorAvail: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        retailerAvail: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
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

        superadminCommTDS: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0
        },
        whitelabelCommTDS: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0
        },
        masterDistributorComTDS: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0
        },
        distributorComTDS: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0
        },
        retailerComTDS: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0
        },

        credit: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0,
        },
        openingWallet: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
        closingWallet: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },

        ...reusableModelAttribute
    },
    {
        freezeTableName: true,
        timestamps: true,
        indexes: [
            {
                fields: ['refId', 'companyId']
            },
            {
                fields: ['transactionId']
            },
            {
                unique: true, fields: ['merchantReferenceId']
            },
            {
                fields: ['serviceCode']
            },
            {
                fields: ['transactionStatus']
            },
            {
                fields: ['createdAt']
            }
        ]
    }
);

sequelizeTransforms(ZupayAepsHistory);
sequelizePaginate.paginate(ZupayAepsHistory);

module.exports = ZupayAepsHistory;
