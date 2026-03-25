const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');

const ZupayCity = sequelize.define(
    'zupayCity',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        cityId: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        stateId: {
            type: DataTypes.STRING,
            allowNull: false,
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
                fields: ['cityId']
            },
            {
                fields: ['stateId']
            },
            {
                fields: ['name']
            }
        ]
    }
);

sequelizeTransforms(ZupayCity);
sequelizePaginate.paginate(ZupayCity);

module.exports = ZupayCity;
