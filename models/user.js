
const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { Op } = require('sequelize');
const {
  reusableModelAttribute,
  convertObjectToEnum
} = require('../utils/common');
const authConstantEnum = require('../constants/authConstant');
const bcrypt = require('bcrypt');
const moment = require('moment');
const { encrypt, decrypt } = require('../utils/encryption');
const Package = require('./packages');
const Company = require('./company');

const toEncryptableString = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
};

const encryptJsonFieldValue = (value) => {
  const serialized = toEncryptableString(value);
  if (serialized === null) {
    return null;
  }
  return encrypt(serialized);
};

const decryptJsonFieldValue = (value) => {
  if (!value) {
    return value;
  }
  try {
    const decrypted = decrypt(value);
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  } catch (error) {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }
};

const normalizeAadhaarDetails = (details) => {
  if (!details) {
    return details;
  }

  if (typeof details === 'object' && !Array.isArray(details)) {
    return {
      aadhaarLast4: details.aadhaarLast4 || details.aadhaarLst || details.last4 || null,
      aadhaarNumber: details.aadhaarNumber || details.aadhaarNo || null
    };
  }

  if (typeof details === 'string') {
    const trimmed = details.trim();
    if (!trimmed) {
      return null;
    }

    if (/^\d{12}$/.test(trimmed)) {
      return {
        aadhaarLast4: trimmed.slice(-4),
        aadhaarNumber: trimmed
      };
    }

    const [maybeLast4] = trimmed.split(',');
    const last4Candidate = maybeLast4?.trim();
    if (last4Candidate && /^\d{4}$/.test(last4Candidate)) {
      return {
        aadhaarLast4: last4Candidate,
        aadhaarNumber: null
      };
    }
  }

  return details;
};

const applyDocumentDecryption = (record) => {
  if (!record) {
    return;
  }
  if (record.aadharDetails) {
    const decryptedAadhaar = decryptJsonFieldValue(record.aadharDetails);
    record.aadharDetails = normalizeAadhaarDetails(decryptedAadhaar);
  }
  if (record.panDetails) {
    record.panDetails = decryptJsonFieldValue(record.panDetails);
  }
};


const encryptImageField = (imageData) => {
  if (!imageData) return null;

  if (typeof imageData === 'object') {
    const key = imageData.key || imageData;
    if (typeof key === 'string' && key.startsWith('images/')) {
      return { key: encrypt(key) };
    }
    return imageData;
  }

  if (typeof imageData === 'string') {
    try {
      const parsed = JSON.parse(imageData);
      if (parsed.key && typeof parsed.key === 'string') {
        if (parsed.key.startsWith('images/')) {
          return JSON.stringify({ key: encrypt(parsed.key) });
        }
        return imageData;
      }
      return imageData;
    } catch {
      if (imageData.startsWith('images/')) {
        return { key: encrypt(imageData) };
      }
      return imageData;
    }
  }

  return imageData;
};


const decryptImageField = (imageData) => {
  if (!imageData) return null;

  try {
    if (typeof imageData === 'object') {
      const key = imageData.key;
      if (key && typeof key === 'string') {
        if (!key.startsWith('images/')) {
          try {
            const decrypted = decrypt(key);
            return { key: decrypted };
          } catch (e) {
            return imageData;
          }
        }
        return imageData;
      }
      return imageData;
    }

    if (typeof imageData === 'string') {
      try {
        const parsed = JSON.parse(imageData);
        if (parsed.key && typeof parsed.key === 'string') {
          if (!parsed.key.startsWith('images/')) {
            try {
              const decrypted = decrypt(parsed.key);
              return JSON.stringify({ key: decrypted });
            } catch (e) {
              return imageData;
            }
          }
          return imageData;
        }
        return imageData;
      } catch {
        if (!imageData.startsWith('images/')) {
          try {
            const decrypted = decrypt(imageData);
            return decrypted;
          } catch (e) {
            return imageData;
          }
        }
        return imageData;
      }
    }

    return imageData;
  } catch (error) {
    return imageData;
  }
};

const User = sequelize.define(
  'user',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(500)
    },
    fullAddress: {
      type: DataTypes.TEXT
    },
    city: {
      type: DataTypes.STRING
    },
    district: {
      type: DataTypes.STRING,
      allowNull: true
    },
    state: {
      type: DataTypes.STRING
    },
    zipcode: {
      type: DataTypes.STRING
    },
    country: {
      type: DataTypes.STRING
    },
    email: {
      type: DataTypes.STRING
    },
    mobileNo: {
      type: DataTypes.STRING,
      allowNull: false
    },
    whatsappNo: {
      type: DataTypes.STRING,
      allowNull: true
    },
    alternateNo: {
      type: DataTypes.STRING,
      allowNull: true
    },
    slab: {
      type: DataTypes.STRING
    },
    outletName: {
      type: DataTypes.STRING
    },
    password: {
      type: DataTypes.STRING
    },
    userRole: {
      type: DataTypes.INTEGER,
      required: true,
      allowNull: false,
      values: convertObjectToEnum(authConstantEnum.PLATFORM)
    },
    latitude: {
      type: DataTypes.STRING,
      allowNull: true
    },
    longitude: {
      type: DataTypes.STRING,
      allowNull: true
    },
    kycStatus: {
      type: DataTypes.STRING,
      attribute: ['NO_KYC', 'HALF_KYC', 'FULL_KYC', 'REJECTED'],
      defaultValue: 'NO_KYC'
    },
    kycSteps: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    otpEmail: {
      type: DataTypes.STRING,
      allowNull: true
    },
    otpMobile: {
      type: DataTypes.STRING,
      allowNull: true
    },
    lastOtpLoginDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Date when OTP was last used for login (resets at midnight IST)'
    },
    isOtpEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    isMpinSetup: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    isMpinEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    key2Fa: {
      type: DataTypes.STRING,
      allowNull: true
    },
    is2FAenabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    is2faEnabledActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    isResetPassword: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    profileImage: {
      type: DataTypes.STRING,
      allowNull: true
    },
    mobileVerify: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    aadharVerify: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    shopDetailsVerify: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    panVerify: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    imageVerify: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    emailVerify: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    profileImageWithShopVerify: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    bankDetailsVerify: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    aadharDetails: {
      type: DataTypes.JSON,
      allowNull: true
    },
    nameSimilarity: {
      type: DataTypes.STRING,
      allowNull: true
    },
    panDetails: {
      type: DataTypes.JSON,
      allowNull: true
    },
    aadharFrontImage: {
      type: DataTypes.JSON,
      allowNull: true
    },
    firstTimeOnboarding: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    firstTimeOnboardingComplete: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    aadharBackImage: {
      type: DataTypes.JSON,
      allowNull: true
    },
    panCardFrontImage: {
      type: DataTypes.JSON,
      allowNull: true
    },
    panCardBackImage: {
      type: DataTypes.JSON,
      allowNull: true
    },
    userType: {
      type: DataTypes.INTEGER,
      values: convertObjectToEnum(authConstantEnum.TYPES)
    },
    deleteReason: {
      type: DataTypes.STRING
    },
    isLoginOtp: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    joinedName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    joinedMobile: {
      type: DataTypes.STRING
    },
    ReferralBy: {
      type: DataTypes.STRING
    },
    reportingTo: {
      type: DataTypes.INTEGER
    },
    secureKey: {
      type: DataTypes.STRING
    },
    dob: {
      type: DataTypes.STRING
    },
    qualifictaion: {
      type: DataTypes.STRING
    },
    locationType: {
      type: DataTypes.STRING
    },
    landmark: {
      type: DataTypes.STRING
    },
    userId: {
      type: DataTypes.STRING,
      unique: true
    },
    signupStep: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      allowNull: false
    },
    panInfo: {
      type: DataTypes.JSON
    },
    aadharInfo: {
      type: DataTypes.JSON
    },
    packageId: {
      type: DataTypes.INTEGER,
      references: {
        model: Package,
        key: 'id'
      }
    },
    companyId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'company',
        key: 'id'
      },
      allowNull: false
    },
    tokenVersion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    bbpsAgentId: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    },
    lastActivityTime: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    loggedIn: {
      type: DataTypes.BOOLEAN
    },
    loginAttempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    isLocked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    lockUntil: {
      type: DataTypes.DATE,
      allowNull: true
    },
    isAadharUploaded: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    isPanUploaded: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    resetPan: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    resetAadhar: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    referCode: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    slabId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    isAepsOnbaordingStatus: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    hooks: {
      beforeCreate: [
        async function (user, options) {
          if (user.password || user.secureKey) {
            user.password = await bcrypt.hash(user.password, 8);
          }
          if (user.secureKey) {
            user.secureKey = await bcrypt.hash(user.secureKey, 8);
          }
          user.isActive = user.isActive?.toString() !== 'false';
          user.isDeleted = false;

          if (user.aadharDetails) {
            user.aadharDetails = encryptJsonFieldValue(user.aadharDetails);
          }
          if (user.panDetails) {
            user.panDetails = encryptJsonFieldValue(user.panDetails);
          }

          if (user.profileImage) {
            user.profileImage = encrypt(user.profileImage);
          }
          if (user.aadharFrontImage) {
            user.aadharFrontImage = encryptImageField(user.aadharFrontImage);
          }
          if (user.aadharBackImage) {
            user.aadharBackImage = encryptImageField(user.aadharBackImage);
          }
          if (user.panCardFrontImage) {
            user.panCardFrontImage = encryptImageField(user.panCardFrontImage);
          }
          if (user.panCardBackImage) {
            user.panCardBackImage = encryptImageField(user.panCardBackImage);
          }

          if (user.referCode) {
            user.referCode = encrypt(user.referCode);
          }
        },

        async function (user, options) {
          let rolePrefix;
          switch (user.userRole) {
            case 1:
              rolePrefix = 'AD';
              break;
            case 2:
              rolePrefix = 'WU';
              break;
            case 3:
              rolePrefix = 'MD';
              break;
            case 4:
              rolePrefix = 'DI';
              break;
            case 5:
              rolePrefix = 'RE';
              break;
            case 6:
              rolePrefix = 'EP';
              break;
          }

          let companyPrefix = '';
          let companyName = null;

          if (user.companyName) {
            companyName = user.companyName;
            delete user.companyName;
          }

          if (!companyName && user.companyId) {
            try {
              const company = await Company.findOne({
                where: { id: user.companyId },
                attributes: ['companyName']
              });

              if (company && company.companyName) {
                companyName = company.companyName;
              }
            } catch (companyError) {
            }
          }

          if (companyName) {
            let cleanedName = companyName.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const nameLength = cleanedName.length;

            if (nameLength >= 5) {
              companyPrefix = cleanedName.substring(0, 5);
            } else if (nameLength >= 2) {
              companyPrefix = cleanedName.substring(0, nameLength);
            } else if (nameLength === 1) {
              companyPrefix = cleanedName;
            }
          }

          const searchPattern = companyPrefix
            ? `${companyPrefix}${rolePrefix}%`
            : `${rolePrefix}%`;

          const lastUser = await User.findOne({
            where: {
              userId: {
                [Op.like]: searchPattern
              }
            },
            order: [[Sequelize.fn('length', Sequelize.col('userId')), 'DESC'], ['userId', 'DESC']]
          });

          let newIdNumber = 1;
          if (lastUser) {
            const lastId = lastUser.userId;
            const prefixLength = companyPrefix ? companyPrefix.length + rolePrefix.length : rolePrefix.length;
            const numberPart = lastId.slice(prefixLength);
            const lastIdNumber = parseInt(numberPart, 10);
            if (!isNaN(lastIdNumber)) {
              newIdNumber = lastIdNumber + 1;
            }
          }

          const formattedNumber = newIdNumber.toString().padStart(2, '0');

          user.userId = companyPrefix
            ? `${companyPrefix}${rolePrefix}${formattedNumber}`
            : `${rolePrefix}${formattedNumber}`;
        }
      ],
      beforeBulkCreate: [
        async function (user, options) {
          if (user !== undefined && user.length) {
            for (let userIndex of user) {
              const element = userIndex;
              element.isActive = true;
              element.isDeleted = false;
              if (element.aadharDetails) {
                element.aadharDetails = encryptJsonFieldValue(element.aadharDetails);
              }
              if (element.panDetails) {
                element.panDetails = encryptJsonFieldValue(element.panDetails);
              }
              if (element.profileImage) {
                element.profileImage = encrypt(element.profileImage);
              }
              if (element.aadharFrontImage) {
                element.aadharFrontImage = encryptImageField(element.aadharFrontImage);
              }
              if (element.aadharBackImage) {
                element.aadharBackImage = encryptImageField(element.aadharBackImage);
              }
              if (element.panCardFrontImage) {
                element.panCardFrontImage = encryptImageField(element.panCardFrontImage);
              }
              if (element.panCardBackImage) {
                element.panCardBackImage = encryptImageField(element.panCardBackImage);
              }
              if (element.referCode) {
                element.referCode = encrypt(element.referCode);
              }
            }
          }
        }
      ],
      beforeUpdate: [
        async function (user) {
          if (user.aadharDetails) {
            user.aadharDetails = encryptJsonFieldValue(user.aadharDetails);
          }
          if (user.panDetails) {
            user.panDetails = encryptJsonFieldValue(user.panDetails);
          }
          if (user.changed('profileImage') && user.profileImage) {
            if (typeof user.profileImage === 'string' && user.profileImage.startsWith('images/')) {
              user.profileImage = encrypt(user.profileImage);
            }
          }
          if (user.changed('aadharFrontImage') && user.aadharFrontImage) {
            user.aadharFrontImage = encryptImageField(user.aadharFrontImage);
          }
          if (user.changed('aadharBackImage') && user.aadharBackImage) {
            user.aadharBackImage = encryptImageField(user.aadharBackImage);
          }
          if (user.changed('panCardFrontImage') && user.panCardFrontImage) {
            user.panCardFrontImage = encryptImageField(user.panCardFrontImage);
          }
          if (user.changed('panCardBackImage') && user.panCardBackImage) {
            user.panCardBackImage = encryptImageField(user.panCardBackImage);
          }
          if (user.changed('referCode') && user.referCode) {
            if (typeof user.referCode === 'string' && !/^[0-9a-f]{32,}$/i.test(user.referCode)) {
              user.referCode = encrypt(user.referCode);
            }
          }
          user.updatedAt = new Date();
        }
      ],
      afterFind: [
        async function (user) {
          if (Array.isArray(user)) {
            user.forEach((u) => {
              applyDocumentDecryption(u);
              if (u.profileImage) {
                try {
                  u.profileImage = decrypt(u.profileImage);
                } catch (e) {
                }
              }
              if (u.aadharFrontImage) {
                u.aadharFrontImage = decryptImageField(u.aadharFrontImage);
              }
              if (u.aadharBackImage) {
                u.aadharBackImage = decryptImageField(u.aadharBackImage);
              }
              if (u.panCardFrontImage) {
                u.panCardFrontImage = decryptImageField(u.panCardFrontImage);
              }
              if (u.panCardBackImage) {
                u.panCardBackImage = decryptImageField(u.panCardBackImage);
              }
              if (u.referCode) {
                try {
                  u.referCode = decrypt(u.referCode);
                } catch (e) {
                }
              }
            });
          } else {
            applyDocumentDecryption(user);
            if (user?.profileImage) {
              try {
                user.profileImage = decrypt(user.profileImage);
              } catch (e) {
              }
            }
            if (user?.aadharFrontImage) {
              user.aadharFrontImage = decryptImageField(user.aadharFrontImage);
            }
            if (user?.aadharBackImage) {
              user.aadharBackImage = decryptImageField(user.aadharBackImage);
            }
            if (user?.panCardFrontImage) {
              user.panCardFrontImage = decryptImageField(user.panCardFrontImage);
            }
            if (user?.panCardBackImage) {
              user.panCardBackImage = decryptImageField(user.panCardBackImage);
            }
            // Decrypt referCode
            if (user?.referCode) {
              try {
                user.referCode = decrypt(user.referCode);
              } catch (e) {
              }
            }
          }
        }
      ]
    }
  }
);
User.prototype.isPasswordMatch = async function (password) {
  const user = this;
  if (user.password && user.password.includes('~')) {
    const [hashedPassword, expireTime] = user.password.split('~');
    if (expireTime && moment(expireTime).isBefore(moment())) {
      return false;
    }
    return bcrypt.compare(password, hashedPassword);
  }
  return bcrypt.compare(password, user.password);
};

User.prototype.isPinMatch = async function (pin) {
  const user = this;
  return bcrypt.compare(pin, user.secureKey);
};

User.prototype.isAccountLocked = function () {
  const isLockedByStatus = !!(this.isLocked && this.lockUntil && this.lockUntil > Date.now());

  const isLockedByAttempts = (this.loginAttempts || 0) >= authConstantEnum.MAX_LOGIN_RETRY_LIMIT;

  return isLockedByStatus || isLockedByAttempts;
};


User.prototype.incrementLoginAttempts = async function () {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return await this.update({
      loginAttempts: 1,
      lockUntil: null,
      isLocked: false
    });
  }

  const newAttemptCount = (this.loginAttempts || 0) + 1;
  const updates = { loginAttempts: newAttemptCount };

  if (newAttemptCount >= authConstantEnum.MAX_LOGIN_RETRY_LIMIT) {
    updates.lockUntil = Date.now() + authConstantEnum.LOGIN_LOCK_TIME * 60 * 1000; // 20 minutes
    updates.isLocked = true;
  }

  return await this.update(updates);
};

User.prototype.resetLoginAttempts = async function () {
  return await this.update({
    loginAttempts: 0,
    lockUntil: null,
    isLocked: false
  });
};

User.prototype.resetAllLockAttempts = async function () {
  return await this.update({
    loginAttempts: 0,
    lockUntil: null,
    isLocked: false
  });
};

User.prototype.resetOtpAttempts = async function () {
  return await this.update({
    loginAttempts: 0,
    lockUntil: null,
    isLocked: false
  });
};

User.prototype.incrementOtpAttempts = async function () {
  return await this.incrementLoginAttempts();
};

User.prototype.isOtpLocked = function () {
  return this.isAccountLocked();
};

User.prototype.toJSON = function () {
  let values = { ...this.get() };
  delete values.password;
  delete values.addedBy;
  delete values.updatedBy;
  delete values.otpEmail;
  delete values.otpMobile;
  delete values.key2Fa;
  delete values.secureKey;
  return values;
};
sequelizeTransforms(User);
sequelizePaginate.paginate(User);
module.exports = User;
