/**
 * aepsOnboarding.js
 * @description :: sequelize model of database table aepsOnboarding
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');
const { encrypt, decrypt } = require('../utils/encryption');

const SENSITIVE_FIELDS = {
  uniqueID: 'number',
  otpReferenceId: 'number',
  hash: 'string',
  message: 'string',
  remarks: 'string',
  superMerchantId: 'number',
  merchantLoginId: 'string',
  errorCodes: 'string',
  otp: 'string',
  bankKycOtpReferenceId: 'string'
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

const AepsOnboarding = sequelize.define(
  'aepsOnboarding',
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
    status: {
      type: DataTypes.STRING,
      allowNull: true
    },
    uniqueID: {
      type: DataTypes.STRING,
      allowNull: true
    },
    otpReferenceId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    hash: {
      type: DataTypes.STRING,
      allowNull: true
    },
    message: {
      type: DataTypes.STRING,
      allowNull: true
    },
    merchantStatus: {
      type: DataTypes.BOOLEAN,
      allowNull: true
    },
    remarks: {
      type: DataTypes.STRING,
      allowNull: true
    },
    superMerchantId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    merchantLoginId: {
      type: DataTypes.STRING,
      allowNull: true
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
    isBankKycOtpValidated: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    },
    isBankKycBiometricValidated: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    },
    is2FACompleted: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    },
    onboardingStatus: {
      type: DataTypes.STRING,
      allowNull: true,
      attributes: ['PENDING', 'COMPLETED', 'FAILED'],
      defaultValue: 'PENDING'
    },
    errorCodes: {
      type: DataTypes.STRING,
      allowNull: true
    },
    otp: {
      type: DataTypes.STRING,
      allowNull: true
    },
    bankKycOtpReferenceId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    indexes: [
      {
        unique: false,
        fields: ['userId', 'companyId']
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

sequelizeTransforms(AepsOnboarding);
sequelizePaginate.paginate(AepsOnboarding);
module.exports = AepsOnboarding;

