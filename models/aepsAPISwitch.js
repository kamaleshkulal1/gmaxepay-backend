const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');

let AepsAPISwitch = sequelize.define('AepsAPISwitch', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    aepsType: {
        type: DataTypes.STRING,
        allowNull: true
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    addedBy: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    updatedBy: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    freezeTableName: true,
    timestamps: true
});

sequelizeTransforms(AepsAPISwitch);
sequelizePaginate.paginate(AepsAPISwitch);
module.exports = AepsAPISwitch;
