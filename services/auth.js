/**
 * auth.js
 * @description :: service functions used in authentication
 */
const { Op } = require('sequelize');
const model = require('../models/index');
const moment = require('moment');
const bcrypt = require('bcrypt');
const dbService = require('../utils/dbService');
const { JWT } = require('../constants/authConstant');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
let random = require('random-string-alphanumeric-generator');
const amezesmsApi = require('../services/amezesmsApi');
const crypto = require('crypto');

// Helper function to validate and decrypt dataToken with expiration check
const validateAndDecryptDataToken = (dataToken) => {
  try {
    if (!dataToken) {
      return {
        isValid: false,
        error: 'Data token is required!'
      };
    }

    // Decrypt dataToken to get user details
    const tokenData = JSON.parse(Buffer.from(dataToken, 'base64').toString());
    const decryptedData = decrypt(tokenData.data, Buffer.from(tokenData.key, 'hex'));
    
    if (!decryptedData) {
      return {
        isValid: false,
        error: 'Invalid data token!'
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
        error: 'Data token has expired! Please request a new one.'
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
      error: 'Invalid data token format!'
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

    const { accessToken, refreshToken } = generateToken(user, JWT.SECRET);
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
        msg: 'User does not exist!'
      };
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
        
        // Check if account is now locked after this attempt
        const updatedUser = await dbService.findOne(model.user, { id: user.id });
        if (updatedUser.isAccountLocked()) {
          return {
            flag: true,
            msg: 'Account locked due to multiple failed login attempts. Please contact admin for assistance.'
          };
        }
        
        const remainingAttempts = 3 - updatedUser.loginAttempts;
        return {
          flag: true,
          msg: `Incorrect Password. ${remainingAttempts} attempts remaining before account lock.`
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

    // In development environment, skip OTP verification and proceed directly to login
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

      // Check if 2FA is active for this user
      if (user.is2faEnabledActive) {
        // If 2FA is already enabled, just verify
        if (user.is2FAenabled) {
          return {
            flag: false,
            msg: 'Please enter your 2FA code',
            data: {
              requires2FA: true,
              token:Buffer.from(JSON.stringify(dataToken)).toString('base64')
            }
          };
        }
        
        // If 2FA is active but not set up yet, require setup
        if (!user.key2Fa) {
          const qrCodeData = await generateQRCodeURL(user);
          return {
            flag: false,
            msg: 'Please set up 2FA to secure your account.',
            data: {
              requiresSetup2FA: true,
              qrCode: qrCodeData,
              token: Buffer.from(JSON.stringify(dataToken)).toString('base64')
            }
          };
        }

        // If secret exists but 2FA not enabled, show QR again
        if (!user.is2FAenabled && user.key2Fa) {
          const qrCodeData = await generateQRCodeURL(user);
          return {
            flag: false,
            msg: 'Please set up 2FA to secure your account.',
            data: {
              requires2FA: true,
              qrCode: qrCodeData,
              token: Buffer.from(JSON.stringify(dataToken)).toString('base64')
            }
          };
        }
      }

      // If 2FA is not active, proceed with direct login
      // Update user login status FIRST
      const getTokenVersion = getRandomNumber();
      await dbService.update(
        model.user,
        { id: user.id },
        { tokenVersion: getTokenVersion, loggedIn: true }
      );
      
      // Update user object with new tokenVersion
      user.tokenVersion = getTokenVersion;
      
      // Generate tokens with correct tokenVersion
      const { accessToken, refreshToken } = generateToken(user, JWT.SECRET);

      return {
        flag: false,
        msg: 'Login successful!',
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
          }
        }
      };
    }

    // Production environment - Generate OTP for mobile verification
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
        msg: 'Data token and OTP are required!'
      };
    }

    // Validate and decrypt dataToken with expiration check
    const tokenValidation = validateAndDecryptDataToken(token);
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

        // Check if 2FA is active for this user
        if (user.is2faEnabledActive) {
          // If 2FA is already enabled, just verify
          if (user.is2FAenabled) {
            return {
              flag: false,
              msg: 'Please enter your 2FA code',
              data: {
                requires2FA: true,
                token: token
              }
            };
          }
          
          // If 2FA is active but not set up yet, require setup
          if (!user.key2Fa) {
            const qrCodeData = await generateQRCodeURL(user);
            return {
              flag: false,
              msg: 'Please set up 2FA to secure your account.',
              data: {
                requiresSetup2FA: true,
                qrCode: qrCodeData,
                token: token
              }
            };
          }

          // If secret exists but 2FA not enabled, show QR again
          if (!user.is2FAenabled && user.key2Fa) {
            const qrCodeData = await generateQRCodeURL(user);
            return {
              flag: false,
              msg: 'Please set up 2FA to secure your account.',
              data: {
                requiresSetup2FA: true,
                qrCode: qrCodeData,
                token: token
              }
            };
          }
        }

        // If 2FA is not active, proceed with direct login
        // Update user login status FIRST
        const getTokenVersion = getRandomNumber();
        await dbService.update(
          model.user,
          { id: user.id },
          { tokenVersion: getTokenVersion, loggedIn: true }
        );
        
        // Update user object with new tokenVersion
        user.tokenVersion = getTokenVersion;
        
        // Generate tokens with correct tokenVersion
        const { accessToken, refreshToken } = generateToken(user, JWT.SECRET);

        return {
          flag: false,
          msg: 'Login successful!',
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
            }
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
        msg: 'Data token is required!'
      };
    }

    // Validate and decrypt dataToken with expiration check
    const tokenValidation = validateAndDecryptDataToken(token);
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
    if (!token || !newPassword || !confirmPassword) {
      return {
        flag: true,
        msg: 'Data token, new password and confirm password are required!'
      };
    }

    if (newPassword !== confirmPassword) {
      return {
        flag: true,
        msg: 'New password and confirm password do not match!'
      };
    }

    // Validate and decrypt dataToken with expiration check
    const tokenValidation = validateAndDecryptDataToken(token);
    if (!tokenValidation.isValid) {
      return {
        flag: true,
        msg: tokenValidation.error
      };
    }

    const { userId } = tokenValidation;

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

const verify2FA = async (dataToken, otp, companyId) => {
  try {
    const {latitude, longitude, ipAddress} = req.body;
    if (!dataToken || !otp) {
      return {
        flag: true,
        msg: 'Data token and 2FA code are required!'
      };
    }

    // Validate and decrypt dataToken with expiration check
    const tokenValidation = validateAndDecryptDataToken(dataToken);
    if (!tokenValidation.isValid) {
      return {
        flag: true,
        msg: tokenValidation.error
      };
    }

    const { userId } = tokenValidation;

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
        const { accessToken, refreshToken } = generateToken(user, JWT.SECRET);

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
            userLogin: userLoginRecord
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
      const { accessToken, refreshToken } = generateToken(user, JWT.SECRET);

      // Create userLogin record for successful 2FA verification
      const userLoginRecord = await dbService.createOne(model.userLogin, {
        user_id: user.id,
        user_type: user.userRole,
        isLoggedIn: true,
        latitude: longitude|| null,
        longitude: longitude|| null,
        ipAddress: ipAddress|| null,
        companyId: user.companyId
      });

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
          }
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
        msg: 'Data token and 2FA code are required!'
      };
    }

    // Validate and decrypt dataToken with expiration check
    const tokenValidation = validateAndDecryptDataToken(dataToken);
    if (!tokenValidation.isValid) {
      return {
        flag: true,
        msg: tokenValidation.error
      };
    }

    const { userId } = tokenValidation;

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
      const { accessToken, refreshToken } = generateToken(user, JWT.SECRET);
      
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
          userLogin: userLoginRecord
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
      const { accessToken, refreshToken } = generateToken(user, JWT.SECRET);
      
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
          userLogin: userLoginRecord
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

const handle2FA = async (dataToken, otp, companyId, latitude, longitude, ipAddress) => {
  try {

    if (!dataToken || !otp) {
      return {
        flag: true,
        msg: 'Data token and 2FA code are required!'
      };
    }

    // Validate and decrypt dataToken with expiration check
    const tokenValidation = validateAndDecryptDataToken(dataToken);
    if (!tokenValidation.isValid) {
      return {
        flag: true,
        msg: tokenValidation.error
      };
    }

    const { userId } = tokenValidation;

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
        const { accessToken, refreshToken } = generateToken(user, JWT.SECRET);

        // Create userLogin record for successful 2FA verification
        const userLoginRecord = await dbService.createOne(model.userLogin, {
          user_id: user.id,
          user_type: user.userRole,
          isLoggedIn: true,
          latitude: latitude|| null, // Will be updated if available
          longitude: longitude|| null, // Will be updated if available
          ipAddress: ipAddress|| null, // Will be updated if available
          companyId: user.companyId
        });

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
            userLogin: userLoginRecord
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
        const { accessToken, refreshToken } = generateToken(user, JWT.SECRET);

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
            userLogin: userLoginRecord
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
        const { accessToken, refreshToken } = generateToken(user, JWT.SECRET);
        
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
            userLogin: userLoginRecord
          }
        };
      }

      // Production environment - Verify OTP and setup
      const verificationResult = verifyOTP(otp, user);
      if (verificationResult) {
        // Enable 2FA for the user
        await dbService.update(
          model.user,
          { id: user.id },
          { is2FAenabled: true }
        );

        // Generate final tokens after 2FA setup
        const { accessToken, refreshToken } = generateToken(user, JWT.SECRET);
        
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
            userLogin: userLoginRecord
          }
        };
      } else {
        return {
          flag: true,
          msg: '2FA setup failed. Please try again.'
        };
      }
    }
  } catch (error) {
    console.error('Error handling 2FA:', error);
    throw new Error(error.message);
  }
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
  resetPassword,
  setup2FA,
  handle2FA
};
