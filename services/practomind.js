const axios = require('axios');
const { generatePractomindToken } = require('../utils/aepsEncryption');

const PRACTOMIND_BASE_URL = process.env.PRACTOMIND_BASE_URL;
const PRACTOMIND_SECRET_KEY = process.env.PRACTOMIND_SECRET_KEY;
const PRACTOMIND_API_KEY = process.env.PRACTOMIND_API_KEY;

// Practomind AEPS Onboarding
const practomindAepsOnboarding = async (data , merchantLoginId) => {
  let payload = null;
  let token = null;
  
  try {
    if (!PRACTOMIND_SECRET_KEY || !PRACTOMIND_API_KEY) {
      throw new Error('Practomind API credentials not configured');
    }

    const tokenPayload = {
      merchantLoginId
    };
    
    token = generatePractomindToken(tokenPayload, PRACTOMIND_SECRET_KEY, 3600);
    
    payload = {
      ...data,
      Apikey: PRACTOMIND_API_KEY
    };
    const response = await axios.post(`${PRACTOMIND_BASE_URL}/aeps/onboarding`, payload, {
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      }
    });
    console.log("Response", response)
    return response.data;
  } catch (error) {
    console.error("Practomind AEPS Error", error)
    return  error.response.data
  }
};

// Practomind Send EKYC OTP
const practomindSendEkycOtp = async (data) => {
  try {
    if (!PRACTOMIND_SECRET_KEY || !PRACTOMIND_API_KEY) {
      throw new Error('Practomind API credentials not configured');
    }

    const tokenPayload = {
      merchantPhoneNumber: data.merchantPhoneNumber,
      panNumber: data.panNumber,
      aadharNumber: data.aadhaarNumber,
      latitude: data.latitude,
      longitude: data.longitude,
      merchantLoginId: data.merchantLoginId
    };
    const token = generatePractomindToken(tokenPayload, PRACTOMIND_SECRET_KEY, 3600);

    const payload = {
      Apikey: PRACTOMIND_API_KEY
    };
    console.log("Token", token)
    console.log("Payload", payload)

    const response = await axios.post(`${PRACTOMIND_BASE_URL}/aeps/ekycsendotp`, payload, {
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      }
    });
    console.log("Response", response)

    console.log('Practomind send EKYC OTP response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Practomind Send EKYC OTP error:', error.message);
    return error.response?.data || { status: false, message: 'Unable to reach Practomind send OTP API' };
  }
};

// Practomind Validate EKYC OTP
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
      otp: data.otp
    };

    const token = generatePractomindToken(tokenPayload, PRACTOMIND_SECRET_KEY, 3600);

    const payload = {
      Apikey: PRACTOMIND_API_KEY
    };

    console.log('Practomind validate EKYC OTP payload:', JSON.stringify(tokenPayload, null, 2));

    const response = await axios.post(`${PRACTOMIND_BASE_URL}/aeps/validateekycotp`, payload, {
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      }
    });

    console.log('Practomind validate EKYC OTP response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Practomind Validate EKYC OTP error:', error.message);
    return error.response?.data || { status: false, message: 'Unable to reach Practomind validate OTP API' };
  }
};

// Practomind Resend EKYC OTP
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
    };

    const token = generatePractomindToken(tokenPayload, PRACTOMIND_SECRET_KEY, 3600);

    const payload = {
      Apikey: PRACTOMIND_API_KEY
    };

    console.log('Practomind resend EKYC OTP payload:', JSON.stringify(tokenPayload, null, 2));

    const response = await axios.post(`${PRACTOMIND_BASE_URL}/aeps/resendekycotp`, payload, {
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      }
    });

    console.log('Practomind resend EKYC OTP response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Practomind Resend EKYC OTP error:', error.message);
    return error.response?.data || { status: false, message: 'Unable to reach Practomind resend OTP API' };
  }
};

// Practomind EKYC Submit
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
      aadharNumber: data.aadhaarNumber
    };

    const token = generatePractomindToken(tokenPayload, PRACTOMIND_SECRET_KEY, 3600);

    const payload = {
      Apikey: PRACTOMIND_API_KEY,
      txtPidData: data.txtPidData
    };

    console.log('Practomind EKYC submit payload:', JSON.stringify({ ...tokenPayload, txtPidData: 'REDACTED' }, null, 2));

    const response = await axios.post(`${PRACTOMIND_BASE_URL}/aeps/ekycsubmit`, payload, {
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      }
    });

    console.log('Practomind EKYC submit response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Practomind EKYC Submit error:', error.message);
    return error.response?.data || { status: false, message: 'Unable to reach Practomind EKYC submit API' };
  }
};

// Practomind Daily Authentication (2FA)
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
    };

    const token = generatePractomindToken(tokenPayload, PRACTOMIND_SECRET_KEY, 3600);

    const payload = {
      Apikey: PRACTOMIND_API_KEY,
      txtPidData: data.txtPidData
    };

    console.log('Practomind daily authentication payload:', JSON.stringify({ ...tokenPayload, txtPidData: 'REDACTED' }, null, 2));

    const response = await axios.post(`${PRACTOMIND_BASE_URL}/aeps/aepstwofactord`, payload, {
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      }
    });

    console.log('Practomind daily authentication response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Practomind Daily Authentication error:', error.message);
    return error.response?.data || { status: false, message: 'Unable to reach Practomind daily authentication API' };
  }
};

// Practomind Cash Withdrawal
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
      nationalBankIdenticationNumber: data.nationalBankIdurationNumber,
      transactionAmount: data.transactionAmount,
      transactionId: data.transactionId,
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    const token = generatePractomindToken(tokenPayload, PRACTOMIND_SECRET_KEY, 3600);

    const payload = {
      Apikey: PRACTOMIND_API_KEY,
      txtPidData: data.txtPidData
    };

    console.log('Practomind cash withdrawal payload:', JSON.stringify({ ...tokenPayload, txtPidData: 'REDACTED' }, null, 2));

    const response = await axios.post(`${PRACTOMIND_BASE_URL}/aeps/aepscashwithdrawl`, payload, {
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    console.log('Practomind cash withdrawal response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Practomind Cash Withdrawal error:', error.message);
    return error.response?.data || { status: false, message: 'Unable to reach Practomind cash withdrawal API' };
  }
};

// Practomind Balance Enquiry
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
      nationalBankIdurationNumber: data.nationalBankIdurationNumber,
      transactionId: data.transactionId,
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    const token = generatePractomindToken(tokenPayload, PRACTOMIND_SECRET_KEY, 3600);

    const payload = {
      Apikey: PRACTOMIND_API_KEY,
      txtPidData: data.txtPidData
    };

    console.log('Practomind balance enquiry payload:', JSON.stringify({ ...tokenPayload, txtPidData: 'REDACTED' }, null, 2));

    const response = await axios.post(`${PRACTOMIND_BASE_URL}/aeps/aepsbalanceenquiry`, payload, {
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    console.log('Practomind balance enquiry response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Practomind Balance Enquiry error:', error.message);
    return error.response?.data || { status: false, message: 'Unable to reach Practomind balance enquiry API' };
  }
};

// Practomind Mini Statement
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
      nationalBankIdurationNumber: data.nationalBankIdurationNumber,
      transactionId: data.transactionId,
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    const token = generatePractomindToken(tokenPayload, PRACTOMIND_SECRET_KEY, 3600);

    const payload = {
      Apikey: PRACTOMIND_API_KEY,
      txtPidData: data.txtPidData
    };

    console.log('Practomind mini statement payload:', JSON.stringify({ ...tokenPayload, txtPidData: 'REDACTED' }, null, 2));

    const response = await axios.post(`${PRACTOMIND_BASE_URL}/aeps/aepsministatement`, payload, {
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    console.log('Practomind mini statement response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Practomind Mini Statement error:', error.message);
    return error.response?.data || { status: false, message: 'Unable to reach Practomind mini statement API' };
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
