const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');
const { encrypt, decrypt } = require('../utils/encryption');
const User = require('./user');

const SENSITIVE_FIELDS = {
  merchantLoginPin: 'string'
};

const serializeValue = (value) => {
  if (value === undefined || value === null) {
    return value;
  }
  return String(value);
};

const deserializeValue = (value) => {
  if (value === undefined || value === null) {
    return value;
  }
  try {
    return value;
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
      const serialized = serializeValue(rawValue);
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
      setRecordValue(record, field, deserializeValue(decrypted));
    } catch (error) {
      // keep original value for backward compatibility
      setRecordValue(record, field, deserializeValue(encryptedValue));
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

const KendraAepsOnboarding = sequelize.define(
  'kendraAepsOnboarding',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      references: {
        model: User,
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
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    },
    message: {
      type: DataTypes.STRING,
      allowNull: true
    },
    merchantLoginId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    merchantLoginPin: {
      type: DataTypes.STRING,
      allowNull: true
    },
    onboardingStatus: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isIn: [['PENDING', 'COMPLETED', 'FAILED']]
      },
      defaultValue: 'PENDING'
    },
    apiResponse: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Store full API response'
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

KendraAepsOnboarding.belongsTo(User, { foreignKey: 'userId', as: 'user' });

sequelizeTransforms(KendraAepsOnboarding);
sequelizePaginate.paginate(KendraAepsOnboarding);
module.exports = KendraAepsOnboarding;

