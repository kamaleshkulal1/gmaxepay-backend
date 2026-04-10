const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');

const ZupayOnboarding = sequelize.define(
    'zupayOnboarding',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'user',
                key: 'id'
            }
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
            unique: true,
        },
        contactId: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        merchantCode: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        referenceId: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        pipe: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: 'pipe1',
        },
        isInitiated: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: false,
        },
        isOtpVerified: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: false,
        },
        isEkycCompleted: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: false,
        },
        onboardingStatus: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: 'PENDING',
        },
        initiateStatus: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        otpStatus: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        ekycStatus: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        ekycRemarks: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        onboardRemarks: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        errorMessage: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        mobileNo: {
            type: DataTypes.STRING,
            allowNull: true
        },
        email: {
            type: DataTypes.STRING,
            allowNull: true
        },
        pan: {
            type: DataTypes.STRING,
            allowNull: true
        },
        aadhaarNo: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        is2faVerified: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: false,
        },
        last2faDate: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        twoFaStatus: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        ...reusableModelAttribute
    },
    {
        freezeTableName: true,
        timestamps: true,
        indexes: [
            {
                fields: ['userId', 'companyId']
            },
            {
                unique: true, fields: ['subMerchantCode']
            },
            {
                fields: ['contactId']
            },
            {
                fields: ['onboardingStatus']
            }
        ]
    }
);

sequelizeTransforms(ZupayOnboarding);
sequelizePaginate.paginate(ZupayOnboarding);

module.exports = ZupayOnboarding;
