/**
 * authConstant.js
 * @description :: constants used in authentication
 */

const API_TYPE = {
  GENERAL: 'general',
  LAPU: 'lapu',
  MANUAL: 'manual'
};

const TRANSACTION_TYPE = {
  ALL: 'all',
  OTP: 'otp'
};
const METHOD_TYPE = {
  GET: 'get',
  POST: 'post'
};

const RESPONSE_TYPE = {
  JSON: 'json',
  XML: 'xml',
  CSV: 'csv',
  STRING: 'string',
  OTHER: 'other',
  DELIMITER: ' delimeiter'
};
const COMM_MODE = {
  SMS: 'sms',
  EMAIL: 'email',
  TELEGRAM: 'telegram',
  WHATSAPP: 'whatsapp'
};

const POST_TYPE = {
  FORM: 'x-www-form-urlencoded',
  FILE: 'multipart/form-data',
  APPLICATION: 'appliction-json',
  QUERY: 'query-string'
};

module.exports = {
  API_TYPE,
  TRANSACTION_TYPE,
  METHOD_TYPE,
  RESPONSE_TYPE,
  COMM_MODE,
  POST_TYPE
};
