/**
 * dbConnection.js
 * @description :: database connection using sequelize
 */
const { Sequelize, DataTypes } = require('sequelize');
const dbConfig = require('./db');
const pg = require('pg');

function customLogger(queryString, queryObject) {
  console.log('string', queryString); // outputs a string
  console.log('parameters', queryObject); // outputs an array
}

const sequelize = new Sequelize(dbConfig.DB, dbConfig.USER, dbConfig.PASSWORD, {
  host: dbConfig.HOST,
  dialect: dbConfig.dialect,
  port: dbConfig.port,
  logging: false,
  logQueryParameters: true,
  dialectOptions: {
    ssl: {
      require: false,
      rejectUnauthorized: false
    },
    dialectModule: pg
  }
});
module.exports = sequelize;
