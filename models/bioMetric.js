const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');
const { encrypt, decrypt } = require('../utils/encryption');

const SENSITIVE_FIELDS = {
  requestPayload: 'json',
  responsePayload: 'json',
  aadhaarNumber: 'string',
  authCode: 'string',
  transactionId: 'string',
  rrn: 'string'
};

const serializeValue = (value, type) => {
  if (value === undefined || value === null) {
    return value;
  }
  if (type === 'json') {
    return JSON.stringify(value);
  }
  return String(value);
};

const deserializeValue = (value, type) => {
  if (value === undefined || value === null) {
    return value;
  }
  try {
    switch (type) {
      case 'number': {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? value : parsed;
      }
      case 'json':
        return JSON.parse(value);
      default:
        return value;
    }
  } catch (error) {
    return value;
  }
};

const setRecordValue = (record, field, value) => {
  if (!record) return;
  if (typeof record.setDataValue === 'function') {
    record.setDataValue(field, value);
  } else {
    record[field] = value;
  }
};

const getRecordValue = (record, field) => {
  if (!record) return undefined;
  if (typeof record.get === 'function') {
    return record.get(field);
  }
  return record[field];
};

const encryptFields = (record, fieldMap) => {
  if (!record) return;
  Object.entries(fieldMap).forEach(([field, type]) => {
    const rawValue = getRecordValue(record, field);
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return;
    }
    try {
      const serialized = serializeValue(rawValue, type);
      if (serialized === undefined || serialized === null || serialized === '') {
        return;
      }
      setRecordValue(record, field, encrypt(serialized));
    } catch (error) {
      console.error(`Error encrypting field ${field}:`, error);
    }
  });
};

const decryptFields = (record, fieldMap) => {
  if (!record) return;
  Object.entries(fieldMap).forEach(([field, type]) => {
    const encryptedValue = getRecordValue(record, field);
    if (encryptedValue === undefined || encryptedValue === null || encryptedValue === '') {
      return;
    }
    try {
      const decrypted = decrypt(encryptedValue);
      setRecordValue(record, field, deserializeValue(decrypted, type));
    } catch (error) {
      setRecordValue(record, field, deserializeValue(encryptedValue, type));
    }
  });
};

const applyHookOnRecords = (records, handler) => {
  if (!records) return;
  if (Array.isArray(records)) {
    records.forEach((record) => handler(record));
    return;
  }
  if (records.rows && Array.isArray(records.rows)) {
    records.rows.forEach((record) => handler(record));
    return;
  }
  handler(records);
};

/**
 * bioMetric.js
 * @description :: sequelize model to store biometric verification attempts.
 */
const BioMetric = sequelize.define(
  'bioMetric',
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
    captureType: {
      type: DataTypes.STRING,
      allowNull: false
    },
    requestPayload: {
      type: DataTypes.JSON,
      allowNull: true
    },
    responsePayload: {
      type: DataTypes.JSON,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true
    },
    responseMessage: {
      type: DataTypes.STRING,
      allowNull: true
    },
    transactionId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    rrn: {
      type: DataTypes.STRING,
      allowNull: true
    },
    aadhaarNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    authCode: {
      type: DataTypes.STRING,
      allowNull: true
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    hooks: {
      beforeCreate: (instance) => encryptFields(instance, SENSITIVE_FIELDS),
      beforeUpdate: (instance) => encryptFields(instance, SENSITIVE_FIELDS),
      beforeBulkCreate: (records) => records && records.forEach((record) => encryptFields(record, SENSITIVE_FIELDS)),
      afterFind: (records) => applyHookOnRecords(records, (record) => decryptFields(record, SENSITIVE_FIELDS))
    }
  }
);

sequelizeTransforms(BioMetric);
sequelizePaginate.paginate(BioMetric);

module.exports = BioMetric;
