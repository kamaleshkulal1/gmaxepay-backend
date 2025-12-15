/**
 * service.js
 * @description :: sequelize model of database table service
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');
const { encrypt, decrypt } = require('../utils/encryption');
const imageService = require('../services/imageService');
const models = require('./index');

// Helper function to encrypt image field (handles JSON and STRING)
const encryptImageField = (imageData) => {
  if (!imageData) return null;
  
  // If it's a JSON object, extract key and encrypt it
  if (typeof imageData === 'object') {
    const key = imageData.key || imageData;
    if (typeof key === 'string' && key.startsWith('images/')) {
      return { key: encrypt(key) };
    }
    return imageData;
  }
  
  // If it's a string
  if (typeof imageData === 'string') {
    // Check if it's already JSON string
    try {
      const parsed = JSON.parse(imageData);
      if (parsed.key && typeof parsed.key === 'string' && parsed.key.startsWith('images/')) {
        return JSON.stringify({ key: encrypt(parsed.key) });
      }
      return imageData;
    } catch {
      // Not JSON, encrypt the string directly if it's an S3 key
      if (imageData.startsWith('images/')) {
        return encrypt(imageData);
      }
      return imageData;
    }
  }
  
  return imageData;
};

// Helper function to decrypt image field (handles JSON and STRING)
const decryptImageField = (imageData) => {
  if (!imageData) return null;
  
  try {
    // If it's a JSON object, decrypt the key
    if (typeof imageData === 'object') {
      const key = imageData.key;
      if (key && typeof key === 'string') {
        // Check if it's encrypted (doesn't start with 'images/')
        if (!key.startsWith('images/')) {
          try {
            // It's encrypted, decrypt it
            const decrypted = decrypt(key);
            return { key: decrypted };
          } catch (e) {
            // Decryption failed, return as is (might be invalid)
            return imageData;
          }
        }
        // Already decrypted (starts with 'images/')
        return imageData;
      }
      return imageData;
    }
    
    // If it's a string, try to parse as JSON first
    if (typeof imageData === 'string') {
      try {
        const parsed = JSON.parse(imageData);
        if (parsed.key && typeof parsed.key === 'string') {
          // Check if it's encrypted
          if (!parsed.key.startsWith('images/')) {
            try {
              // It's encrypted, decrypt it
              const decrypted = decrypt(parsed.key);
              return JSON.stringify({ key: decrypted });
            } catch (e) {
              return imageData;
            }
          }
          // Already decrypted
          return imageData;
        }
        return imageData;
      } catch {
        // Not JSON string
        // Check if it's an encrypted string that needs decryption
        if (!imageData.startsWith('images/')) {
          try {
            // Try to decrypt (for backward compatibility)
            const decrypted = decrypt(imageData);
            return decrypted;
          } catch (e) {
            // Decryption failed, return as is
            return imageData;
          }
        }
        // Already decrypted or invalid
        return imageData;
      }
    }
    
    return imageData;
  } catch (error) {
    // If decryption fails, return as is (backward compatibility)
    return imageData;
  }
};

let Services = sequelize.define(
  'services',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    serviceName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    image: {
      type: DataTypes.JSON,
      allowNull: true
    },
    ...reusableSMSAttribute
  },
  {
    freezeTableName: true,
    timestamps: true,
    hooks: {
      beforeCreate: async function (service, options) {
        // Encrypt image field if provided
        if (service.image) {
          service.image = encryptImageField(service.image);
        }
      },
      beforeUpdate: async function (service, options) {
        // Encrypt image field if provided
        if (service.image) {
          service.image = encryptImageField(service.image);
        }
      },
      afterFind: async function (services, options) {
        // Decrypt image fields after finding
        if (!services) return;
        
        const servicesArray = Array.isArray(services) ? services : [services];
        servicesArray.forEach((service) => {
          if (service && service.image) {
            service.image = decryptImageField(service.image);
          }
        });
      }
    }
  }
);

Services.prototype.toJSON = function () {
  let values = { ...this.get() };
  delete values.addedBy;
  delete values.updatedBy;
  
  // Convert image to URL if it exists
  if (values.image) {
    const imageKey = typeof values.image === 'object' ? values.image.key : values.image;
    if (imageKey && imageKey.startsWith('images/')) {
      values.imageUrl = imageService.getImageUrl(imageKey, false); // Use CDN URL for service images
    }
  }
  
  return values;
};

sequelizeTransforms(Services);
sequelizePaginate.paginate(Services);

module.exports = Services;
