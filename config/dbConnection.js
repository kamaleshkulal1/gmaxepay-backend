/**
 * dbConnection.js
 * @description :: database connection using sequelize
 */
const { Sequelize, DataTypes } = require('sequelize');
// Enable CLS so queries inside sequelize.transaction(...) automatically use the active transaction
// without manually passing { transaction } to every call.
// Ref: Sequelize.useCLS(namespace)
const cls = require('cls-hooked');
const namespace = cls.createNamespace('gmaxepay-sequelize-transaction');
Sequelize.useCLS(namespace);
const dbConfig = require('./db');
const pg = require('pg');

// SECURITY: Removed customLogger function as it could leak sensitive query parameters
// If query logging is needed, use Sequelize's built-in logging with proper sanitization
// Example: logging: process.env.NODE_ENV === 'development' ? console.log : false

// SECURITY: Configure SSL based on environment
const isProduction = process.env.NODE_ENV === 'production';
// Check if SSL should be used - default to true if explicitly set, false otherwise (except production)
const useSSL = process.env.DB_USE_SSL === 'true' || (process.env.DB_USE_SSL !== 'false' && isProduction);
// Allow self-signed certificates in development (set DB_REJECT_UNAUTHORIZED=true to enforce strict SSL in dev)
// Default to false in development to allow self-signed certs, true only in production or if explicitly set
const rejectUnauthorized = isProduction
  ? (process.env.DB_REJECT_UNAUTHORIZED !== 'false')
  : (process.env.DB_REJECT_UNAUTHORIZED === 'true');

// Build SSL configuration
// If useSSL is false, we still configure SSL with require: false to handle cases where server requires SSL
// This allows the connection to work whether the server requires SSL or not
const sslConfig = useSSL ? {
  require: true,
  rejectUnauthorized: rejectUnauthorized,
} : {
  require: false,
  rejectUnauthorized: false, // Allow self-signed when SSL is not required but server provides it
};

console.log(`[DB Config] SSL Enabled: ${useSSL}, Reject Unauthorized: ${rejectUnauthorized}, Production: ${isProduction}`);

const sequelize = new Sequelize(dbConfig.DB, dbConfig.USER, dbConfig.PASSWORD, {
  host: dbConfig.HOST,
  dialect: dbConfig.dialect,
  port: dbConfig.port,
  logging: false,
  logQueryParameters: false, // SECURITY: Don't log query parameters (may contain sensitive data)
  dialectOptions: {
    ssl: sslConfig,
    dialectModule: pg,
    // SECURITY: Add connection timeout
    connectTimeout: 30000
  },
  // SECURITY: Connection pool settings to prevent DoS
  pool: {
    max: 10,
    min: 2,
    acquire: 30000,
    idle: 10000
  }
});
module.exports = sequelize;
