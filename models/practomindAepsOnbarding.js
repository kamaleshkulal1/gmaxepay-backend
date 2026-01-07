/**
 * practomindAepsOnbarding.js
 * @description :: sequelize model for Practomind AEPS onboarding records
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');
const { encrypt, decrypt } = require('../utils/encryption');

const SENSITIVE_FIELDS = {
  merchantLoginId: 'string',
  merchantLoginPin: 'string',
  KeyID: 'string',
  TxnId: 'string',
  primaryKeyId: 'string',
  encodeFPTxnId: 'string',
  errorMessage: 'string',
  merchantPhoneNumber: 'string',
  aadhaarNumber: 'string',
  userPan: 'string'
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
      // keep original value for backward compatibility
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

const PractomindAepsOnboarding = sequelize.define(
  'practomindAepsOnboarding',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'user',
        key: 'id'
      },
      allowNull: false
    },
    companyId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'company',
        key: 'id'
      },
      allowNull: false
    },
    merchantLoginId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Unique merchant login ID from Practomind'
    },
    merchantLoginPin: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Merchant login PIN from Practomind'
    },
    merchantPhoneNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    aadhaarNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    userPan: {
      type: DataTypes.STRING,
      allowNull: true
    },
    onboardingStatus: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'PENDING',
      comment: 'PENDING, COMPLETED, FAILED'
    },
    isOtpSent: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    },
    isOtpValidated: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    },
    isBioMetricValidated: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    },
    KeyID: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'KeyID from send OTP response'
    },
    TxnId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Transaction ID from send OTP response'
    },
    primaryKeyId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Primary key ID from validate OTP response'
    },
    encodeFPTxnId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Encoded fingerprint transaction ID'
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'API response status'
    },
    message: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'API response message'
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Error message if any'
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    indexes: [
      {
        unique: false,
        fields: ['userId', 'companyId']
      },
      {
        unique: false,
        fields: ['merchantLoginId']
      },
      {
        unique: false,
        fields: ['onboardingStatus']
      }
    ],
    hooks: {
      beforeCreate: (instance) => encryptFields(instance, SENSITIVE_FIELDS),
      beforeUpdate: (instance) => encryptFields(instance, SENSITIVE_FIELDS),
      beforeBulkCreate: (records) => records && records.forEach((record) => encryptFields(record, SENSITIVE_FIELDS)),
      afterFind: (records) => applyHookOnRecords(records, (record) => decryptFields(record, SENSITIVE_FIELDS))
    }
  }
);

sequelizeTransforms(PractomindAepsOnboarding);
sequelizePaginate.paginate(PractomindAepsOnboarding);

module.exports = PractomindAepsOnboarding;

