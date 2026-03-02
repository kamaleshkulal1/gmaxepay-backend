const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const { reusableModelAttribute } = require('../utils/common');
const { encrypt, decrypt } = require('../utils/encryption');

let OnboardingToken = sequelize.define(
  'onboardingToken',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
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
    token: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    isDeactivated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    isUsed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    timestamps: true,
    hooks: {
      beforeCreate: [
        async function (onboardingToken, options) {
          // Encrypt token before saving
          if (onboardingToken.token) {
            onboardingToken.token = encrypt(onboardingToken.token);
          }
        }
      ],
      beforeBulkCreate: [
        async function (onboardingTokens, options) {
          if (onboardingTokens !== undefined && onboardingTokens.length) {
            for (let token of onboardingTokens) {
              if (token.token) {
                token.token = encrypt(token.token);
              }
            }
          }
        }
      ],
      beforeUpdate: [
        async function (onboardingToken, options) {
          // Encrypt token if it's being updated
          if (onboardingToken.changed('token') && onboardingToken.token) {
            // Only encrypt if it's not already encrypted (doesn't look like encrypted hex)
            // Encrypted tokens are hex strings, plain tokens are usually base64 or other formats
            // We'll encrypt anyway since we can't reliably detect if it's already encrypted
            onboardingToken.token = encrypt(onboardingToken.token);
          }
        }
      ],
      afterFind: [
        async function (onboardingToken) {
          // Decrypt token after retrieving
          if (Array.isArray(onboardingToken)) {
            onboardingToken.forEach((token) => {
              if (token && token.token) {
                try {
                  token.token = decrypt(token.token);
                } catch (e) {
                  // If decryption fails, it might be already decrypted or invalid
                  // Keep the original value for backward compatibility
                  console.error('Error decrypting onboarding token:', e);
                }
              }
            });
          } else {
            if (onboardingToken && onboardingToken.token) {
              try {
                onboardingToken.token = decrypt(onboardingToken.token);
              } catch (e) {
                // If decryption fails, it might be already decrypted or invalid
                // Keep the original value for backward compatibility
                console.error('Error decrypting onboarding token:', e);
              }
            }
          }
        }
      ]
    },
    indexes: [
      {
        unique: true,
        fields: ['token']
      },
      {
        fields: ['userId', 'isUsed']
      },
      {
        fields: ['expiresAt']
      }
    ]
  }
);

module.exports = OnboardingToken;

