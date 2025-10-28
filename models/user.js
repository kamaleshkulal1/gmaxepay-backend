/**
 * user.js
 * @description :: sequelize model of database table user
 */
const { DataTypes } = require('sequelize');
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
const { encrypt, decrypt } = require('../utils/encryption');
const Package = require('./packages');

const User = sequelize.define(
  'user',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING
    },
    fullAddress: {
      type: DataTypes.STRING
    },
    city: {
      type: DataTypes.STRING
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
    kycStatus: {
      type: DataTypes.INTEGER,
      required: true,
      values: convertObjectToEnum(authConstantEnum.KYC_STATUS)
    },
    otpEmail: {
      type: DataTypes.STRING,
      allowNull: true
    },
    otpMobile: {
      type: DataTypes.STRING,
      allowNull: true
    },
    key2Fa: {
      type: DataTypes.STRING,
      allowNull: true
    },
    is2FAenabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    is2faEnabledActive:{
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
    aadharDetails: {
      type: DataTypes.STRING,
      allowNull: true
    },
    panDetails: {
      type: DataTypes.STRING,
      allowNull: true
    },
    aadharFrontImage: {
      type: DataTypes.JSON,
      allowNull: true
    },
    aadharBackImage: {
      type: DataTypes.JSON,
      allowNull: true
    },
    panCardImage: {
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
    resetPan: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    resetAadhar: {
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
            user.aadharDetails = encrypt(user.aadharDetails);
          }
          if (user.panDetails) {
            user.panDetails = encrypt(user.panDetails);
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

          const lastUser = await User.findOne({
            where: {
              userId: {
                [Op.like]: `${rolePrefix}%`
              }
            },
            order: [['createdAt', 'DESC']]
          });

          let newIdNumber = 1;
          if (lastUser) {
            const lastId = lastUser.userId;
            const lastIdNumber = parseInt(lastId.slice(rolePrefix.length), 10);
            newIdNumber = lastIdNumber + 1;
          }

          const formattedNumber = newIdNumber.toString().padStart(2, '0');

          user.userId = `${rolePrefix}${formattedNumber}`;
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
                element.aadharDetails = encrypt(element.aadharDetails);
              }
              if (element.panDetails) {
                element.panDetails = encrypt(element.panDetails);
              }
            }
          }
        }
      ],
      beforeUpdate: [
        async function (user) {
          if (user.aadharDetails) {
            user.aadharDetails = encrypt(user.aadharDetails);
          }
          if (user.panDetails) {
            user.panDetails = encrypt(user.panDetails);
          }
          user.updatedAt = new Date();
        }
      ],
      afterFind: [
        async function (user) {
          if (Array.isArray(user)) {
            user.forEach((u) => {
              if (u.aadharDetails) {
                u.aadharDetails = decrypt(u.aadharDetails);
              }
              if (u.panDetails) {
                u.panDetails = decrypt(u.panDetails);
              }
            });
          } else {
            if (user?.aadharDetails) {
              user.aadharDetails = decrypt(user.aadharDetails);
            }
            if (user?.panDetails) {
              user.panDetails = decrypt(user.panDetails);
            }
          }
        }
      ]
    }
  }
);
User.prototype.isPasswordMatch = async function (password) {
  const user = this;
  return bcrypt.compare(password, user.password);
};

User.prototype.isPinMatch = async function (pin) {
  const user = this;
  return bcrypt.compare(pin, user.secureKey);
};

User.prototype.isAccountLocked = function () {
  return !!(this.isLocked && this.lockUntil && this.lockUntil > Date.now());
};


User.prototype.incrementLoginAttempts = async function () {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return await this.update({
      loginAttempts: 1,
      lockUntil: null,
      isLocked: false
    });
  }
  
  const updates = { loginAttempts: this.loginAttempts + 1 };
  
  // Lock account after 3 failed attempts (password or OTP) for 20 minutes
  if (this.loginAttempts + 1 >= authConstantEnum.MAX_LOGIN_RETRY_LIMIT && !this.isLocked) {
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
  // Use the same logic as incrementLoginAttempts since OTP and login attempts are unified
  return await this.incrementLoginAttempts();
};

User.prototype.isOtpLocked = function () {
  // Use the same logic as isAccountLocked since OTP and login attempts are unified
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
