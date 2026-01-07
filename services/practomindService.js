/**
 * practomind.js
 * @description :: Service for Practomind AEPS API integration
 */

const axios = require('axios');
const { generatePractomindToken } = require('../utils/aepsEncryption');

// Environment variables
const PRACTOMIND_BASE_URL = process.env.PRACTOMIND_BASE_URL;
const PRACTOMIND_SECRET_KEY = process.env.PRACTOMIND_SECRET_KEY;
const PRACTOMIND_API_KEY = process.env.PRACTOMIND_API_KEY;

/**
 * Helper function to create axios instance with common config
 * @param {string} token - JWT token for authorization
 * @returns {Object} - Axios instance
 */
const createAxiosInstance = (token) => {
  return axios.create({
    baseURL: PRACTOMIND_BASE_URL,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000 
  });
};


const practomindAepsOnboarding = async (data) => {
  try {
    // Validate required fields
    if (!PRACTOMIND_SECRET_KEY || !PRACTOMIND_API_KEY) {
      throw new Error('Practomind API credentials not configured');
    }

    // Create JWT token with payload data
    const tokenPayload = {
      merchantLoginId: data.merchantLoginId,
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600 
    };

    const token = generatePractomindToken(tokenPayload, PRACTOMIND_SECRET_KEY, 3600);

    // Request body
    const requestBody = {
      merchantFirstName: data.merchantFirstName,
      merchantPhoneNumber: data.merchantPhoneNumber,
      companyLegalName: data.companyLegalName,
      emailId: data.emailId,
      merchantPinCode: data.merchantPinCode,
      merchantCityName: data.merchantCityName,
      merchantDistrictName: data.merchantDistrictName,
      merchantState: data.merchantState,
      merchantAddress: data.merchantAddress,
      userPan: data.userPan,
      aadhaarNumber: data.aadhaarNumber,
      companyBankAccountNumber: data.companyBankAccountNumber,
      bankIfscCode: data.bankIfscCode,
      companyBankName: data.companyBankName,
      bankAccountName: data.bankAccountName,
      bankBranchName: data.bankBranchName,
      c_code: data.c_code,
      shopAddress: data.shopAddress,
      shopCity: data.shopCity,
      shopDistrict: data.shopDistrict,
      shopState: data.shopState,
      shopPincode: data.shopPincode,
      latitude: data.latitude,
      longitude: data.longitude,
      merchantLoginId: data.merchantLoginId,
      Apikey: PRACTOMIND_API_KEY,
      maskedAadharImage: data.maskedAadharImage,
      backgroundImageOfShop: data.backgroundImageOfShop,
      merchantPanImage: data.merchantPanImage
    };

    const axiosInstance = createAxiosInstance(token);
    const response = await axiosInstance.post('/aeps/onboarding', requestBody);
    
    return response.data;
  } catch (error) {
    console.error('Practomind AEPS Onboarding error:', error.message);
    if (error.response && error.response.data) {
      return error.response.data;
    }
    throw error;
  }
};

/**
 * b. Send OTP for EKYC
 * @param {Object} data - OTP request data
 * @returns {Promise<Object>} - API response with KeyID and TxnId
 */
const practomindSendEkycOtp = async (data) => {
  try {
    if (!PRACTOMIND_SECRET_KEY || !PRACTOMIND_API_KEY) {
      throw new Error('Practomind API credentials not configured');
    }

    const tokenPayload = {
      merchantPhoneNumber: data.merchantPhoneNumber,
      panNumber: data.panNumber,
      aadhaarNumber: data.aadhaarNumber,
      latitude: data.latitude,
      longitude: data.longitude,
      merchantLoginId: data.merchantLoginId,
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    const token = generatePractomindToken(tokenPayload, PRACTOMIND_SECRET_KEY, 3600);

    const requestBody = {
      Apikey: PRACTOMIND_API_KEY
    };

    const axiosInstance = createAxiosInstance(token);
    const response = await axiosInstance.post('/aeps/ekycsendotp', requestBody);
    
    return response.data;
  } catch (error) {
    console.error('Practomind Send EKYC OTP error:', error.message);
    if (error.response && error.response.data) {
      return error.response.data;
    }
    throw error;
  }
};

/**
 * c. Validate OTP for EKYC
 * @param {Object} data - OTP validation data
 * @returns {Promise<Object>} - API response
 */
const practomindValidateEkycOtp = async (data) => {
  try {
    if (!PRACTOMIND_SECRET_KEY || !PRACTOMIND_API_KEY) {
      throw new Error('Practomind API credentials not configured');
    }

    const tokenPayload = {
      merchantPhoneNumber: data.merchantPhoneNumber,
      merchantLoginId: data.merchantLoginId,
      KeyID: data.KeyID,
      TxnId: data.TxnId,
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    const token = generatePractomindToken(tokenPayload, PRACTOMIND_SECRET_KEY, 3600);

    const requestBody = {
      Apikey: PRACTOMIND_API_KEY
    };

    const axiosInstance = createAxiosInstance(token);
    const response = await axiosInstance.post('/aeps/validateekycotp', requestBody);
    
    return response.data;
  } catch (error) {
    console.error('Practomind Validate EKYC OTP error:', error.message);
    if (error.response && error.response.data) {
      return error.response.data;
    }
    throw error;
  }
};

/**
 * d. Resend OTP for EKYC
 * @param {Object} data - OTP resend data
 * @returns {Promise<Object>} - API response
 */
const practomindResendEkycOtp = async (data) => {
  try {
    if (!PRACTOMIND_SECRET_KEY || !PRACTOMIND_API_KEY) {
      throw new Error('Practomind API credentials not configured');
    }

    const tokenPayload = {
      merchantPhoneNumber: data.merchantPhoneNumber,
      merchantLoginId: data.merchantLoginId,
      KeyID: data.KeyID,
      TxnId: data.TxnId,
      latitude: data.latitude,
      longitude: data.longitude,
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    const token = generatePractomindToken(tokenPayload, PRACTOMIND_SECRET_KEY, 3600);

    const requestBody = {
      Apikey: PRACTOMIND_API_KEY
    };

    const axiosInstance = createAxiosInstance(token);
    const response = await axiosInstance.post('/aeps/resendekycotp', requestBody);
    
    return response.data;
  } catch (error) {
    console.error('Practomind Resend EKYC OTP error:', error.message);
    if (error.response && error.response.data) {
      return error.response.data;
    }
    throw error;
  }
};

/**
 * e. EKYC Submit (Biometric verification)
 * @param {Object} data - EKYC submit data
 * @returns {Promise<Object>} - API response
 */
const practomindEkycSubmit = async (data) => {
  try {
    if (!PRACTOMIND_SECRET_KEY || !PRACTOMIND_API_KEY) {
      throw new Error('Practomind API credentials not configured');
    }

    const tokenPayload = {
      merchantPhoneNumber: data.merchantPhoneNumber,
      merchantLoginId: data.merchantLoginId,
      KeyID: data.KeyID,
      TxnId: data.TxnId,
      userPan: data.userPan,
      aadhaarNumber: data.aadhaarNumber,
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    const token = generatePractomindToken(tokenPayload, PRACTOMIND_SECRET_KEY, 3600);

    const requestBody = {
      Apikey: PRACTOMIND_API_KEY,
      txtPidData: data.txtPidData // Base64 encoded fingerprint data
    };

    const axiosInstance = createAxiosInstance(token);
    const response = await axiosInstance.post('/aeps/ekycsubmit', requestBody);
    
    return response.data;
  } catch (error) {
    console.error('Practomind EKYC Submit error:', error.message);
    if (error.response && error.response.data) {
      return error.response.data;
    }
    throw error;
  }
};

/**
 * f. Daily Authentication (2FA)
 * @param {Object} data - Daily authentication data
 * @returns {Promise<Object>} - API response
 */
const practomindDailyAuthentication = async (data) => {
  try {
    if (!PRACTOMIND_SECRET_KEY || !PRACTOMIND_API_KEY) {
      throw new Error('Practomind API credentials not configured');
    }

    const tokenPayload = {
      mobileNumber: data.mobileNumber,
      merchantLoginId: data.merchantLoginId,
      latitude: data.latitude,
      longitude: data.longitude,
      userPan: data.userPan,
      aadhaarNumber: data.aadhaarNumber,
      nationalBankIdenticationNumber: data.nationalBankIdenticationNumber,
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    const token = generatePractomindToken(tokenPayload, PRACTOMIND_SECRET_KEY, 3600);

    const requestBody = {
      Apikey: PRACTOMIND_API_KEY,
      txtPidData: data.txtPidData // Base64 encoded merchant fingerprint data
    };

    const axiosInstance = createAxiosInstance(token);
    const response = await axiosInstance.post('/aeps/aepstwofactord', requestBody);
    
    return response.data;
  } catch (error) {
    console.error('Practomind Daily Authentication error:', error.message);
    if (error.response && error.response.data) {
      return error.response.data;
    }
    throw error;
  }
};

/**
 * g. Cash Withdrawal
 * @param {Object} data - Cash withdrawal data
 * @returns {Promise<Object>} - API response
 */
const practomindCashWithdrawal = async (data) => {
  try {
    if (!PRACTOMIND_SECRET_KEY || !PRACTOMIND_API_KEY) {
      throw new Error('Practomind API credentials not configured');
    }

    const tokenPayload = {
      mobileNumber: data.mobileNumber,
      merchantLoginId: data.merchantLoginId,
      latitude: data.latitude,
      longitude: data.longitude,
      adhaarNumber: data.adhaarNumber,
      nationalBankIdenticationNumber: data.nationalBankIdenticationNumber,
      transactionAmount: data.transactionAmount,
      transactionId: data.transactionId,
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    const token = generatePractomindToken(tokenPayload, PRACTOMIND_SECRET_KEY, 3600);

    const requestBody = {
      Apikey: PRACTOMIND_API_KEY,
      txtPidData: data.txtPidData // Base64 encoded customer fingerprint data
    };

    const axiosInstance = createAxiosInstance(token);
    const response = await axiosInstance.post('/aeps/aepscashwithdrawl', requestBody);
    
    return response.data;
  } catch (error) {
    console.error('Practomind Cash Withdrawal error:', error.message);
    if (error.response && error.response.data) {
      return error.response.data;
    }
    throw error;
  }
};

/**
 * h. Balance Enquiry
 * @param {Object} data - Balance enquiry data
 * @returns {Promise<Object>} - API response
 */
const practomindBalanceEnquiry = async (data) => {
  try {
    if (!PRACTOMIND_SECRET_KEY || !PRACTOMIND_API_KEY) {
      throw new Error('Practomind API credentials not configured');
    }

    const tokenPayload = {
      mobileNumber: data.mobileNumber,
      merchantLoginId: data.merchantLoginId,
      latitude: data.latitude,
      longitude: data.longitude,
      adhaarNumber: data.adhaarNumber,
      nationalBankIdenticationNumber: data.nationalBankIdenticationNumber,
      transactionId: data.transactionId,
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    const token = generatePractomindToken(tokenPayload, PRACTOMIND_SECRET_KEY, 3600);

    const requestBody = {
      Apikey: PRACTOMIND_API_KEY,
      txtPidData: data.txtPidData // Base64 encoded customer fingerprint data
    };

    const axiosInstance = createAxiosInstance(token);
    const response = await axiosInstance.post('/aeps/aepsbalanceenquiry', requestBody);
    
    return response.data;
  } catch (error) {
    console.error('Practomind Balance Enquiry error:', error.message);
    if (error.response && error.response.data) {
      return error.response.data;
    }
    throw error;
  }
};

/**
 * i. Mini Statement
 * @param {Object} data - Mini statement data
 * @returns {Promise<Object>} - API response
 */
const practomindMiniStatement = async (data) => {
  try {
    if (!PRACTOMIND_SECRET_KEY || !PRACTOMIND_API_KEY) {
      throw new Error('Practomind API credentials not configured');
    }

    const tokenPayload = {
      mobileNumber: data.mobileNumber,
      merchantLoginId: data.merchantLoginId,
      latitude: data.latitude,
      longitude: data.longitude,
      adhaarNumber: data.adhaarNumber,
      nationalBankIdenticationNumber: data.nationalBankIdenticationNumber,
      transactionId: data.transactionId,
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    const token = generatePractomindToken(tokenPayload, PRACTOMIND_SECRET_KEY, 3600);

    const requestBody = {
      Apikey: PRACTOMIND_API_KEY,
      txtPidData: data.txtPidData // Base64 encoded customer fingerprint data
    };

    const axiosInstance = createAxiosInstance(token);
    const response = await axiosInstance.post('/aeps/aepsministatement', requestBody);
    
    return response.data;
  } catch (error) {
    console.error('Practomind Mini Statement error:', error.message);
    if (error.response && error.response.data) {
      return error.response.data;
    }
    throw error;
  }
};

module.exports = {
  practomindAepsOnboarding,
  practomindSendEkycOtp,
  practomindValidateEkycOtp,
  practomindResendEkycOtp,
  practomindEkycSubmit,
  practomindDailyAuthentication,
  practomindCashWithdrawal,
  practomindBalanceEnquiry,
  practomindMiniStatement
};

