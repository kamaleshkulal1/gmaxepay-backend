const { Sequelize, DataTypes } = require('sequelize');
const cls = require('cls-hooked');
const namespace = cls.createNamespace('gmaxepay-sequelize-transaction');
Sequelize.useCLS(namespace);
const dbConfig = require('./db');
const pg = require('pg');

const isProduction = process.env.NODE_ENV === 'production';
const useSSL = process.env.DB_USE_SSL === 'true' || (process.env.DB_USE_SSL !== 'false' && isProduction);
const rejectUnauthorized = isProduction
  ? (process.env.DB_REJECT_UNAUTHORIZED !== 'false')
  : (process.env.DB_REJECT_UNAUTHORIZED === 'true');

const sslConfig = useSSL ? {
  require: true,
  rejectUnauthorized: rejectUnauthorized,
} : {
  require: false,
  rejectUnauthorized: false,
};

console.log(`[DB Config] SSL Enabled: ${useSSL}, Reject Unauthorized: ${rejectUnauthorized}, Production: ${isProduction}`);

const sequelize = new Sequelize(dbConfig.DB, dbConfig.USER, dbConfig.PASSWORD, {
  host: dbConfig.HOST,
  dialect: dbConfig.dialect,
  port: dbConfig.port,
  logging: false,
  logQueryParameters: false,
  dialectOptions: {
    ssl: sslConfig,
    dialectModule: pg,
    connectTimeout: 30000
  },
  pool: {
    max: 10,
    min: 2,
    acquire: 30000,
    idle: 10000
  }
});
module.exports = sequelize;
