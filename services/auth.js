/**
 * auth.js
 * @description :: service functions used in authentication
 */
const { Op } = require('sequelize');
const model = require('../models/index');
const moment = require('moment');
const bcrypt = require('bcrypt');
const dbService = require('../utils/dbService');
const { JWT, MAX_LOGIN_RETRY_LIMIT } = require('../constants/authConstant');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
let random = require('random-string-alphanumeric-generator');
const amezesmsApi = require('../services/amezesmsApi');
const crypto = require('crypto');
const aepsDailyLoginService = require('./aepsDailyLoginService');

// Helper function to load user permissions based on role
const loadUserPermissions = async (userRole) => {
  try {
    if (!userRole) {
      return [];
    }
    
    const rolePermissions = await dbService.findAll(
      model.rolePermission,
      { roleId: userRole },
      {
        include: [
          {
            model: model.permission,
            attributes: ['id', 'moduleName', 'isParent', 'parentId']
          }
        ],
        order: [['permissionId', 'ASC']]
      }
    );
    
    // First, map all permissions with their data
    const allPermissions = rolePermissions
      .map((rp) => {
        const permissionMeta = rp.permission
          ? {
              id: rp.permission.id,
              moduleName: rp.permission.moduleName,
              isParent: rp.permission.isParent,
              parentId: rp.permission.parentId
            }
          : null;

        return {
          permissionId: rp.permissionId,
          read: rp.read,
          write: rp.write,
          parentId: permissionMeta?.parentId ?? null,
          moduleName: permissionMeta?.moduleName ?? null,
          isParent: permissionMeta?.isParent ?? null
        };
      })
      .filter((permission) => permission.read === true || permission.write === true);
    
    // Separate parents and children
    const parents = allPermissions.filter(p => p.parentId === null);
    const children = allPermissions.filter(p => p.parentId !== null);
    
    // Build hierarchical structure
    const hierarchicalPermissions = parents.map(parent => {
      // Find all children for this parent
      const parentChildren = children
        .filter(child => child.parentId === parent.permissionId)
        .sort((a, b) => a.permissionId - b.permissionId)
        .map(child => ({
          permissionId: child.permissionId,
          read: child.read,
          write: child.write,
          parentId: child.parentId,
          moduleName: child.moduleName,
          isParent: child.isParent
        }));
      
      // Return parent with children nested, no dataValues for parent
      const parentObj = {
        permissionId: parent.permissionId,
        read: parent.read,
        write: parent.write,
        parentId: parent.parentId,
        moduleName: parent.moduleName,
        isParent: parent.isParent
      };
      
      // Only add children array if there are children
      if (parentChildren.length > 0) {
        parentObj.children = parentChildren;
      }
      
      return parentObj;
    }).sort((a, b) => a.permissionId - b.permissionId);
    
    return hierarchicalPermissions;
  } catch (error) {
    console.error('Error loading user permissions:', error);
    return [];
  }
};

// Helper function to validate and decrypt dataToken with expiration check
const validateAndDecryptDataToken = async (dataToken) => {
  try {
    if (!dataToken) {
      return {
        isValid: false,
        error: 'token is required!'
      };
    }

    // Decrypt dataToken to get user details
    const tokenData = JSON.parse(Buffer.from(dataToken, 'base64').toString());
    const decryptedData = decrypt(tokenData.data, Buffer.from(tokenData.key, 'hex'));
    
    if (!decryptedData) {
      return {
        isValid: false,
        error: 'Invalid token!'
      };
    }

    const userDetail = JSON.parse(decryptedData);
    const { userId, timestamp } = userDetail;

    // Check if dataToken has expired using SIGNATURE_TOKEN_EXPIRY from env
    const currentTime = Date.now();
    const tokenAge = currentTime - timestamp;
    
    // Parse the expiry time from environment (e.g., '10m' = 10 minutes)
    const expiryTime = JWT.SIGNATURE_TOKEN_EXPIRY;
    let expiryInMs;
    
    if (expiryTime.endsWith('m')) {
      expiryInMs = parseInt(expiryTime) * 60 * 1000; // Convert minutes to milliseconds
    } else if (expiryTime.endsWith('h')) {
      expiryInMs = parseInt(expiryTime) * 60 * 60 * 1000; // Convert hours to milliseconds
    } else if (expiryTime.endsWith('s')) {
      expiryInMs = parseInt(expiryTime) * 1000; // Convert seconds to milliseconds
    } else {
      expiryInMs = parseInt(expiryTime) * 60 * 1000; // Default to minutes if no unit specified
    }
    
    if (tokenAge > expiryInMs) {
      return {
        isValid: false,
        error: 'token has expired! Please request a new one.'
      };
    }

    // Fetch existing user to enforce status/KYC checks when needed
    const existingUser = await dbService.findOne(model.user, { id: userId, isDeleted: false });
    if (existingUser && existingUser.isActive === false) {
      // If user is inactive and KYC shows FULL_KYC but steps are not 7, block with specific message
      if (existingUser.kycStatus === 'FULL_KYC' ||  existingUser.kycSteps !== 7) {
        return {
          isValid: false,
          error: 'KYC status is Incomplete. Please complete your KYC to login.'
        };
      }
      return {
        isValid: false,
        error: 'User is inactive. Please contact support.'
      };
    }

    return {
      isValid: true,
      userDetail: userDetail,
      userId: userId
    };
  } catch (error) {
    return {
      isValid: false,
      error: 'Invalid token format!'
    };
  }
};

// Encryption/Decryption utility functions
const doubleEncrypt = (value, key) => {
  if (!value || !key) {
    throw new Error('Value and key are required for encryption');
  }
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.isBuffer(key) ? key.slice(0, 32) : Buffer.from(key).slice(0, 32), iv);
  let encrypted = cipher.update(value, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
};

const decrypt = (encryptedData, key) => {
  try {
    if (!encryptedData || !encryptedData.iv || !encryptedData.encrypted || !encryptedData.authTag) {
      console.error('Missing required encryption data:', encryptedData);
      return null;
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.isBuffer(key) ? key.slice(0, 32) : Buffer.from(key).slice(0, 32),
      Buffer.from(encryptedData.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
};

const hash = (value) => {
  return crypto.createHash('sha256').update(value).digest('hex');
};

const generateToken = (user, secret) => {
  const accessToken = jwt.sign(
    {
      id: user.id,
      userRole: user.userRole,
      userType: user.userType,
      companyId: user.companyId,
      tokenVersion: user.tokenVersion
    },
    secret,
    {
      expiresIn: JWT.EXPIRES_IN * 60,
      algorithm: JWT.ALGORITHM,
      issuer: JWT.ISSUER,
      audience: JWT.AUDIENCE
    }
  );
  const refreshToken = jwt.sign(
    {
      userId: user.id,
      tokenVersion: user.tokenVersion
    },
    JWT.JWT_REFRESH_SECRET,
    {
      expiresIn: JWT.JWT_REFRESH_EXPIRY || '7d',
      algorithm: JWT.ALGORITHM,
      issuer: JWT.ISSUER,
      audience: JWT.AUDIENCE
    }
  );
  return {
    accessToken,
    refreshToken
  };
};

// Generate tokens with access token expiring in 2 minutes and refresh token expiring
// exactly 28 minutes from the original login timestamp
// The refresh token includes the original login timestamp to preserve the 30-minute session limit
const generateTokenWithRemainingRefresh = (user, secret, loginTimestamp) => {
  const now = Date.now();
  const loginTs = typeof loginTimestamp === 'number' ? loginTimestamp : now;
  
  // Access token expires in 2 minutes from now
  const accessTokenExpiry = JWT.EXPIRES_IN * 60; // 2 minutes in seconds
  
  // Refresh token expires exactly 28 minutes from login timestamp
  const refreshTokenExpiryMs = 28 * 60 * 1000; // 28 minutes in milliseconds
  const refreshTokenExpiryTime = loginTs + refreshTokenExpiryMs;
  const refreshTokenExpirySeconds = Math.max(60, Math.floor((refreshTokenExpiryTime - now) / 1000)); // Minimum 1 minute

  const accessToken = jwt.sign(
    {
      id: user.id,
      userRole: user.userRole,
      userType: user.userType,
      companyId: user.companyId,
      tokenVersion: user.tokenVersion
    },
    secret,
    {
      expiresIn: accessTokenExpiry,
      algorithm: JWT.ALGORITHM,
      issuer: JWT.ISSUER,
      audience: JWT.AUDIENCE
    }
  );

  // Store original login timestamp in refresh token payload to preserve 30-minute session limit
  const refreshToken = jwt.sign(
    {
      userId: user.id,
      tokenVersion: user.tokenVersion,
      loginTimestamp: loginTs // Store original login timestamp
    },
    JWT.JWT_REFRESH_SECRET,
    {
      expiresIn: refreshTokenExpirySeconds,
      algorithm: JWT.ALGORITHM,
      issuer: JWT.ISSUER,
      audience: JWT.AUDIENCE
    }
  );

  return { accessToken, refreshToken };
};

const generateTempToken = (
  user,
  secret,
  isPassword = null,
  isOtp = null,
  userAgent,
  ip,
  passwordRequired = false,
  otpRequired = false
) => {
  const passed = [];
  if (isPassword) passed.push('password');
  if (isOtp) passed.push('loginOtp');
  const accessToken = jwt.sign(
    {
      id: user.id,
      userMobile: user.mobileNo,
      companyId: user.companyId,
      passed,
      userRole: user.userRole,
      userAgent,
      ip,
      passwordRequired,
      otpRequired
    },
    secret,
    {
      expiresIn: '5m',
      algorithm: JWT.ALGORITHM,
      issuer: JWT.ISSUER,
      audience: JWT.AUDIENCE
    }
  );
  return accessToken;
};

function getRandomNumber() {
  return Math.floor(Math.random() * 10) + 1;
}

async function generateQRCodeURL(user) {
  const secret = speakeasy.generateSecret({
    length: 32,
    name: `Gmaxepay`
  });

  await dbService.update(
    model.user,
    { id: user.id },
    { key2Fa: secret.base32 }
  );
  return new Promise((resolve, reject) => {
    QRCode.toDataURL(secret.otpauth_url, (err, dataURL) => {
      if (err) {
        reject(err);
      } else {
        resolve(dataURL);
      }
    });
  });
}

const verifyOTP = (otp, user) => {
  try {
    const verified = speakeasy.totp.verify({
      secret: user.key2Fa,
      encoding: 'base32',
      token: otp,
      window: 0
    });
    return verified;
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return false;
  }
};

const refreshAccessToken = async (token) => {
  try {
    const payload = jwt.verify(token, JWT.JWT_REFRESH_SECRET, {
      algorithms: [JWT.ALGORITHM],
      issuer: JWT.ISSUER,
      audience: JWT.AUDIENCE
    });
    const user = await dbService.findOne(model.user, {
      id: payload.userId,
      isActive: true,
      isDeleted: false
    });
    const userData = user.toJSON();
    if (!user || userData.tokenVersion !== payload.tokenVersion) {
      return {
        flag: true,
        msg: 'Invalid token'
      };
    }

    if (userData.isDeleted) {
      return {
        flag: true,
        msg: 'User is does not exist!'
      };
    }

    if (!userData.isActive) {
      return {
        flag: true,
        msg: 'User is inactive Please contact Admin'
      };
    }

    // Get original login timestamp from refresh token payload
    // If not present (old tokens), use current time as fallback
    const loginTimestamp = payload.loginTimestamp || Date.now();
    
    // Generate new access token (2 minutes) and refresh token with same expiry
    // based on original login timestamp to preserve 30-minute session limit
    const { accessToken, refreshToken } = generateTokenWithRemainingRefresh(user, JWT.SECRET, loginTimestamp);
    
    return {
      flag: false,
      msg: 'Token refreshed successfully',
      data: { accessToken, refreshToken }
    };
  } catch (error) {
    console.error('Error refreshing access token:', error);
    return {
      flag: true,
      msg: 'Failed to refresh token'
    };
  }
};

const loginUser = async (
  mobileNo,
  password,
  latitude,
  longitude,
  userType,
  req,
  companyId
) => {
  try {
    const where = {
      isActive: true,
      isDeleted: false,
      mobileNo: mobileNo
    };
    
    if (companyId !== null) {
      where.companyId = companyId;
    }
    let options = {};
    
    if (!longitude || !latitude) {
      return {
        flag: true,
        msg: 'Please allow the Location access!'
      };
    }
    
    const user = await dbService.findOne(model.user, where, options);
    if (!user) {
      return {
        flag: true,
        msg: 'Invalid credentials!'
      };
    }
    
    // Update user's last known coordinates
    try {
      await dbService.update(
        model.user,
        { id: user.id },
        { latitude, longitude }
      );
      user.latitude = latitude;
      user.longitude = longitude;
    } catch (coordError) {
      console.log('Failed to update latitude/longitude for user', user.id, coordError);
    }

    // Check if account is locked due to failed password attempts
    if (user.isAccountLocked()) {
      return {
        flag: true,
        msg: `Account is locked due to multiple failed login attempts. Please contact admin for assistance.`
      };
    }
    
    if (user.userType !== parseInt(userType)) {
      return {
        flag: true,
        msg: 'Please select Valid User Type'
      };
    }

    // Verify password
    if (password) {
      let isPasswordMatched = await user.isPasswordMatch(password);
      if (!isPasswordMatched) {
        // Increment login attempts and potentially lock account
        await user.incrementLoginAttempts();
        
        // Reload user to get updated loginAttempts and lock status
        const updatedUser = await dbService.findOne(model.user, { id: user.id });
        
        // Check if account is now locked after this attempt
        if (updatedUser.isAccountLocked() || updatedUser.loginAttempts >= MAX_LOGIN_RETRY_LIMIT) {
          return {
            flag: true,
            msg: 'Account locked due to multiple failed login attempts. Please contact admin for assistance.'
          };
        }
        
        // Calculate remaining attempts (MAX_LOGIN_RETRY_LIMIT = 3)
        // After 1st wrong: loginAttempts = 1, remaining = 2
        // After 2nd wrong: loginAttempts = 2, remaining = 1
        // After 3rd wrong: account is locked (handled above)
        const remainingAttempts = MAX_LOGIN_RETRY_LIMIT - updatedUser.loginAttempts;
        
        // Ensure remaining attempts is never negative
        if (remainingAttempts <= 0) {
          return {
            flag: true,
            msg: 'Account locked due to multiple failed login attempts. Please contact admin for assistance.'
          };
        }
        
        return {
          flag: true,
          msg: `Incorrect Password. ${remainingAttempts} attempt${remainingAttempts > 1 ? 's' : ''} remaining before account lock.`
        };
      }
      
      // Reset login attempts on successful password verification
      await user.resetLoginAttempts();
    }


    const ip = req.headers['x-forwarded-for']?.split(',')[0] ||
              req.connection?.remoteAddress ||
              req.socket?.remoteAddress ||
              req.ip;
    const userAgent = req.headers['user-agent'];

    // Create sensitive data for encryption
    const sensitiveData = {
      mobileNo: user.mobileNo,
      email: user.email,
      userRole: user.userRole,
      userType: user.userType,
      userId: user.id,
      companyId: user.companyId,
      ip: ip,
      timestamp: Date.now()
    };
    
    const encryptionKey = crypto.randomBytes(32);
    const encryptedData = doubleEncrypt(JSON.stringify(sensitiveData), encryptionKey);

    const dataToken = {
      data: encryptedData,
      key: encryptionKey.toString('hex')
    };

    // In development environment, skip mobile OTP but check security method
    if (process.env.NODE_ENV === 'development') {
      // Check if password reset is required
      if (user.isResetPassword || !user.password) {
        return {
          flag: false,
          msg: 'Please reset your password',
          data: {
            requiresPasswordReset: true,
            token: Buffer.from(JSON.stringify(dataToken)).toString('base64')
          }
        };
      }
      
      // Reset all lock attempts in development environment for easier testing
      await user.resetAllLockAttempts();

      // Check security method: MPIN (default) or 2FA (optional)
      // If 2FA is explicitly enabled, use 2FA
      if (user.is2FAenabled && user.key2Fa) {
        return {
          flag: false,
          msg: 'Please enter your 2FA code',
          data: {
            requires2FA: true,
            token: Buffer.from(JSON.stringify(dataToken)).toString('base64')
          }
        };
      }
      
      // Check if MPIN setup is required (isMpinSetup: true means setup needed)
      if (user.isMpinSetup === true || (user.isMpinSetup === null && !user.secureKey)) {
        return {
          flag: false,
          msg: 'Please set up MPIN to secure your account.',
          data: {
            requiresSetupMPIN: true,
            token: Buffer.from(JSON.stringify(dataToken)).toString('base64')
          }
        };
      }
      
      // If MPIN is enabled or secureKey exists, require MPIN verification
      if (user.isMpinEnabled === true || user.secureKey) {
        return {
          flag: false,
          msg: 'Please enter your MPIN',
          data: {
            requiresMPIN: true,
            token: Buffer.from(JSON.stringify(dataToken)).toString('base64')
          }
        };
      }

      // Fallback: If neither MPIN nor 2FA is set, default to MPIN setup
      return {
        flag: false,
        msg: 'Please set up MPIN to secure your account.',
        data: {
          requiresSetupMPIN: true,
          token: Buffer.from(JSON.stringify(dataToken)).toString('base64')
        }
      };
    }
    

    // Production environment - Check if OTP login is required (once per day)
    // Check if user already logged in with OTP today (IST)
    const todayIST = aepsDailyLoginService.getIndianDateOnly(); // Returns YYYY-MM-DD in IST
    const lastOtpDate = user.lastOtpLoginDate 
      ? moment(user.lastOtpLoginDate).utcOffset('+05:30').format('YYYY-MM-DD')
      : null;
    
    const otpAlreadyDoneToday = lastOtpDate === todayIST;

    // If OTP was already done today, skip OTP and go directly to security method (MPIN/2FA)
    if (otpAlreadyDoneToday) {
      // Check if password reset is required
      if (user.isResetPassword || !user.password) {
        return {
          flag: false,
          msg: 'Please reset your password',
          data: {
            requiresPasswordReset: true,
            token: Buffer.from(JSON.stringify(dataToken)).toString('base64')
          }
        };
      }

      // Check security method: MPIN (default) or 2FA (optional)
      // If 2FA is explicitly enabled, use 2FA
      if (user.is2FAenabled && user.key2Fa) {
        return {
          flag: false,
          msg: 'Please enter your 2FA code',
          data: {
            requires2FA: true,
            token: Buffer.from(JSON.stringify(dataToken)).toString('base64')
          }
        };
      }
      
      // Check if MPIN setup is required (isMpinSetup: true means setup needed)
      if (user.isMpinSetup === true || (user.isMpinSetup === null && !user.secureKey)) {
        return {
          flag: false,
          msg: 'Please set up MPIN to secure your account.',
          data: {
            requiresSetupMPIN: true,
            token: Buffer.from(JSON.stringify(dataToken)).toString('base64')
          }
        };
      }
      
      // If MPIN is enabled or secureKey exists, require MPIN verification
      if (user.isMpinEnabled === true || user.secureKey) {
        return {
          flag: false,
          msg: 'Please enter your MPIN',
          data: {
            requiresMPIN: true,
            token: Buffer.from(JSON.stringify(dataToken)).toString('base64')
          }
        };
      }

      // Fallback: If neither MPIN nor 2FA is set, default to MPIN setup
      return {
        flag: false,
        msg: 'Please set up MPIN to secure your account.',
        data: {
          requiresSetupMPIN: true,
          token: Buffer.from(JSON.stringify(dataToken)).toString('base64')
        }
      };
    }

    // OTP not done today - Generate OTP for mobile verification
    // Reset login attempts when generating new OTP
    await user.resetLoginAttempts();
    
    const code = random.randomNumber(6);
    const hashedCode = await bcrypt.hash(code, 10);
    const expireOTP = moment().add(120, 'seconds').toISOString() // 2 minutes;
    
    await dbService.update(
      model.user,
      { id: user.id },
      { otpMobile: hashedCode + '~' + expireOTP }
    );

    let msg = `Dear user, your OTP for account login is ${code}. Team Gmaxepay`;
    // Security: OTP logging removed for protection, user.mobileNo, 'with message:', msg);
    const smsResult = await amezesmsApi.sendSmsLogin(user.mobileNo, msg);
    // Security: SMS response logging removed for protection, smsResult);

    return {
      flag: false,
      msg: 'Please Enter OTP',
      data: {
        requiresOtpVerify: true,
        token: Buffer.from(JSON.stringify(dataToken)).toString('base64')
      }
    };

  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};


const verifyMobileOTP = async (token, mobileOtp, companyId) => {
  try {
    if (!token || !mobileOtp) {
      return {
        flag: true,
        msg: 'token and OTP are required!'
      };
    }

    // Validate and decrypt dataToken with expiration check
    const tokenValidation = await validateAndDecryptDataToken(token);
    if (!tokenValidation.isValid) {
      return {
        flag: true,
        msg: tokenValidation.error
      };
    }

    const userDetail = tokenValidation.userDetail;
    const { mobileNo, userId, companyId: tokenCompanyId, ip, userAgent } = userDetail;

    const where = {
      id: userId,
      isActive: true,
      isDeleted: false,
      mobileNo
    };
    
    if (companyId !== null) {
      where.companyId = companyId;
    }
    let options = {};
    const user = await dbService.findOne(model.user, where, options);
    if (!user) {
      return {
        flag: true,
        msg: 'User does not exist!'
      };
    }
    
    // Check if account is locked due to failed login attempts (password or OTP)
    if (user.isAccountLocked()) {
      return {
        flag: true,
        msg: `Account is locked due to multiple failed login attempts. Please contact admin for assistance.`
      };
    }

    if (mobileOtp) {
      const [otp, expireOTP] = user.otpMobile.split('~');
      const currentTime = moment().toISOString();
      if (moment(currentTime).isAfter(expireOTP)) {
        return {
          flag: true,
          msg: 'OTP has expired. Please request a new OTP.'
        };
      }
      if (!otp || !expireOTP) {
        return {
          flag: true,
          msg: 'OTP is not set. Please request a new OTP.'
        };
      }
      if (mobileOtp.length !== 6) {
        return {
          flag: true,
          msg: 'Please provide a valid OTP!'
        };
      }
      // Compare the provided OTP with the stored OTP
      const isOtpValid = await bcrypt.compare(mobileOtp, otp);
      if (isOtpValid) {
        // Reset login attempts on successful verification
        await user.resetLoginAttempts();
        
        // Update lastOtpLoginDate to today (IST) - OTP done once per day
        const todayIST = aepsDailyLoginService.getIndianDateOnly(); // Returns YYYY-MM-DD in IST
        const todayISTMidnight = new Date(`${todayIST}T00:00:00+05:30`);
        
        await dbService.update(
          model.user,
          { id: user.id },
          { lastOtpLoginDate: todayISTMidnight }
        );
        
        // Check if password reset is required
        if (user.isResetPassword || !user.password) {
          return {
            flag: false,
            msg: 'Please reset your password',
            data: {
              requiresPasswordReset: true,
              token: token
            }
          };
        }

            // Check if password reset is required
    if (user.isResetPassword) {
      const ip = req.headers['x-forwarded-for']?.split(',')[0] ||
                req.connection?.remoteAddress ||
                req.socket?.remoteAddress ||
                req.ip;
      const userAgent = req.headers['user-agent'];

      // Create sensitive data for encryption
      const sensitiveData = {
        mobileNo: user.mobileNo,
        email: user.email,
        userRole: user.userRole,
        userType: user.userType,
        userId: user.id,
        companyId: user.companyId,
        ip: ip,
        timestamp: Date.now()
      };
      
      const encryptionKey = crypto.randomBytes(32);
      const encryptedData = doubleEncrypt(JSON.stringify(sensitiveData), encryptionKey);

      const dataToken = {
        data: encryptedData,
        key: encryptionKey.toString('hex')
      };

      return {
        flag: false,
        msg: 'Please Reset Password',
        data: {
          requiresPasswordReset: true,
          token: token  
        }
      };
    }

        // Check security method: MPIN (default) or 2FA (optional)
        // If 2FA is explicitly enabled, use 2FA
        if (user.is2FAenabled && user.key2Fa) {
          return {
            flag: false,
            msg: 'Please enter your 2FA code',
            data: {
              requires2FA: true,
              token: token
            }
          };
        }
        
        // Check if MPIN setup is required (isMpinSetup: true means setup needed)
        if (user.isMpinSetup === true || (user.isMpinSetup === null && !user.secureKey)) {
          return {
            flag: false,
            msg: 'Please set up MPIN to secure your account.',
            data: {
              requiresSetupMPIN: true,
              token: token
            }
          };
        }
        
        // If MPIN is enabled or secureKey exists, require MPIN verification
        if (user.isMpinEnabled === true || user.secureKey) {
          return {
            flag: false,
            msg: 'Please enter your MPIN',
            data: {
              requiresMPIN: true,
              token: token
            }
          };
        }

        // Fallback: If neither MPIN nor 2FA is set, default to MPIN setup
        return {
          flag: false,
          msg: 'Please set up MPIN to secure your account.',
          data: {
            requiresSetupMPIN: true,
            token: token
          }
        };
      } else {
        // Increment OTP attempts and potentially lock OTP verification
        await user.incrementOtpAttempts();
        
        // Check if OTP verification is now locked after this attempt
        const updatedUser = await dbService.findOne(model.user, { id: user.id });
        if (updatedUser.isOtpLocked()) {
          return {
            flag: true,
            msg: 'OTP verification locked due to multiple failed attempts. Please contact admin for assistance.'
          };
        }
        
        const remainingAttempts = 3 - updatedUser.loginAttempts;
        return {
          flag: true,
          msg: `OTP is incorrect. ${remainingAttempts} attempts remaining before OTP lock.`
        };
      }
    } else {
      return {
        flag: true,
        msg: 'Please provide a valid OTP!'
      };
    }
  } catch (error) {
    throw new Error(error.message);
  }
};

const qrGenerator = async (mobileNo, isLoginOtpVerified, companyId) => {
  try {
    if (!mobileNo || !isLoginOtpVerified) {
      return {
        flag: true,
        msg: 'Mobile number and OTP are required!'
      };
    }
    const where = {
      isActive: true,
      isDeleted: false,
      mobileNo,
      companyId
    };
    let options = {};
    const user = await dbService.findOne(model.user, where, options);
    if (!user) {
      return {
        flag: true,
        msg: 'User does not exist!'
      };
    }
    return generateQRCodeURL(user)
      .then(async (dataURL) => {
        return {
          flag: false,
          msg: 'Please Scan Qr code to login',
          data: {
            dataURL
          }
        };
      })
      .catch((err) => {
        console.error('Error generating QR code:', err);
        return {
          flag: true,
          msg: 'Error during Qr generation'
        };
      });
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};

const verifyQrUser = async (
  userDetail,
  mobileNo,
  otp,
  companyId,
  enableQR = false
) => {
  try {
    if (!mobileNo || !otp) {
      return {
        flag: true,
        msg: 'Mobile number and OTP are required!'
      };
    }
    const { passed, passwordRequired, otpRequired } = userDetail;

    if (passwordRequired && !passed.includes('password')) {
      return {
        flag: true,
        msg: 'Password not verified yet.'
      };
    }

    if (otpRequired && !passed.includes('loginOtp')) {
      return {
        flag: true,
        msg: 'OTP not verified yet.'
      };
    }

    const where = {
      id: userDetail.id,
      isActive: true,
      isDeleted: false,
      mobileNo,
      companyId
    };
    let options = {};
    const user = await dbService.findOne(model.user, where, options);
    if (!user) {
      return {
        flag: true,
        msg: 'User does not exist!'
      };
    }

    const verificationResult = await verifyOTP(otp, user);
    if (!verificationResult) {
      return {
        flag: true,
        msg: '2FA Code is incorrect. Please try again!',
        data: null
      };
    }
    if (enableQR) {
      await dbService.update(
        model.user,
        { id: user.id },
        { is2FAenabled: true }
      );
    }
    const userData = user.toJSON();

    return {
      flag: false,
      msg: '2FA Enabled successfully!',
      data: userData
    };
  } catch (error) {
    console.error('Error during OTP verification:', error);
    return {
      flag: true,
      msg: 'OTP verification failed due to an error.',
      data: null
    };
  }
};

const getLoggedInUser = async (
  userData,
  latitude,
  longitude,
  companyId,
  token
) => {
  try {
    const getTokenVersion = getRandomNumber();
    await dbService.update(
      model.user,
      { id: userData.id },
      { tokenVersion: getTokenVersion, loggedIn: true }
    );
    userData.tokenVersion = getTokenVersion;
    const { accessToken, refreshToken } = generateToken(userData, JWT.SECRET);
    const userStatus = await dbService.createOne(model.userLogin, {
      user_id: userData.id,
      user_type: userData.userRole,
      isLoggedIn: true,
      latitude: latitude,
      longitude: longitude,
      ipAddress: token,
      companyId
    });

    const userToReturn = {
      id: userData.id,
      name: userData.name,
      mobileNo: userData.mobileNo,
      userRole: userData.userRole,
      outletName: userData.outletName,
      userStatus,
      token: accessToken,
      refreshToken
    };

    return {
      flag: false,
      msg: 'Your are loggedin successfully!',
      data: userToReturn
    };
  } catch (error) {
    console.error('Error during OTP verification:', error);
    return {
      flag: true,
      msg: 'Something went wrong while fetching data.',
      data: null
    };
  }
};

const loginWithOtp = async (
  mobileNo,
  otp,
  mobileOtp,
  latitude,
  longitude,
  req,
  companyId
) => {
  try {
    const where = {
      isActive: true,
      isDeleted: false,
      mobileNo: email,
      companyId
    };
    let options = {};
    if (!longitude || !latitude) {
      return {
        flag: true,
        msg: 'Please allow the Location access!'
      };
    }
    const user = await dbService.findOne(model.user, where, options);
    if (!user) {
      return {
        flag: true,
        msg: 'User does not exist!'
      };
    }

    if (mobileOtp) {
      if (user.otpMobile == mobileOtp) {
        let userData = user.toJSON();
        let ipAddress = req.ip;
        if (ipAddress.startsWith('::ffff:')) {
          ipAddress = ipAddress.split('::ffff:')[1];
        }
        let getTokenVersion = getRandomNumber();
        await dbService.update(
          model.user,
          { id: user.id },
          { tokenVersion: getTokenVersion, loggedIn: true }
        );
        userData.tokenVersion = getTokenVersion;
        const { accessToken, refreshToken } = generateToken(
          userData,
          JWT.SECRET
        );
        const userStatus = await dbService.createOne(model.userLogin, {
          user_id: user.id,
          user_type: user.userRole,
          isLoggedIn: true,
          latitude: latitude,
          longitude: longitude,
          ipAddress: ipAddress,
          companyId
        });
        // Security: IP address logging removed for protection, ipAddress);

        let userToReturn = {
          ...userData,
          userRole: user.userRole,
          userStatus,
          token: accessToken,
          refreshToken
        };
        return {
          flag: false,
          msg: 'Login Successfully!',
          data: userToReturn
        };
      } else {
        return {
          flag: true,
          msg: 'OTP is incorrect. Please try again!'
        };
      }
    }
    const verificationResult = verifyOTP(otp, user);

    if (verificationResult) {
      const userData = user.toJSON();
      if (!longitude || !latitude) {
        return {
          flag: true,
          msg: 'Please allow the Location access!'
        };
      }

      let ipAddress = req.ip;

      if (ipAddress.startsWith('::ffff:')) {
        ipAddress = ipAddress.split('::ffff:')[1];
      }

      const { accessToken, refreshToken } = generateToken(userData, JWT.SECRET);
      const userStatus = await dbService.createOne(model.userLogin, {
        user_id: user.id,
        user_type: user.userRole,
        isLoggedIn: true,
        latitude: latitude,
        longitude: longitude,
        ipAddress: ipAddress,
        companyId
      });
      let userToReturn = {
        ...userData,
        userRole: user.userRole,
        userStatus,
        token: accessToken,
        refreshToken
      };
      return {
        flag: false,
        msg: 'Login Successfully!',
        data: userToReturn
      };
    } else {
      return {
        flag: true,
        msg: 'OTP is incorrect. Please try again!'
      };
    }
  } catch (error) {
    throw new Error(error.message);
  }
};

const resendOTP = async (mobileNo, companyId) => {
  try {
    let where = {
      $or: [{ email: mobileNo }, { mobileNo: mobileNo }],
      companyId
    };
    const user = await dbService.findOne(model.user, where);
    if (!user) {
      return {
        flag: true,
        msg: 'User does not exist!'
      };
    }
    
    // Check if OTP attempts are locked
    if (user.isOtpLocked()) {
      return {
        flag: true,
        msg: `Cannot resend OTP. Account is locked due to multiple failed attempts. Please contact admin for assistance.`
      };
    }
    
    // Reset OTP attempts when resending OTP
    await user.resetOtpAttempts();
    
    let code = random.randomNumber(6);
    const hashedCode = await bcrypt.hash(code, 10);
    const expireOTP = moment().add(120, 'seconds').toISOString() // 2 minutes;
    await dbService.update(model.user, { id: user.id }, { otpMobile: hashedCode + '~' + expireOTP });
    // Security: User data logging removed for protection, user);
    let msg = `Dear user, your OTP for account login is ${code}. Team Gmaxepay`;
    const smsSend = await amezesmsApi.sendSmsLogin(user.mobileNo, msg);
    const userData = user.toJSON();
    if (smsSend) {
      return {
        flag: false,
        msg: 'Please Enter Otp!',
        data: { ...userData }
      };
    } else {
      return {
        flag: true,
        msg: 'Error during sending Otp!'
      };
    }
  } catch (error) {
    throw new Error(error.message);
  }
};

const resendMobileOTP = async (token, companyId) => {
  try {
    if (!token) {
      return {
        flag: true,
        msg: 'token is required!'
      };
    }

    // Validate and decrypt dataToken with expiration check
    const tokenValidation = await validateAndDecryptDataToken(token);
    if (!tokenValidation.isValid) {
      return {
        flag: true,
        msg: tokenValidation.error
      };
    }

    const userDetail = tokenValidation.userDetail;
    const { mobileNo, userId, companyId: tokenCompanyId } = userDetail;

    const where = {
      id: userId,
      isActive: true,
      isDeleted: false,
      mobileNo
    };
    
    if (companyId !== null) {
      where.companyId = companyId;
    }
    
    const user = await dbService.findOne(model.user, where);
    if (!user) {
      return {
        flag: true,
        msg: 'User does not exist!'
      };
    }
    
    // Check if OTP attempts are locked
    if (user.isOtpLocked()) {
      return {
        flag: true,
        msg: `Cannot resend OTP. Account is locked due to multiple failed attempts. Please contact admin for assistance.`
      };
    }
    
    // Reset OTP attempts when resending OTP
    await user.resetOtpAttempts();
    
    // Generate new OTP
    const code = random.randomNumber(6);
    const hashedCode = await bcrypt.hash(code, 10);
    const expireOTP = moment().add(120, 'seconds').toISOString(); // 2 minutes
    
    await dbService.update(
      model.user,
      { id: user.id },
      { otpMobile: hashedCode + '~' + expireOTP }
    );
    
    // Send SMS
    const msg = `Dear user, your OTP for account login is ${code}. Team Gmaxepay`;
    const smsSend = await amezesmsApi.sendSmsLogin(user.mobileNo, msg);
    
    if (smsSend) {
      return {
        flag: false,
        msg: 'OTP sent successfully! Please enter the OTP.',
        data: {
          requiresOtpVerify: true,
          token: token
        }
      };
    } else {
      return {
        flag: true,
        msg: 'Error during sending OTP!'
      };
    }
  } catch (error) {
    console.error('Error resending mobile OTP:', error);
    throw new Error(error.message);
  }
};

const logoutUser = async (id) => {
  try {
    const date = moment.utc();
    const options = {
      order: [['createdAt', 'DESC']]
    };
    const lastActivity = await dbService.findOne(
      model.userLogin,
      { user_id: id },
      options
    );

    await dbService.update(
      model.user,
      { id },
      {
        lastActivityTime: date,
        loggedIn: false,
        tokenVersion: 0
      }
    );
    if (lastActivity) {
      await dbService.update(
        model.userLogin,
        { id: lastActivity.id },
        {
          logout_time: date,
          isLoggedIn: false
        }
      );
    }
    return true;
  } catch (error) {
    return false;
  }
};

const getNews = async (roleId, companyId) => {
  try {
    let options = {};
    let query = { companyId };
    query = {
      roles: {
        [Op.contains]: [roleId]
      },
      isActive: true
    };
    const foundNews = await dbService.findAll(model.news, query, options);

    if (foundNews.length === 0) {
      return {
        flag: true,
        msg: 'Data not found!'
      };
    }

    const messages = foundNews.map((newsItem) => newsItem.dataValues.msg);

    return {
      flag: false,
      msg: 'Data Found!',
      data: messages
    };
  } catch (error) {
    console.error(181, error);
    return {
      flag: true,
      msg: 'An error occurred!'
    };
  }
};

const getPermissions = async (roleId) => {
  try {
    let options = {
      include: [
        {
          model: model.rolePermission,
          attributes: ['id', 'roleId', 'permissionId', 'read', 'write'],
          include: [
            {
              model: model.permission,
              attributes: ['id', 'moduleName', 'isParent', 'parentId']
            }
          ]
        }
      ]
    };
    let query = {};
    query.id = roleId;
    const foundPermissions = await dbService.findAll(
      model.role,
      query,
      options
    );

    foundPermissions.forEach((role) => {
      role.rolePermissions.sort((a, b) => a.permissionId - b.permissionId);
    });

    const organizedPermissions = [];

    foundPermissions.forEach((role) => {
      const permissionMap = {};
      role.rolePermissions.forEach((rolePerm) => {
        if (rolePerm.read || rolePerm.write) {
          const permData = {
            id: rolePerm.permission.id,
            moduleName: rolePerm.permission.moduleName,
            isParent: rolePerm.permission.isParent,
            parentId: rolePerm.permission.parentId,
            read: rolePerm.read,
            write: rolePerm.write,
            roleId: rolePerm.roleId,
            permissionId: rolePerm.permissionId
          };
          if (rolePerm.permission.isParent) {
            if (!permissionMap[rolePerm.permission.id]) {
              permissionMap[rolePerm.permission.id] = {
                ...permData,
                children: []
              };
              organizedPermissions.push(permissionMap[rolePerm.permission.id]);
            } else {
              if (typeof permissionMap[rolePerm.permission.id] === 'object') {
                permissionMap[rolePerm.permission.id] = {
                  ...permissionMap[rolePerm.permission.id],
                  ...permData
                };
              }
            }
          } else {
            if (!permissionMap[rolePerm.permission.parentId]) {
              permissionMap[rolePerm.permission.parentId] = { children: [] };
            }
            // Check if permissionMap[rolePerm.permission.parentId].children is an array before pushing
            if (
              Array.isArray(
                permissionMap[rolePerm.permission.parentId].children
              )
            ) {
              permissionMap[rolePerm.permission.parentId].children.push(
                permData
              );
            }
          }
        }
      });
    });

    if (foundPermissions.length === 0) {
      return {
        flag: true,
        msg: 'Data not found!'
      };
    }

    return {
      flag: false,
      msg: 'Data Found!',
      data: organizedPermissions
    };
  } catch (error) {
    console.error(182, error);
    return {
      flag: true,
      msg: 'An error occurred!'
    };
  }
};
const resetPassword = async (token, newPassword, confirmPassword, companyId) => {
  try {
    if (!token) {
      return {
        flag: true,
        msg: 'Token is required!'
      };
    }

    // Validate and decrypt dataToken with expiration check
    const tokenValidation = await validateAndDecryptDataToken(token);
    if (!tokenValidation.isValid) {
      return {
        flag: true,
        msg: tokenValidation.error
      };
    }

    const userDetail = tokenValidation.userDetail;
    const { userId, purpose } = userDetail;

    // Check if this is a forgot password reset token
    const isForgotPasswordFlow = purpose === 'forgot_password_reset';

    const where = {
      id: userId,
      isActive: true,
      isDeleted: false
    };
    
    if (companyId !== null) {
      where.companyId = companyId;
    }
    const user = await dbService.findOne(model.user, where);
    if (!user) {
      return {
        flag: true,
        msg: 'User does not exist!'
      };
    }

    // For forgot password flow, auto-generate 6-digit temporary password
    if (isForgotPasswordFlow) {
      // Auto-generate 6-digit temporary password
      const tempPassword = random.randomNumber(6);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      const expireTime = moment().add(10, 'minutes').toISOString(); // 10 minutes validity
      
      // Store temporary password with expiry time
      await dbService.update(
        model.user,
        { id: user.id },
        { 
          password: hashedPassword + '~' + expireTime,
          tokenVersion: getRandomNumber()
        }
      );

      // Send SMS with temporary password
      const msg = `Dear user, your temporary password is ${tempPassword}. It is valid for 10 minutes. Team Gmaxepay`;
      await amezesmsApi.sendSmsLogin(user.mobileNo, msg);

      return {
        flag: false,
        msg: 'Temporary password generated and sent successfully! It is valid for 10 minutes.',
        data: {
          requiresLogin: true,
          tempPassword: tempPassword // Include in response for testing, remove in production if needed
        }
      };
    }

    // Original reset password flow (for regular password reset)
    if (!newPassword || !confirmPassword) {
      return {
        flag: true,
        msg: 'New password and confirm password are required!'
      };
    }

    if (newPassword !== confirmPassword) {
      return {
        flag: true,
        msg: 'New password and confirm password do not match!'
      };
    }

    if(!user.isResetPassword) {
      return {
        flag: true,
        msg: 'User is already reset password!'
      };
    }

    // Check if new password is same as old password
    const isSamePassword = await user.isPasswordMatch(newPassword);
    if (isSamePassword) {
      return {
        flag: true,
        msg: 'New password cannot be same as old password!'
      };
    }

    // Hash new password with bcrypt for maximum security
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    // Update password and reset flag
    await dbService.update(
      model.user,
      { id: user.id },
      { 
        password: hashedPassword,
        isResetPassword: false,
        tokenVersion: getRandomNumber()
      }
    );

    // Generate new dataToken for the user after successful password reset
    const sensitiveData = {
      mobileNo: user.mobileNo,
      email: user.email,
      userRole: user.userRole,
      userType: user.userType,
      userId: user.id,
      companyId: user.companyId,
      timestamp: Date.now()
    };

    const key = crypto.randomBytes(32);
    const encryptedData = doubleEncrypt(JSON.stringify(sensitiveData), key);
    const newDataToken = Buffer.from(JSON.stringify({
      data: encryptedData,
      key: key.toString('hex')
    })).toString('base64');

    return {
      flag: false,
      msg: 'Password reset successfully!',
      data: {
        requiresLogin: true,
        token: newDataToken
      }
    };
  } catch (error) {
    console.error('Error resetting password:', error);
    throw new Error(error.message);
  }
};

const setupMPIN = async (dataToken, newMPIN, confirmMPIN, companyId, latitude, longitude, ipAddress) => {
  try {
    if (!dataToken || !newMPIN || !confirmMPIN) {
      return {
        flag: true,
        msg: 'token, new MPIN, and confirm MPIN are required!'
      };
    }

    // Validate and decrypt dataToken with expiration check
    const tokenValidation = await validateAndDecryptDataToken(dataToken);
    if (!tokenValidation.isValid) {
      return {
        flag: true,
        msg: tokenValidation.error
      };
    }

    const { userId } = tokenValidation;
    const userDetail = tokenValidation.userDetail;
    const loginTimestamp = userDetail?.timestamp;

    // Validate MPIN format (4 digits)
    const mpinRegex = /^\d{4}$/;
    if (!mpinRegex.test(newMPIN)) {
      return {
        flag: true,
        msg: 'New MPIN must be exactly 4 digits!'
      };
    }

    if (!mpinRegex.test(confirmMPIN)) {
      return {
        flag: true,
        msg: 'Confirm MPIN must be exactly 4 digits!'
      };
    }

    // Check if new MPIN and confirm MPIN match
    if (newMPIN !== confirmMPIN) {
      return {
        flag: true,
        msg: 'New MPIN and Confirm MPIN do not match!'
      };
    }

    const where = {
      id: userId,
      isActive: true,
      isDeleted: false
    };
    
    if (companyId !== null) {
      where.companyId = companyId;
    }
    const user = await dbService.findOne(model.user, where);
    if (!user) {
      return {
        flag: true,
        msg: 'User does not exist!'
      };
    }

    // Check if user already has an MPIN set up
    if (user.secureKey && user.isMpinEnabled === true) {
      return {
        flag: true,
        msg: 'MPIN already set. Please use verify MPIN to login.'
      };
    }

    // Hash new MPIN
    const hashedMPIN = await bcrypt.hash(newMPIN, 8);

    // Update user's secureKey and MPIN flags (but don't complete login yet)
    await dbService.update(
      model.user,
      { id: user.id },
      { 
        secureKey: hashedMPIN,
        isMpinSetup: false,  // MPIN is now set up
        isMpinEnabled: true  // MPIN is now enabled
      }
    );
    
    // Update user object
    user.secureKey = hashedMPIN;
    user.isMpinSetup = false;
    user.isMpinEnabled = true;
    
    // Generate new dataToken for MPIN verification step
    const ip = userDetail?.ip || '';
    const userAgent = userDetail?.userAgent || '';
    const sensitiveData = {
      mobileNo: user.mobileNo,
      email: user.email,
      userRole: user.userRole,
      userType: user.userType,
      userId: user.id,
      companyId: user.companyId,
      ip: ip,
      timestamp: loginTimestamp || Date.now()
    };
    
    const encryptionKey = crypto.randomBytes(32);
    const encryptedData = doubleEncrypt(JSON.stringify(sensitiveData), encryptionKey);
    const newDataToken = Buffer.from(JSON.stringify({
      data: encryptedData,
      key: encryptionKey.toString('hex')
    })).toString('base64');

    return {
      flag: false,
      msg: 'MPIN set successfully! Please verify your MPIN to complete login.',
      data: {
        requiresMPIN: true,
        token: newDataToken
      }
    };
  } catch (error) {
    console.error('Error setting up MPIN:', error);
    throw new Error(error.message);
  }
};

const verifyMPIN = async (dataToken, mpin, companyId, latitude, longitude, ipAddress) => {
  try {
    if (!dataToken || !mpin) {
      return {
        flag: true,
        msg: 'token and MPIN are required!'
      };
    }

    // Validate and decrypt dataToken with expiration check
    const tokenValidation = await validateAndDecryptDataToken(dataToken);
    if (!tokenValidation.isValid) {
      return {
        flag: true,
        msg: tokenValidation.error
      };
    }

    const { userId } = tokenValidation;
    const loginTimestamp = tokenValidation.userDetail?.timestamp;

    const where = {
      id: userId,
      isActive: true,
      isDeleted: false
    };
    
    if (companyId !== null) {
      where.companyId = companyId;
    }
    const user = await dbService.findOne(model.user, where);
    if (!user) {
      return {
        flag: true,
        msg: 'User does not exist!'
      };
    }

    if (!user.secureKey) {
      return {
        flag: true,
        msg: 'MPIN is not set for this user!'
      };
    }

    // Validate MPIN format (4 digits)
    const mpinRegex = /^\d{4}$/;
    if (!mpinRegex.test(mpin)) {
      return {
        flag: true,
        msg: 'MPIN must be exactly 4 digits!'
      };
    }

    // Verify MPIN
    const isMPINValid = await user.isPinMatch(mpin);
    if (!isMPINValid) {
      return {
        flag: true,
        msg: 'Invalid MPIN. Please try again.'
      };
    }

    // Update user login status
    const getTokenVersion = getRandomNumber();
    await dbService.update(
      model.user,
      { id: user.id },
      { tokenVersion: getTokenVersion, loggedIn: true }
    );
    
    // Update user object with new tokenVersion
    user.tokenVersion = getTokenVersion;
    
    // Generate final tokens after MPIN verification
    const { accessToken, refreshToken } = generateTokenWithRemainingRefresh(user, JWT.SECRET, loginTimestamp);

    // Create userLogin record for successful MPIN verification
    const userLoginRecord = await dbService.createOne(model.userLogin, {
      user_id: user.id,
      user_type: user.userRole,
      isLoggedIn: true,
      latitude: latitude || null,
      longitude: longitude || null,
      ipAddress: ipAddress || null,
      companyId: user.companyId
    });

    // Load user permissions
    const permissions = await loadUserPermissions(user.userRole);

    return {
      flag: false,
      msg: 'MPIN verification successful!',
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          name: user.name,
          mobileNo: user.mobileNo,
          userRole: user.userRole,
          outletName: user.outletName,
          companyId: user.companyId
        },
        userLogin: userLoginRecord,
        permissions
      }
    };
  } catch (error) {
    console.error('Error verifying MPIN:', error);
    throw new Error(error.message);
  }
};

const verify2FA = async (dataToken, otp, companyId, latitude, longitude, ipAddress) => {
  try {
    if (!dataToken || !otp) {
      return {
        flag: true,
        msg: 'token and 2FA code are required!'
      };
    }

    // Validate and decrypt dataToken with expiration check
    const tokenValidation = await validateAndDecryptDataToken(dataToken);
    if (!tokenValidation.isValid) {
      return {
        flag: true,
        msg: tokenValidation.error
      };
    }

    const { userId } = tokenValidation;
    const loginTimestamp = tokenValidation.userDetail?.timestamp;

    const where = {
      id: userId,
      isActive: true,
      isDeleted: false
    };
    
    if (companyId !== null) {
      where.companyId = companyId;
    }
    const user = await dbService.findOne(model.user, where);
    if (!user) {
      return {
        flag: true,
        msg: 'User does not exist!'
      };
    }

    if (!user.key2Fa) {
      return {
        flag: true,
        msg: '2FA is not enabled for this user!'
      };
    }

      // In development environment, skip OTP verification
      if (process.env.NODE_ENV === 'development') {
        // Update user login status FIRST
        const getTokenVersion = getRandomNumber();
        await dbService.update(
          model.user,
          { id: user.id },
          { tokenVersion: getTokenVersion, loggedIn: true }
        );
        
        // Update user object with new tokenVersion
        user.tokenVersion = getTokenVersion;
        
        // Generate final tokens after 2FA verification
        const { accessToken, refreshToken } = generateTokenWithRemainingRefresh(user, JWT.SECRET, loginTimestamp);

        // Create userLogin record for successful 2FA verification
        const userLoginRecord = await dbService.createOne(model.userLogin, {
          user_id: user.id,
          user_type: user.userRole,
          isLoggedIn: true,
          latitude: latitude || null ,
          longitude: longitude|| null,
          ipAddress: ipAddress|| null,
          companyId: user.companyId
        });

        // Load user permissions
        const permissions = await loadUserPermissions(user.userRole);

        return {
          flag: false,
          msg: '2FA verification successful!',
          data: {
            accessToken,
            refreshToken,
            user: {
              id: user.id,
              name: user.name,
              mobileNo: user.mobileNo,
              userRole: user.userRole,
              outletName: user.outletName,
              companyId: user.companyId
            },
            userLogin: userLoginRecord,
            permissions
          }
        };
      }

    // Production environment - Verify OTP
    const verificationResult = verifyOTP(otp, user);
    if (verificationResult) {
      // Update user login status FIRST
      const getTokenVersion = getRandomNumber();
      await dbService.update(
        model.user,
        { id: user.id },
        { tokenVersion: getTokenVersion, loggedIn: true }
      );
      
      // Update user object with new tokenVersion
      user.tokenVersion = getTokenVersion;
      
      // Generate final tokens after 2FA verification
      const { accessToken, refreshToken } = generateTokenWithRemainingRefresh(user, JWT.SECRET, loginTimestamp);

      // Create userLogin record for successful 2FA verification
      const userLoginRecord = await dbService.createOne(model.userLogin, {
        user_id: user.id,
        user_type: user.userRole,
        isLoggedIn: true,
        latitude: latitude,
        longitude: longitude,
        ipAddress: ipAddress,
        companyId: user.companyId
      });

      // Load user permissions
      const permissions = await loadUserPermissions(user.userRole);

      return {
        flag: false,
        msg: '2FA verification successful!',
        data: {
          accessToken,
          refreshToken,
          user: {
            id: user.id,
            name: user.name,
            mobileNo: user.mobileNo,
            userRole: user.userRole,
            outletName: user.outletName,
            companyId: user.companyId
          },
          userLogin: userLoginRecord,
          permissions
        }
      };
    } else {
      return {
        flag: true,
        msg: '2FA verification failed. Please try again.'
      };
    }
  } catch (error) {
    console.error('Error verifying 2FA:', error);
    throw new Error(error.message);
  }
};

const setup2FA = async (dataToken, otp, companyId) => {
  try {
    if (!dataToken || !otp) {
      return {
        flag: true,
        msg: 'token and 2FA code are required!'
      };
    }

    // Validate and decrypt dataToken with expiration check
    const tokenValidation = await validateAndDecryptDataToken(dataToken);
    if (!tokenValidation.isValid) {
      return {
        flag: true,
        msg: tokenValidation.error
      };
    }

    const { userId } = tokenValidation;
    const loginTimestamp = tokenValidation.userDetail?.timestamp;

    const where = {
      id: userId,
      isActive: true,
      isDeleted: false
    };
    
    if (companyId !== null) {
      where.companyId = companyId;
    }
    const user = await dbService.findOne(model.user, where);
    if (!user) {
      return {
        flag: true,
        msg: 'User does not exist!'
      };
    }

    if (!user.key2Fa) {
      return {
        flag: true,
        msg: '2FA secret not found. Please request QR code again!'
      };
    }

    // In development environment, skip OTP verification
    if (process.env.NODE_ENV === 'development') {
      // Enable 2FA for the user
      await dbService.update(
        model.user,
        { id: user.id },
        { is2FAenabled: true }
      );

      // Generate final tokens after 2FA setup
      const { accessToken, refreshToken } = generateTokenWithRemainingRefresh(user, JWT.SECRET, loginTimestamp);
      
      // Update user login status
      const getTokenVersion = getRandomNumber();
      await dbService.update(
        model.user,
        { id: user.id },
        { tokenVersion: getTokenVersion, loggedIn: true }
      );

      // Create userLogin record for successful 2FA setup
      const userLoginRecord = await dbService.createOne(model.userLogin, {
        user_id: user.id,
        user_type: user.userRole,
        isLoggedIn: true,
        latitude:  null, // Will be updated if available
        longitude: null, // Will be updated if available
        ipAddress: null, // Will be updated if available
        companyId: user.companyId
      });

      // Load user permissions
      const permissions = await loadUserPermissions(user.userRole);

      return {
        flag: false,
        msg: '2FA setup successful!',
        data: {
          accessToken,
          refreshToken,
          user: {
            id: user.id,
            name: user.name,
            mobileNo: user.mobileNo,
            userRole: user.userRole,
            outletName: user.outletName,
            companyId: user.companyId
          },
          userLogin: userLoginRecord,
          permissions
        }
      };
    }

    // Production environment - Verify OTP
    const verificationResult = verifyOTP(otp, user);
    if (verificationResult) {
      // Enable 2FA for the user
      await dbService.update(
        model.user,
        { id: user.id },
        { is2FAenabled: true }
      );

      // Generate final tokens after 2FA setup
      const { accessToken, refreshToken } = generateTokenWithRemainingRefresh(user, JWT.SECRET, loginTimestamp);
      
      // Update user login status
      const getTokenVersion = getRandomNumber();
      await dbService.update(
        model.user,
        { id: user.id },
        { tokenVersion: getTokenVersion, loggedIn: true }
      );

      // Create userLogin record for successful 2FA setup
      const userLoginRecord = await dbService.createOne(model.userLogin, {
        user_id: user.id,
        user_type: user.userRole,
        isLoggedIn: true,
        latitude: null, // Will be updated if available
        longitude: null, // Will be updated if available
        ipAddress: null, // Will be updated if available
        companyId: user.companyId
      });

      // Load user permissions
      const permissions = await loadUserPermissions(user.userRole);

      return {
        flag: false,
        msg: '2FA setup successful!',
        data: {
          accessToken,
          refreshToken,
          user: {
            id: user.id,
            name: user.name,
            mobileNo: user.mobileNo,
            userRole: user.userRole,
            outletName: user.outletName,
            companyId: user.companyId
          },
          userLogin: userLoginRecord,
          permissions
        }
      };
    } else {
      return {
        flag: true,
        msg: '2FA setup failed. Please try again.'
      };
    }
  } catch (error) {
    console.error('Error setting up 2FA:', error);
    throw new Error(error.message);
  }
};

const handleSecurity = async (dataToken, code, companyId, latitude, longitude, ipAddress, securityType = 'auto') => {
  try {
    // securityType can be 'mpin', '2fa', or 'auto' (auto-detect)
    if (!dataToken || !code) {
      return {
        flag: true,
        msg: 'token and security code are required!'
      };
    }

    // Validate and decrypt dataToken with expiration check
    const tokenValidation = await validateAndDecryptDataToken(dataToken);
    if (!tokenValidation.isValid) {
      return {
        flag: true,
        msg: tokenValidation.error
      };
    }

    const { userId } = tokenValidation;
    const loginTimestamp = tokenValidation.userDetail?.timestamp;

    const where = {
      id: userId,
      isActive: true,
      isDeleted: false
    };
    
    if (companyId !== null) {
      where.companyId = companyId;
    }
    const user = await dbService.findOne(model.user, where);
    if (!user) {
      return {
        flag: true,
        msg: 'Invalid credentials!'
      };
    }

    // Auto-detect security method: prefer 2FA if enabled, otherwise use MPIN
    let useMPIN = false;
    let use2FA = false;
    
    if (securityType === 'auto') {
      // If 2FA is explicitly enabled, use 2FA
      if (user.is2FAenabled && user.key2Fa) {
        use2FA = true;
      } else if (user.isMpinEnabled === true && user.secureKey) {
        // Use MPIN if it's enabled and secureKey exists
        useMPIN = true;
      } else if (user.isMpinSetup === true || (user.isMpinSetup === null && !user.secureKey)) {
        // If MPIN setup is required, return setup requirement
        return {
          flag: true,
          msg: 'MPIN is not set up. Please set up MPIN first.'
        };
      } else if (user.secureKey) {
        // Fallback: Default to MPIN if secureKey exists
        useMPIN = true;
      } else {
        // Neither is set, default to MPIN setup
        return {
          flag: true,
          msg: 'MPIN is not set up. Please set up MPIN first.'
        };
      }
    } else if (securityType === 'mpin') {
      useMPIN = true;
    } else if (securityType === '2fa') {
      use2FA = true;
    }

    // Handle MPIN verification
    if (useMPIN) {
      // Check if MPIN setup is required first
      if (user.isMpinSetup === true || (user.isMpinSetup === null && !user.secureKey)) {
        return {
          flag: true,
          msg: 'MPIN is not set up. Please set up MPIN first.'
        };
      }
      
      if (!user.secureKey || !user.isMpinEnabled) {
        return {
          flag: true,
          msg: 'MPIN is not set for this user!'
        };
      }

      // Validate MPIN format (4 digits)
      const mpinRegex = /^\d{4}$/;
      if (!mpinRegex.test(code)) {
        return {
          flag: true,
          msg: 'MPIN must be exactly 4 digits!'
        };
      }

      // Verify MPIN
      const isMPINValid = await user.isPinMatch(code);
      if (!isMPINValid) {
        return {
          flag: true,
          msg: 'Invalid MPIN. Please try again.'
        };
      }

      // Update user login status
      const getTokenVersion = getRandomNumber();
      await dbService.update(
        model.user,
        { id: user.id },
        { tokenVersion: getTokenVersion, loggedIn: true }
      );
      
      user.tokenVersion = getTokenVersion;
      
      // Generate final tokens after MPIN verification
      const { accessToken, refreshToken } = generateTokenWithRemainingRefresh(user, JWT.SECRET, loginTimestamp);

      // Create userLogin record
      const userLoginRecord = await dbService.createOne(model.userLogin, {
        user_id: user.id,
        user_type: user.userRole,
        isLoggedIn: true,
        latitude: latitude || null,
        longitude: longitude || null,
        ipAddress: ipAddress || null,
        companyId: user.companyId
      });

      // Load user permissions
      const permissions = await loadUserPermissions(user.userRole);

      return {
        flag: false,
        msg: 'MPIN verification successful!',
        data: {
          accessToken,
          refreshToken,
          user: {
            id: user.id,
            name: user.name,
            mobileNo: user.mobileNo,
            userRole: user.userRole,
            outletName: user.outletName,
            companyId: user.companyId
          },
          userLogin: userLoginRecord,
          permissions
        }
      };
    }

    // Handle 2FA verification
    if (use2FA) {
      // Check if 2FA should be verified or setup
      // If key2FA is not null AND is2FAenabled is true, then verify
      // Otherwise, setup 2FA
      const shouldVerify = user.key2Fa && user.is2FAenabled;

      if (shouldVerify) {
        // Verify existing 2FA
        if (process.env.NODE_ENV === 'development') {
        // Update user login status FIRST
        const getTokenVersion = getRandomNumber();
        await dbService.update(
          model.user,
          { id: user.id },
          { tokenVersion: getTokenVersion, loggedIn: true }
        );
        
        // Update user object with new tokenVersion
        user.tokenVersion = getTokenVersion;
        
        // Generate final tokens after 2FA verification
        const { accessToken, refreshToken } = generateTokenWithRemainingRefresh(user, JWT.SECRET, loginTimestamp);

        // Create userLogin record for successful 2FA verification
        const userLoginRecord = await dbService.createOne(model.userLogin, {
          user_id: user.id,
          user_type: user.userRole,
          isLoggedIn: true,
          latitude: latitude,
          longitude: longitude, 
          ipAddress: ipAddress, 
          companyId: user.companyId
        });

        // Load user permissions
        const permissions = await loadUserPermissions(user.userRole);

        return {
          flag: false,
          msg: '2FA verification successful!',
          data: {
            accessToken,
            refreshToken,
            user: {
              id: user.id,
              name: user.name,
              mobileNo: user.mobileNo,
              userRole: user.userRole,
              outletName: user.outletName,
              companyId: user.companyId
            },
            userLogin: userLoginRecord,
            permissions
          }
        };
      }

      // Production environment - Verify OTP
      const verificationResult = verifyOTP(code, user);
      if (verificationResult) {
        // Update user login status FIRST
        const getTokenVersion = getRandomNumber();
        await dbService.update(
          model.user,
          { id: user.id },
          { tokenVersion: getTokenVersion, loggedIn: true }
        );
        
        // Update user object with new tokenVersion
        user.tokenVersion = getTokenVersion;
        
        // Generate final tokens after 2FA verification
        const { accessToken, refreshToken } = generateTokenWithRemainingRefresh(user, JWT.SECRET, loginTimestamp);

        // Create userLogin record for successful 2FA verification
        const userLoginRecord = await dbService.createOne(model.userLogin, {
          user_id: user.id,
          user_type: user.userRole,
          isLoggedIn: true,
          latitude: latitude|| null, 
          longitude: longitude|| null, 
          ipAddress: ipAddress|| null,
          companyId: user.companyId
        });

        // Load user permissions
        const permissions = await loadUserPermissions(user.userRole);

        return {
          flag: false,
          msg: '2FA verification successful!',
          data: {
            accessToken,
            refreshToken,
            user: {
              id: user.id,
              name: user.name,
              mobileNo: user.mobileNo,
              userRole: user.userRole,
              outletName: user.outletName,
              companyId: user.companyId
            },
            userLogin: userLoginRecord,
            permissions
          }
        };
      } else {
        return {
          flag: true,
          msg: '2FA verification failed. Please try again.'
        };
      }
    } else {
      // Setup 2FA - Generate QR code if not exists
      if (!user.key2Fa) {
        const qrCodeData = await generateQRCodeURL(user);
        return {
          flag: false,
          msg: 'Please scan QR code and enter the 2FA code to complete setup.',
          data: {
            qrCode: qrCodeData,
            requiresSetup: true
          }
        };
      }

      // Verify OTP and enable 2FA
      if (process.env.NODE_ENV === 'development') {
        // Enable 2FA for the user
        await dbService.update(
          model.user,
          { id: user.id },
          { is2FAenabled: true }
        );

        // Generate final tokens after 2FA setup
        const { accessToken, refreshToken } = generateTokenWithRemainingRefresh(user, JWT.SECRET, loginTimestamp);
        
        // Update user login status
        const getTokenVersion = getRandomNumber();
        await dbService.update(
          model.user,
          { id: user.id },
          { tokenVersion: getTokenVersion, loggedIn: true }
        );

        // Create userLogin record for successful 2FA setup
        const userLoginRecord = await dbService.createOne(model.userLogin, {
          user_id: user.id,
          user_type: user.userRole,
          isLoggedIn: true,
          latitude: latitude|| null, 
          longitude: longitude|| null, 
          ipAddress: ipAddress|| null, 
          companyId: user.companyId
        });

        // Load user permissions
        const permissions = await loadUserPermissions(user.userRole);

        return {
          flag: false,
          msg: '2FA setup successful!',
          data: {
            accessToken,
            refreshToken,
            user: {
              id: user.id,
              name: user.name,
              mobileNo: user.mobileNo,
              userRole: user.userRole,
              outletName: user.outletName,
              companyId: user.companyId
            },
            userLogin: userLoginRecord,
            permissions
          }
        };
      }

      // Production environment - Verify OTP and setup
      const verificationResult = verifyOTP(code, user);
      if (verificationResult) {
        // Enable 2FA for the user
        await dbService.update(
          model.user,
          { id: user.id },
          { is2FAenabled: true }
        );

        // Generate final tokens after 2FA setup
        const { accessToken, refreshToken } = generateTokenWithRemainingRefresh(user, JWT.SECRET, loginTimestamp);
        
        // Update user login status
        const getTokenVersion = getRandomNumber();
        await dbService.update(
          model.user,
          { id: user.id },
          { tokenVersion: getTokenVersion, loggedIn: true }
        );

        // Create userLogin record for successful 2FA setup
        const userLoginRecord = await dbService.createOne(model.userLogin, {
          user_id: user.id,
          user_type: user.userRole,
          isLoggedIn: true,
          latitude: latitude  || null, 
          longitude: longitude|| null,
          ipAddress: ipAddress|| null,
          companyId: user.companyId
        });

        // Load user permissions
        const permissions = await loadUserPermissions(user.userRole);

        return {
          flag: false,
          msg: '2FA setup successful!',
          data: {
            accessToken,
            refreshToken,
            user: {
              id: user.id,
              name: user.name,
              mobileNo: user.mobileNo,
              userRole: user.userRole,
              outletName: user.outletName,
              companyId: user.companyId
            },
            userLogin: userLoginRecord,
            permissions
          }
        };
      } else {
        return {
          flag: true,
          msg: '2FA setup failed. Please try again.'
        };
      }
    }
    }
  } catch (error) {
    console.error('Error handling security:', error);
    throw new Error(error.message);
  }
};

const resendTemporaryPassword = async(mobileNo, companyId, req)=>{
  try {
    if (!mobileNo) {
      return {
        flag: true,
        msg: 'Mobile number is required!'
      };
    }
    if (!companyId) {
      return {
        flag: true,
        msg: 'Company ID is required!'
      };
    }
    const existingCompany = await dbService.findOne(model.company, { id: companyId });
    if (!existingCompany) {
      return {
        flag: true,
        msg: 'Company not found!'
      };
    }
    const user = await dbService.findOne(model.user, { mobileNo: mobileNo, companyId: companyId });
    if (!user) {
      return {
        flag: true,
        msg: 'User not found!'
      };
    }
    if (!user.isActive) {
      return {
        flag: true,
        msg: 'User is not active! Please contact support.'
      };
    }

    // Check if OTP attempts are locked
    if (user.isOtpLocked && user.isOtpLocked()) {
      return {
        flag: true,
        msg: 'Cannot send OTP. Account is locked due to multiple failed attempts. Please contact admin for assistance.'
      };
    }

    // Reset OTP attempts when generating new OTP
    if (user.resetOtpAttempts) {
      await user.resetOtpAttempts();
    }

    // Generate OTP
    const code = random.randomNumber(6);
    const hashedCode = await bcrypt.hash(code, 10);
    const expireOTP = moment().add(120, 'seconds').toISOString(); // 2 minutes
    
    await dbService.update(
      model.user,
      { id: user.id },
      { otpMobile: hashedCode + '~' + expireOTP }
    );

    // Send SMS
    const msg = `Dear user, your OTP for password reset is ${code}. Team Gmaxepay`;
    const smsResult = await amezesmsApi.sendSmsLogin(user.mobileNo, msg);

    // Generate token for OTP verification
    const ip = req?.headers['x-forwarded-for']?.split(',')[0] ||
              req?.connection?.remoteAddress ||
              req?.socket?.remoteAddress ||
              req?.ip || '';
    const userAgent = req?.headers['user-agent'] || '';

    const sensitiveData = {
      mobileNo: user.mobileNo,
      email: user.email,
      userRole: user.userRole,
      userType: user.userType,
      userId: user.id,
      companyId: user.companyId,
      ip: ip,
      timestamp: Date.now(),
      purpose: 'forgot_password_otp'
    };
    
    const encryptionKey = crypto.randomBytes(32);
    const encryptedData = doubleEncrypt(JSON.stringify(sensitiveData), encryptionKey);

    const dataToken = {
      data: encryptedData,
      key: encryptionKey.toString('hex')
    };

    if (smsResult) {
      return {
        flag: false,
        msg: 'OTP sent successfully!',
        data: {
          requiresOtpVerify: true,
          token: Buffer.from(JSON.stringify(dataToken)).toString('base64')
        }
      };
    } else {
      return {
        flag: true,
        msg: 'Error sending OTP!'
      };
    }
  }catch(error){
    console.error('Error resending forgot password OTP:', error);
    return {
      flag: true,
      msg: error.message
    };
  }
}

const verifyForgotPasswordOTP = async (token, otp, companyId) => {
  try {
    if (!token || !otp) {
      return {
        flag: true,
        msg: 'Token and OTP are required!'
      };
    }

    // Validate and decrypt dataToken with expiration check
    const tokenValidation = await validateAndDecryptDataToken(token);
    if (!tokenValidation.isValid) {
      return {
        flag: true,
        msg: tokenValidation.error
      };
    }

    const userDetail = tokenValidation.userDetail;
    const { mobileNo, userId, companyId: tokenCompanyId, purpose } = userDetail;

    // Verify this token is for forgot password
    if (purpose !== 'forgot_password_otp') {
      return {
        flag: true,
        msg: 'Invalid token purpose!'
      };
    }

    const where = {
      id: userId,
      isActive: true,
      isDeleted: false,
      mobileNo
    };
    
    if (companyId !== null) {
      where.companyId = companyId;
    }
    
    const user = await dbService.findOne(model.user, where);
    if (!user) {
      return {
        flag: true,
        msg: 'User does not exist!'
      };
    }
    
    // Check if account is locked
    if (user.isAccountLocked && user.isAccountLocked()) {
      return {
        flag: true,
        msg: 'Account is locked due to multiple failed attempts. Please contact admin for assistance.'
      };
    }

    // Verify OTP
    if (!user.otpMobile) {
      return {
        flag: true,
        msg: 'OTP is not set. Please request a new OTP.'
      };
    }

    const [hashedOtp, expireOTP] = user.otpMobile.split('~');
    const currentTime = moment().toISOString();
    
    if (moment(currentTime).isAfter(expireOTP)) {
      return {
        flag: true,
        msg: 'OTP has expired. Please request a new OTP.'
      };
    }
    
    if (otp.length !== 6) {
      return {
        flag: true,
        msg: 'Please provide a valid OTP!'
      };
    }

    const isOtpValid = await bcrypt.compare(otp, hashedOtp);
    if (!isOtpValid) {
      // Increment OTP attempts
      if (user.incrementOtpAttempts) {
        await user.incrementOtpAttempts();
      }
      
      const updatedUser = await dbService.findOne(model.user, { id: user.id });
      if (updatedUser.isOtpLocked && updatedUser.isOtpLocked()) {
        return {
          flag: true,
          msg: 'OTP verification locked due to multiple failed attempts. Please contact admin for assistance.'
        };
      }
      
      const remainingAttempts = 3 - (updatedUser.loginAttempts || 0);
      return {
        flag: true,
        msg: `OTP is incorrect. ${remainingAttempts} attempts remaining before OTP lock.`
      };
    }

    // Reset OTP attempts on successful verification
    if (user.resetOtpAttempts) {
      await user.resetOtpAttempts();
    }

    // Generate token for password reset
    const sensitiveData = {
      mobileNo: user.mobileNo,
      email: user.email,
      userRole: user.userRole,
      userType: user.userType,
      userId: user.id,
      companyId: user.companyId,
      timestamp: Date.now(),
      purpose: 'forgot_password_reset'
    };
    
    const encryptionKey = crypto.randomBytes(32);
    const encryptedData = doubleEncrypt(JSON.stringify(sensitiveData), encryptionKey);

    const dataToken = {
      data: encryptedData,
      key: encryptionKey.toString('hex')
    };

    return {
      flag: false,
      msg: 'OTP verified successfully!',
      data: {
        requiresPasswordReset: true,
        token: Buffer.from(JSON.stringify(dataToken)).toString('base64')
      }
    };
  } catch (error) {
    console.error('Error verifying forgot password OTP:', error);
    return {
      flag: true,
      msg: error.message
    };
  }
};
// Keep handle2FA for backward compatibility - it now uses handleSecurity internally
const handle2FA = async (dataToken, otp, companyId, latitude, longitude, ipAddress) => {
  return handleSecurity(dataToken, otp, companyId, latitude, longitude, ipAddress, '2fa');
};

module.exports = {
  loginUser,
  getLoggedInUser,
  refreshAccessToken,
  loginWithOtp,
  verifyMobileOTP,
  resendOTP,
  resendMobileOTP,
  generateToken,
  generateTempToken,
  logoutUser,
  getPermissions,
  qrGenerator,
  verifyQrUser,
  getNews,
  verify2FA,
  verifyMPIN,
  setupMPIN,
  resetPassword,
  setup2FA,
  handle2FA,
  handleSecurity,
  resendTemporaryPassword,
  verifyForgotPasswordOTP
};
