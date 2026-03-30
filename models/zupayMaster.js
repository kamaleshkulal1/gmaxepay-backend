const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');

const ZupayPincode = sequelize.define(
    'zupayMaster',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        pincodeId: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        stateId: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        cityId: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        pincode: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        ...reusableSMSAttribute
    },
    {
        freezeTableName: true,
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ['pincodeId']
            },
            {
                fields: ['pincode']
            },
            {
                fields: ['cityId']
            },
            {
                fields: ['stateId']
            }
        ]
    }
);

sequelizeTransforms(ZupayPincode);
sequelizePaginate.paginate(ZupayPincode);

module.exports = ZupayPincode;
