const axios = require('axios');
const crypto = require('crypto');
const { generatePractomindToken } = require('../utils/aepsEncryption');

const PRACTOMIND_BASE_URL = process.env.PRACTOMIND_BASE_URL;
const PRACTOMIND_SECRET_KEY = process.env.PRACTOMIND_SECRET_KEY;
const PRACTOMIND_API_KEY = process.env.PRACTOMIND_API_KEY;
const AEPSPIPE = process.env.AEPSPIPE || '4';

const formatDob = (dob) => {
  if (!dob) return '';
  if (/^\d{2}-\d{2}-\d{4}$/.test(dob)) return dob;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    const [y, m, d] = dob.split('-');
    return `${d}-${m}-${y}`;
  }
  try {
    const d = new Date(dob);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    }
  } catch (e) { }
  return String(dob);
};

const generateSignature = (payload, secret) => {
  if (!secret) return '';
  const payloadStr = payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : '';
  return crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
};

const getHeaders = (payload = null, tokenPayload = {}) => {
  if (!PRACTOMIND_SECRET_KEY || !PRACTOMIND_API_KEY) {
    throw new Error('Practomind API credentials not configured');
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = generateSignature(payload, PRACTOMIND_SECRET_KEY);

  const jwtClaims = {
    merchantId: payload?.merchantId || tokenPayload?.merchantId,
    merchantRefId: payload?.merchantRefId || tokenPayload?.merchantRefId,
    ...tokenPayload
  };
  const token = generatePractomindToken(jwtClaims, PRACTOMIND_SECRET_KEY, 3600);

  return {
    'Content-Type': 'application/json',
    'X-API-KEY': PRACTOMIND_API_KEY,
    'X-TIMESTAMP': timestamp,
    'X-SIGNATURE': signature,
    'Authorization': `Bearer ${token}`
  };
};

const sanitizeLogPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;
  const copy = { ...payload };
  if (copy.pidData) copy.pidData = '[REDACTED_PID_DATA]';
  if (copy.txtPidData) copy.txtPidData = '[REDACTED_PID_DATA]';
  return copy;
};

const practomindAepsOnboarding = async (data, merchantLoginId) => {
  try {
    let firstName = data.firstName || data.merchantFirstName || '';
    let lastName = data.lastName || data.merchantLastName || '';
    let middleName = data.middleName || data.merchantMiddleName || '';

    if (!lastName && firstName.includes(' ')) {
      const parts = firstName.trim().split(/\s+/);
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    }

    const payload = {
      merchantRefId: String(data.merchantRefId || merchantLoginId || data.merchantLoginId || data.merchantPhoneNumber || ''),
      firstName: firstName,
      lastName: lastName,
      middleName: middleName,
      dob: formatDob(data.dob),
      gender: data.gender || 'M',
      merchantPhoneNumber: String(data.merchantPhoneNumber || data.mobileNo || ''),
      merchantPan: data.merchantPan || data.userPan || data.panNumber || '',
      aadhaarNumber: String(data.aadhaarNumber || data.adhaarNumber || ''),
      shopName: data.shopName || data.companyLegalName || '',
      merchantAddress1: data.merchantAddress1 || data.merchantAddress || '',
      merchantAddress2: data.merchantAddress2 || '',
      merchantState: data.merchantState || '',
      merchantDistrict: data.merchantDistrict || data.merchantDistrictName || '',
      merchantPinCode: String(data.merchantPinCode || ''),
      emailId: data.emailId || '',
      bankAccountNumber: String(data.bankAccountNumber || data.companyBankAccountNumber || ''),
      bankIfscCode: data.bankIfscCode || '',
      bankName: data.bankName || data.companyBankName || '',
      accountType: data.accountType || 'Savings account',
      shopAddress: data.shopAddress || data.merchantAddress1 || data.merchantAddress || '',
      shopDistrict: data.shopDistrict || data.merchantDistrict || data.merchantDistrictName || '',
      shopState: data.shopState || data.merchantState || '',
      shopPincode: String(data.shopPincode || data.merchantPinCode || ''),
      shopLat: String(data.shopLat || data.latitude || ''),
      shopLong: String(data.shopLong || data.longitude || ''),
      lat: String(data.lat || data.latitude || ''),
      long: String(data.long || data.longitude || ''),
      ipAddress: data.ipAddress || '127.0.0.1',
      pipe: AEPSPIPE
    };

    console.log('Practomind Merchant Register Payload:', JSON.stringify(payload, null, 2));

    const headers = getHeaders(payload, { merchantLoginId: payload.merchantRefId });
    const response = await axios.post(`${PRACTOMIND_BASE_URL}/api/partner/v1/aeps/merchant/register`, payload, { headers });

    console.log('Practomind Merchant Register Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Practomind Merchant Register Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind register API' };
  }
};

const practomindSendEkycOtp = async (data) => {
  try {
    const payload = {
      merchantId: data.merchantId,
      merchantRefId: String(data.merchantRefId || data.merchantLoginId || `OTP_REF_${Date.now()}`),
      pipe: AEPSPIPE
    };

    console.log('Practomind Send KYC OTP Payload:', payload);

    const headers = getHeaders(payload, { merchantId: payload.merchantId });
    const response = await axios.post(`${PRACTOMIND_BASE_URL}/api/partner/v1/aeps/kyc/otp`, payload, { headers });

    console.log('Practomind Send KYC OTP Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Practomind Send KYC OTP Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind send OTP API' };
  }
};

const practomindResendEkycOtp = async (data) => {
  try {
    const payload = {
      merchantId: data.merchantId,
      merchantRefId: String(data.merchantRefId || data.merchantLoginId || `RESEND_REF_${Date.now()}`),
      pipe: AEPSPIPE
    };

    console.log('Practomind Resend KYC OTP Payload:', payload);

    const headers = getHeaders(payload, { merchantId: payload.merchantId });
    const response = await axios.post(`${PRACTOMIND_BASE_URL}/api/partner/v1/aeps/kyc/otp/resend`, payload, { headers });

    console.log('Practomind Resend KYC OTP Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Practomind Resend KYC OTP Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind resend OTP API' };
  }
};

const practomindValidateEkycOtp = async (data) => {
  try {
    const payload = {
      merchantId: data.merchantId,
      merchantRefId: String(data.merchantRefId || data.merchantLoginId || `VERIFY_REF_${Date.now()}`),
      otp: String(data.otp),
      pipe: AEPSPIPE
    };

    console.log('Practomind Verify KYC OTP Payload:', payload);

    const headers = getHeaders(payload, { merchantId: payload.merchantId });
    const response = await axios.post(`${PRACTOMIND_BASE_URL}/api/partner/v1/aeps/kyc/otp/verify`, payload, { headers });

    console.log('Practomind Verify KYC OTP Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Practomind Verify KYC OTP Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind verify OTP API' };
  }
};

const practomindEkycSubmit = async (data) => {
  try {
    const payload = {
      merchantId: data.merchantId,
      merchantRefId: String(data.merchantRefId || data.merchantLoginId || `BIO_REF_${Date.now()}`),
      aadhaarNumber: String(data.aadhaarNumber || data.adhaarNumber || ''),
      pidData: data.pidData || data.txtPidData,
      deviceType: data.deviceType || 'mantra',
      pipe: AEPSPIPE,
      lat: String(data.lat || data.latitude || ''),
      long: String(data.long || data.longitude || '')
    };

    console.log('Practomind Biometric KYC Payload:', sanitizeLogPayload(payload));

    const headers = getHeaders(payload, { merchantId: payload.merchantId });
    const response = await axios.post(`${PRACTOMIND_BASE_URL}/api/partner/v1/aeps/kyc/biometric`, payload, { headers });

    console.log('Practomind Biometric KYC Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Practomind Biometric KYC Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind biometric KYC API' };
  }
};

const practomindDailyAuthentication = async (data) => {
  try {
    const payload = {
      merchantId: data.merchantId,
      aadhaarNumber: String(data.aadhaarNumber || data.adhaarNumber || ''),
      pidData: data.pidData || data.txtPidData,
      deviceType: data.deviceType || 'mantra',
      pipe: AEPSPIPE,
      lat: String(data.lat || data.latitude || ''),
      long: String(data.long || data.longitude || '')
    };

    console.log('Practomind Daily 2FA Biometric Payload:', sanitizeLogPayload(payload));

    const headers = getHeaders(payload, { merchantId: payload.merchantId });
    const response = await axios.post(`${PRACTOMIND_BASE_URL}/api/partner/v1/aeps/kyc/biometric/daily`, payload, { headers });

    console.log('Practomind Daily 2FA Biometric Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Practomind Daily 2FA Biometric Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind daily biometric API' };
  }
};

const practomindCashWithdrawal = async (data) => {
  try {
    const payload = {
      merchantId: data.merchantId,
      service_type: 2,
      amount: Number(data.amount !== undefined && data.amount !== null ? data.amount : data.transactionAmount || 0),
      aadhaar: String(data.aadhaar || data.aadhaarNumber || data.adhaarNumber || ''),
      pidData: data.pidData || data.txtPidData,
      bank_iin: String(data.bank_iin || data.nationalBankIdenticationNumber || ''),
      cwAuthTxnId: data.cwAuthTxnId || '',
      deviceType: data.deviceType || 'mantra',
      pipe: AEPSPIPE,
      lat: String(data.lat || data.latitude || ''),
      long: String(data.long || data.longitude || ''),
      reference_id: String(data.reference_id || data.referenceId || data.transactionId || `AEPS_CW_${Date.now()}`)
    };

    console.log('Practomind Cash Withdrawal Payload:', sanitizeLogPayload(payload));

    const headers = getHeaders(payload, { merchantId: payload.merchantId });
    const response = await axios.post(`${PRACTOMIND_BASE_URL}/api/partner/v1/aeps/transaction`, payload, { headers });

    console.log('Practomind Cash Withdrawal Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Practomind Cash Withdrawal Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind cash withdrawal API' };
  }
};

const practomindBalanceEnquiry = async (data) => {
  try {
    const payload = {
      merchantId: data.merchantId,
      service_type: 3,
      aadhaar: String(data.aadhaar || data.aadhaarNumber || data.adhaarNumber || ''),
      pidData: data.pidData || data.txtPidData,
      bank_iin: String(data.bank_iin || data.nationalBankIdenticationNumber || ''),
      deviceType: data.deviceType || 'mantra',
      pipe: AEPSPIPE,
      lat: String(data.lat || data.latitude || ''),
      long: String(data.long || data.longitude || ''),
      reference_id: String(data.reference_id || data.referenceId || data.transactionId || `AEPS_BE_${Date.now()}`)
    };

    console.log('Practomind Balance Enquiry Payload:', sanitizeLogPayload(payload));

    const headers = getHeaders(payload, { merchantId: payload.merchantId });
    const response = await axios.post(`${PRACTOMIND_BASE_URL}/api/partner/v1/aeps/transaction`, payload, { headers });

    console.log('Practomind Balance Enquiry Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Practomind Balance Enquiry Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind balance enquiry API' };
  }
};

const practomindMiniStatement = async (data) => {
  try {
    const payload = {
      merchantId: data.merchantId,
      service_type: 4,
      aadhaar: String(data.aadhaar || data.aadhaarNumber || data.adhaarNumber || ''),
      pidData: data.pidData || data.txtPidData,
      bank_iin: String(data.bank_iin || data.nationalBankIdenticationNumber || ''),
      deviceType: data.deviceType || 'mantra',
      pipe: AEPSPIPE,
      lat: String(data.lat || data.latitude || ''),
      long: String(data.long || data.longitude || ''),
      reference_id: String(data.reference_id || data.referenceId || data.transactionId || `AEPS_MS_${Date.now()}`)
    };

    console.log('Practomind Mini Statement Payload:', sanitizeLogPayload(payload));

    const headers = getHeaders(payload, { merchantId: payload.merchantId });
    const response = await axios.post(`${PRACTOMIND_BASE_URL}/api/partner/v1/aeps/transaction`, payload, { headers });

    console.log('Practomind Mini Statement Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Practomind Mini Statement Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind mini statement API' };
  }
};

const practomindAadhaarPay = async (data) => {
  try {
    const payload = {
      merchantId: data.merchantId,
      service_type: 5,
      amount: Number(data.amount !== undefined && data.amount !== null ? data.amount : data.transactionAmount || 0),
      aadhaar: String(data.aadhaar || data.aadhaarNumber || data.adhaarNumber || ''),
      pidData: data.pidData || data.txtPidData,
      bank_iin: String(data.bank_iin || data.nationalBankIdenticationNumber || ''),
      cwAuthTxnId: data.cwAuthTxnId || '',
      deviceType: data.deviceType || 'mantra',
      pipe: AEPSPIPE,
      lat: String(data.lat || data.latitude || ''),
      long: String(data.long || data.longitude || ''),
      reference_id: String(data.reference_id || data.referenceId || data.transactionId || `AEPS_AP_${Date.now()}`)
    };

    console.log('Practomind Aadhaar Pay Payload:', sanitizeLogPayload(payload));

    const headers = getHeaders(payload, { merchantId: payload.merchantId });
    const response = await axios.post(`${PRACTOMIND_BASE_URL}/api/partner/v1/aeps/transaction`, payload, { headers });

    console.log('Practomind Aadhaar Pay Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Practomind Aadhaar Pay Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind aadhaar pay API' };
  }
};

const sendTransactionOtp = async (data) => {
  try {
    const payload = {
      merchantId: data.merchantId,
      transactionType: data.transactionType || 'CW',
      pipe: AEPSPIPE
    };

    const headers = getHeaders(payload, { merchantId: payload.merchantId });
    const response = await axios.post(`${PRACTOMIND_BASE_URL}/api/partner/v1/aeps/transaction/otp`, payload, { headers });
    return response.data;
  } catch (error) {
    console.error('Practomind Transaction OTP Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind transaction OTP API' };
  }
};

const getAepsStatus = async (merchantId) => {
  try {
    const headers = getHeaders(null, { merchantId });
    const response = await axios.get(`${PRACTOMIND_BASE_URL}/api/partner/v1/aeps/status`, {
      params: { merchantId },
      headers
    });
    return response.data;
  } catch (error) {
    console.error('Practomind AEPS Status Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind status API' };
  }
};

const getStates = async () => {
  try {
    const headers = getHeaders(null);
    const response = await axios.get(`${PRACTOMIND_BASE_URL}/api/partner/v1/aeps/states`, { headers });
    return response.data;
  } catch (error) {
    console.error('Practomind Get States Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind states API' };
  }
};

const getDistricts = async (stateCode) => {
  try {
    const payload = { stateCode };
    const headers = getHeaders(payload);
    const response = await axios.post(`${PRACTOMIND_BASE_URL}/api/partner/v1/aeps/districts`, payload, { headers });
    return response.data;
  } catch (error) {
    console.error('Practomind Get Districts Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind districts API' };
  }
};

const getBankIINs = async (data = {}) => {
  try {
    const headers = getHeaders(data);
    const response = await axios.post(`${PRACTOMIND_BASE_URL}/api/partner/v1/aeps/bank-iins`, data, { headers });
    return response.data;
  } catch (error) {
    console.error('Practomind Get Bank IINs Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind bank IIN API' };
  }
};

module.exports = {
  practomindAepsOnboarding,
  practomindSendEkycOtp,
  practomindResendEkycOtp,
  practomindValidateEkycOtp,
  practomindEkycSubmit,
  practomindDailyAuthentication,
  practomindCashWithdrawal,
  practomindBalanceEnquiry,
  practomindMiniStatement,
  practomindAadhaarPay,
  sendTransactionOtp,
  getAepsStatus,
  getStates,
  getDistricts,
  getBankIINs
};
