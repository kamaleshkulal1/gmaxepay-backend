const axios = require('axios');
const { generateKendraToken } = require('../utils/kendraEncryption');

const KENDRA_BASE_URL = process.env.KENDRA_BASE_URL || 'https://v2.punjikendra.in';
const KENDRA_API_KEY = process.env.KENDRA_API_KEY;

/**
 * Kendra AEPS Onboarding
 * POST https://v2.punjikendra.in/aeps/onboarding
 * @param {Object} data - Onboarding data
 * @returns {Promise<Object>} API response
 */
const kendraAepsOnboarding = async (data) => {
  try {
    const {
      merchantLoginId,
      merchantFirstName,
      merchantPhoneNumber,
      companyLegalName,
      emailId,
      merchantPinCode,
      merchantCityName,
      merchantDistrictName,
      merchantState,
      merchantAddress,
      userPan,
      aadhaarNumber,
      companyBankAccountNumber,
      bankIfscCode,
      companyBankName,
      bankAccountName,
      bankBranchName,
      c_code,
      shopAddress,
      shopCity,
      shopDistrict,
      shopState,
      shopPincode,
      latitude,
      longitude,
      maskedAadharImage,
      backgroundImageOfShop,
      merchantPanImage,
      iat = null,
      nbf = null,
      exp = null
    } = data;

    // Validate required fields
    if (!merchantLoginId) {
      throw new Error('merchantLoginId is required');
    }

    if (!KENDRA_API_KEY) {
      throw new Error('KENDRA_API_KEY is not set in environment variables');
    }

    // Generate JWT token
    const token = generateKendraToken(merchantLoginId, iat, nbf, exp);

    // Prepare request payload - only include defined values
    const payload = {
      merchantFirstName,
      merchantPhoneNumber,
      companyLegalName,
      emailId,
      merchantPinCode,
      merchantCityName,
      merchantDistrictName,
      merchantState,
      merchantAddress,
      userPan,
      aadhaarNumber,
      companyBankAccountNumber,
      bankIfscCode,
      companyBankName,
      bankAccountName,
      bankBranchName,
      c_code,
      shopAddress,
      shopCity,
      shopDistrict,
      shopState,
      shopPincode,
      latitude,
      longitude,
      merchantLoginId,
      Apikey: KENDRA_API_KEY,
      maskedAadharImage,
      backgroundImageOfShop,
      merchantPanImage
    };

    // Remove undefined/null values efficiently
    const cleanPayload = Object.fromEntries(
      Object.entries(payload).filter(([_, value]) => value !== undefined && value !== null)
    );

    // Make API request
    const response = await axios.post(
      `${KENDRA_BASE_URL}/aeps/onboarding`,
      cleanPayload,
      {
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 seconds timeout
      }
    );

    return response.data;
  } catch (error) {
    console.error('Kendra AEPS Onboarding error:', error?.response?.data || error.message);
    return {
      status: false,
      message: error?.response?.data?.message || error.message || 'Unable to reach Kendra API',
      error: error?.response?.data || error.message
    };
  }
};

module.exports = {
  kendraAepsOnboarding
};
