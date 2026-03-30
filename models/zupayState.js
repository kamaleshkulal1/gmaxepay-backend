const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');

const ZupayState = sequelize.define(
    'zupayState',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        stateId: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        code: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        name: {
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
                fields: ['stateId']
            },
            {
                fields: ['name']
            }
        ]
    }
);

sequelizeTransforms(ZupayState);
sequelizePaginate.paginate(ZupayState);

module.exports = ZupayState;
