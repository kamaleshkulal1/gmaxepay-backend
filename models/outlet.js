/**
 * user.js
 * @description :: sequelize model of database table user
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableTransactionAttribute } = require('../utils/common');
const User = require('./user');
const PractomindCompanyCode = require('./practomindCompanyCode');
const { encrypt, decrypt } = require('../utils/encryption');

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
  
  // If it's a string, encrypt it
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
// For JSON fields: expects {key: "encrypted_string"} or JSON string
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
    
    // If it's a string, try to parse as JSON first (for JSON fields stored as string)
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

let Outlet = sequelize.define(
  'outlet',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    refId: {
      // allowNull: false,
      type: DataTypes.INTEGER,
      references: {
        model: User,
        key: 'id'
      }
    },
    outletGoogleMapsLink: {
      type: DataTypes.STRING,
      allowNull: true
    },
    companyId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'company',
        key: 'id'
      },   
      allowNull: false
    },
    shopName: { type: DataTypes.STRING, allowNull: false },
    shopAddress: { type: DataTypes.STRING, allowNull: false },
    gstNo: { type: DataTypes.STRING, allowNull: true },
    gstCertificate: {
      type: DataTypes.JSON,
      allowNull: true
    },
    shopImage: {
      type: DataTypes.JSON,
      allowNull: true
    },
    shopImageVerify: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    gstCertificateVerify: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    mobileNo: {
      type: DataTypes.STRING,
      allowNull: true
    },
    userRole: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    ifscCode: {
      type: DataTypes.STRING,
      allowNull: true
    },
    zipCode: {
      type: DataTypes.STRING,
      allowNull: true
    },
    accountNo: {
      type: DataTypes.BIGINT,
      allowNull: true,
      unique: true
    },
    bankName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    shopCategoryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: PractomindCompanyCode,
        key: 'id'
      }
    },
    branchName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    bankAddress: {
      type: DataTypes.STRING,
      allowNull: true
    },
    bankCity: {
      type: DataTypes.STRING,
      allowNull: true
    },
    passPhoto: {
      type: DataTypes.JSON,
      allowNull: true
    },
    holderName: {
      type: DataTypes.STRING
    },
    shopCity:{
      type: DataTypes.STRING,
      allowNull: true
    },
    shopDistrict:{
      type: DataTypes.STRING,
      allowNull: true
    },
    shopState:{
      type: DataTypes.STRING,
      allowNull: true
    },
    shopPincode:{
      type: DataTypes.STRING,
      allowNull: true
    },
    shopLatitude:{
      type: DataTypes.STRING,
      allowNull: true
    },
    shopLongitude:{
      type: DataTypes.STRING,
      allowNull: true
    },  
    shopCountry:{
      type: DataTypes.STRING,
      allowNull: true
    },
    ...reusableTransactionAttribute
  },
  {
    freezeTableName: true,
    hooks: {
      beforeCreate: [
        async function (outlet, options) {
          // Set default shopCategoryId if not provided
          if (!outlet.shopCategoryId) {
            outlet.shopCategoryId = 1;
          }
          // Encrypt shopImage if it exists
          if (outlet.shopImage) {
            outlet.shopImage = encryptImageField(outlet.shopImage);
          }
        }
      ],
      beforeBulkCreate: [
        async function (outlets, options) {
          if (outlets !== undefined && outlets.length) {
            for (let outlet of outlets) {
              // Set default shopCategoryId if not provided
              if (!outlet.shopCategoryId) {
                outlet.shopCategoryId = 1;
              }
              if (outlet.shopImage) {
                outlet.shopImage = encryptImageField(outlet.shopImage);
              }
            }
          }
        }
      ],
      beforeUpdate: [
        async function (outlet, options) {
          // Encrypt shopImage if it's being updated
          // Only encrypt if the value is a plain S3 key (starts with 'images/')
          if (outlet.changed('shopImage') && outlet.shopImage) {
            outlet.shopImage = encryptImageField(outlet.shopImage);
          }
        }
      ],
      afterFind: [
        async function (outlet) {
          if (Array.isArray(outlet)) {
            outlet.forEach((o) => {
              if (o.shopImage) {
                o.shopImage = decryptImageField(o.shopImage);
              }
            });
          } else {
            if (outlet?.shopImage) {
              outlet.shopImage = decryptImageField(outlet.shopImage);
            }
          }
        }
      ]
    }
  }
);

Outlet.belongsTo(User, { foreignKey: 'refId', as: 'user' });
User.hasMany(Outlet, { foreignKey: 'refId', as: 'outlet' });

sequelizeTransforms(Outlet);
sequelizePaginate.paginate(Outlet);
module.exports = Outlet;
