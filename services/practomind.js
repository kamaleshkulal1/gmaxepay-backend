const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = process.env.PUNJIKENDRA_BASE_URL
const CLIENT_SECRET = process.env.PUNJIKENDRA_CLIENT_SECRET || '';
const CLIENT_ID = process.env.PUNJIKENDRA_CLIENT_ID;
const AEPSPIPE = process.env.AEPSPIPE || '4';

let cachedToken = null;
let tokenExpiry = 0;

const getAccessToken = async (forceRefresh = false) => {
  try {
    if (!forceRefresh && cachedToken && Date.now() < tokenExpiry) {
      return cachedToken;
    }

    if (!CLIENT_ID || !CLIENT_SECRET || !BASE_URL) {
      throw new Error('Practomind / Punjikendra API credentials not configured');
    }

    const payload = {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET
    };

    const timestamp = Math.floor(Date.now() / 1000);
    const bodyStr = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', CLIENT_SECRET)
      .update(timestamp + '.' + bodyStr)
      .digest('hex');

    const config = {
      method: 'post',
      url: `${BASE_URL.replace(/\/+$/, '')}/api/partner/v1/auth/token`,
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': CLIENT_ID,
        'X-TIMESTAMP': timestamp.toString(),
        'X-SIGNATURE': signature
      },
      data: payload
    };

    console.log('[Practomind] Requesting access token...');
    const response = await axios.request(config);
    console.log('[Practomind] Token response:', JSON.stringify(response.data, null, 2));

    let token = null;
    if (response.data && response.data.status === 'success' && response.data.data?.token) {
      token = response.data.data.token;
    } else if (response.data && response.data.token) {
      token = response.data.token;
    }

    if (token) {
      cachedToken = token;
      // Cache token for 45 minutes
      tokenExpiry = Date.now() + 45 * 60 * 1000;
      return token;
    }

    throw new Error(response.data?.message || 'Token generation failed');
  } catch (error) {
    cachedToken = null;
    tokenExpiry = 0;
    console.error('[Practomind] Token Error:', error.response?.data || error.message);
    throw error;
  }
};

const getAuthHeaders = async (body = {}) => {
  const token = await getAccessToken();
  const timestamp = Math.floor(Date.now() / 1000);
  const bodyStr = typeof body === 'object' && body !== null && Object.keys(body).length > 0 ? JSON.stringify(body) : '';

  const signature = crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(timestamp + '.' + bodyStr)
    .digest('hex');

  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-API-KEY': CLIENT_ID,
    'X-TIMESTAMP': timestamp.toString(),
    'X-SIGNATURE': signature
  };
};

const getHeaders = async (payload = null, tokenPayload = {}) => {
  return await getAuthHeaders(payload || {});
};

const sanitizeLogPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;
  const copy = { ...payload };
  if (copy.pidData) copy.pidData = '[REDACTED_PID_DATA]';
  if (copy.txtPidData) copy.txtPidData = '[REDACTED_PID_DATA]';
  return copy;
};

const formatCoordinate = (coord) => {
  if (coord === null || coord === undefined || coord === '') return '';
  const num = parseFloat(coord);
  return isNaN(num) ? '' : num.toFixed(4);
};

const cleanAddress = (address, options = {}) => {
  if (!address || typeof address !== 'string') return '';
  let addr = address.trim();

  const toRemove = [
    'india',
    options.pincode ? String(options.pincode).trim().toLowerCase() : null,
    options.district ? String(options.district).trim().toLowerCase() : null,
    options.state ? String(options.state).trim().toLowerCase() : null,
    options.stateCode ? String(options.stateCode).trim().toLowerCase() : null
  ].filter(Boolean);

  const segments = addr.split(',').map(s => s.trim()).filter(Boolean);
  if (segments.length > 1) {
    const filteredSegments = segments.filter(seg => {
      const cleanSeg = seg.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (!cleanSeg) return false;
      return !toRemove.some(item => {
        const cleanItem = item.replace(/[^a-zA-Z0-9]/g, '');
        return cleanItem && (cleanSeg === cleanItem || cleanSeg === cleanItem.replace(/\s+/g, ''));
      });
    });
    if (filteredSegments.length > 0) {
      addr = filteredSegments.join(' ');
    }
  }

  // Remove any remaining 6-digit pincodes
  addr = addr.replace(/\b\d{6}\b/g, ' ');

  // Replace non-alphanumeric characters with spaces
  addr = addr.replace(/[^a-zA-Z0-9\s]/g, ' ');
  addr = addr.replace(/\s+/g, ' ').trim();

  // Strip trailing words if state, district, or pincode was appended at the end
  let changed = true;
  while (changed) {
    changed = false;
    const words = addr.split(' ');
    if (words.length > 1) {
      const lastWord = words[words.length - 1].toLowerCase();
      const lastTwoWords = words.length >= 2 ? words.slice(-2).join(' ').toLowerCase() : '';
      const lastThreeWords = words.length >= 3 ? words.slice(-3).join(' ').toLowerCase() : '';
      for (const item of toRemove) {
        if (!item) continue;
        const cleanItem = item.replace(/[^a-zA-Z0-9]/g, '');
        if (lastThreeWords && (lastThreeWords === item || lastThreeWords.replace(/[^a-z0-9]/g, '') === cleanItem)) {
          words.pop(); words.pop(); words.pop();
          addr = words.join(' ');
          changed = true;
          break;
        }
        if (lastTwoWords && (lastTwoWords === item || lastTwoWords.replace(/[^a-z0-9]/g, '') === cleanItem)) {
          words.pop(); words.pop();
          addr = words.join(' ');
          changed = true;
          break;
        }
        if (lastWord === item || lastWord.replace(/[^a-z0-9]/g, '') === cleanItem) {
          words.pop();
          addr = words.join(' ');
          changed = true;
          break;
        }
      }
    }
  }

  // Limit length to under 45 characters
  if (addr.length > 45) {
    addr = addr.substring(0, 45).trim();
  }

  // Fallback if empty
  if (!addr && address) {
    addr = address.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').substring(0, 45).trim();
  }

  return addr;
};

const formatPractomindName = (data = {}) => {
  let firstName = (data.firstName || data.merchantFirstName || '').trim();
  let middleName = (data.middleName || data.merchantMiddleName || '').trim();
  let lastName = (data.lastName || data.merchantLastName || '').trim();

  // Clean dots and special characters
  firstName = firstName.replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  middleName = middleName.replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  lastName = lastName.replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();

  const allTokens = `${firstName} ${middleName} ${lastName}`.trim().split(/\s+/).filter(Boolean);

  if (allTokens.length === 1) {
    firstName = allTokens[0];
    middleName = '';
    lastName = '';
  } else if (allTokens.length === 2) {
    if (allTokens[0].length === 1) {
      middleName = allTokens[0];
      firstName = allTokens[1];
      lastName = '';
    } else if (allTokens[1].length === 1) {
      firstName = allTokens[0];
      middleName = allTokens[1];
      lastName = '';
    } else {
      firstName = allTokens[0];
      middleName = '';
      lastName = allTokens[1];
    }
  } else if (allTokens.length >= 3) {
    const initialIndices = [];
    allTokens.forEach((token, idx) => {
      if (token.length === 1) initialIndices.push(idx);
    });

    if (initialIndices.length > 0) {
      const initials = initialIndices.map(idx => allTokens[idx]);
      middleName = initials.join('');
      const nonInitials = allTokens.filter((_, idx) => !initialIndices.includes(idx));
      if (nonInitials.length >= 2) {
        firstName = nonInitials[0];
        lastName = nonInitials[nonInitials.length - 1];
      } else if (nonInitials.length === 1) {
        firstName = nonInitials[0];
        lastName = '';
      } else {
        firstName = allTokens[0];
        lastName = allTokens[allTokens.length - 1];
      }
    } else {
      firstName = allTokens[0];
      middleName = allTokens[1];
      lastName = allTokens[allTokens.length - 1];
    }
  }

  // Individual name fields must contain alphabets only without spaces
  firstName = firstName.replace(/[^a-zA-Z]/g, '');
  middleName = middleName.replace(/[^a-zA-Z]/g, '');
  lastName = lastName.replace(/[^a-zA-Z]/g, '');

  return { firstName, middleName, lastName };
};

const practomindAepsOnboarding = async (data, merchantLoginId) => {
  try {
    const { firstName, middleName, lastName } = formatPractomindName(data);

    const stateVal = data.merchantState || data.stateCode || '';
    const districtVal = (data.merchantDistrict || data.merchantDistrictName || '').trim().toUpperCase();
    const pincodeVal = String(data.merchantPinCode || '');

    const shopStateVal = data.shopState || data.shopStateCode || stateVal;
    const shopDistrictVal = (data.shopDistrict || data.shopDistrictName || districtVal).trim().toUpperCase();
    const shopPincodeVal = String(data.shopPincode || pincodeVal);

    const stateNameVal = data.stateName || data.merchantStateName || data.state || '';
    const shopStateNameVal = data.shopStateName || data.shopState || stateNameVal;

    const cleanedMerchantAddress1 = cleanAddress(data.merchantAddress1 || data.merchantAddress || '', {
      district: districtVal,
      state: stateNameVal || stateVal,
      stateCode: stateVal,
      pincode: pincodeVal
    });

    const cleanedMerchantAddress2 = cleanAddress(data.merchantAddress2 || '', {
      district: districtVal,
      state: stateNameVal || stateVal,
      stateCode: stateVal,
      pincode: pincodeVal
    });

    const cleanedShopAddress = cleanAddress(data.shopAddress || data.merchantAddress1 || data.merchantAddress || '', {
      district: shopDistrictVal,
      state: shopStateNameVal || shopStateVal,
      stateCode: shopStateVal,
      pincode: shopPincodeVal
    });

    const formattedLat = formatCoordinate(data.lat || data.latitude || data.shopLat || '');
    const formattedLong = formatCoordinate(data.long || data.longitude || data.shopLong || '');

    let dob = data.dob || '';
    if (dob && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      dob = dob.split('-').reverse().join('-');
    }

    let gender = data.gender || 'M';
    if (gender) {
      gender = String(gender).trim().toUpperCase().startsWith('F') ? 'F' : 'M';
    }

    const payload = {
      merchantRefId: String(data.merchantRefId || merchantLoginId || data.merchantLoginId || data.merchantPhoneNumber || ''),
      firstName: firstName,
      lastName: lastName,
      middleName: middleName,
      dob: dob,
      gender: gender,
      merchantPhoneNumber: String(data.merchantPhoneNumber || data.mobileNo || ''),
      merchantPan: data.merchantPan || data.userPan || data.panNumber || '',
      aadhaarNumber: String(data.aadhaarNumber || data.adhaarNumber || ''),
      shopName: data.shopName || data.companyLegalName || '',
      merchantAddress1: cleanedMerchantAddress1,
      merchantAddress2: cleanedMerchantAddress2,
      merchantState: stateVal,
      stateCode: data.stateCode || stateVal,
      merchantDistrict: districtVal,
      merchantPinCode: pincodeVal,
      emailId: data.emailId || '',
      bankAccountNumber: String(data.bankAccountNumber || data.companyBankAccountNumber || ''),
      bankIfscCode: data.bankIfscCode || '',
      bankName: data.bankName || data.companyBankName || '',
      accountType: data.accountType || 'Savings account',
      shopAddress: cleanedShopAddress,
      shopDistrict: shopDistrictVal,
      shopState: shopStateVal,
      shopPincode: shopPincodeVal,
      shopLat: formattedLat,
      shopLong: formattedLong,
      lat: formattedLat,
      long: formattedLong,
      ipAddress: data.ipAddress || '127.0.0.1',
      pipe: AEPSPIPE
    };

    console.log('Practomind Merchant Register Payload:', JSON.stringify(payload, null, 2));

    const headers = await getHeaders(payload);
    const response = await axios.post(`${BASE_URL}/api/partner/v1/aeps/merchant/register`, payload, { headers });
    console.log("Practomind Response", JSON.stringify(response, null, 2));
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

    const headers = await getHeaders(payload);
    const response = await axios.post(`${BASE_URL}/api/partner/v1/aeps/kyc/otp`, payload, { headers });

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

    const headers = await getHeaders(payload);
    const response = await axios.post(`${BASE_URL}/api/partner/v1/aeps/kyc/otp/resend`, payload, { headers });

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

    const headers = await getHeaders(payload);
    const response = await axios.post(`${BASE_URL}/api/partner/v1/aeps/kyc/otp/verify`, payload, { headers });

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

    const headers = await getHeaders(payload);
    const response = await axios.post(`${BASE_URL}/api/partner/v1/aeps/kyc/biometric`, payload, { headers });

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

    const headers = await getHeaders(payload);
    const response = await axios.post(`${BASE_URL}/api/partner/v1/aeps/kyc/biometric/daily`, payload, { headers });

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

    const headers = await getHeaders(payload);
    const response = await axios.post(`${BASE_URL}/api/partner/v1/aeps/transaction`, payload, { headers });

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

    const headers = await getHeaders(payload);
    const response = await axios.post(`${BASE_URL}/api/partner/v1/aeps/transaction`, payload, { headers });

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

    const headers = await getHeaders(payload);
    const response = await axios.post(`${BASE_URL}/api/partner/v1/aeps/transaction`, payload, { headers });

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

    const headers = await getHeaders(payload);
    const response = await axios.post(`${BASE_URL}/api/partner/v1/aeps/transaction`, payload, { headers });

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

    const headers = await getHeaders(payload);
    const response = await axios.post(`${BASE_URL}/api/partner/v1/aeps/transaction/otp`, payload, { headers });
    return response.data;
  } catch (error) {
    console.error('Practomind Transaction OTP Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind transaction OTP API' };
  }
};

const getAepsStatus = async (merchantId) => {
  try {
    const headers = await getHeaders(null);
    const response = await axios.get(`${BASE_URL}/api/partner/v1/aeps/status`, {
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
    const headers = await getHeaders(null);
    const response = await axios.get(`${BASE_URL}/api/partner/v1/aeps/states`, { headers });
    return response.data;
  } catch (error) {
    console.error('Practomind Get States Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind states API' };
  }
};

const getDistricts = async (data) => {
  try {
    const payload = { stateCode: data.stateCode };
    const headers = await getHeaders(payload);
    const response = await axios.post(`${BASE_URL}/api/partner/v1/aeps/districts`, payload, { headers });
    console.log('Practomind Get Districts Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Practomind Get Districts Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind districts API' };
  }
};

const getBankIINs = async (data = {}) => {
  try {
    const headers = await getHeaders(data);
    const response = await axios.post(`${BASE_URL}/api/partner/v1/aeps/bank-iins`, data, { headers });
    return response.data;
  } catch (error) {
    console.error('Practomind Get Bank IINs Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind bank IIN API' };
  }
};


const getBanks = async () => {
  try {
    const headers = await getAuthHeaders();
    const config = {
      method: 'get',
      url: `${BASE_URL}/api/partner/v1/aeps/banks`,
      headers
    };
    console.log("Aeps Url", config);
    const response = await axios.request(config);
    console.log('response', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('[Practomind] getBanks Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'failure', message: error.message };
  }
};

const checkBalance = async () => {
  try {
    const headers = await getAuthHeaders();
    const config = {
      method: 'get',
      url: `${BASE_URL}/api/partner/v1/balance`,
      headers
    };

    console.log('[Practomind] Fetching balance from:', config.url);
    const response = await axios.request(config);
    console.log('balance response', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('[Practomind] checkBalance Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'failure', message: error.message };
  }
};

module.exports = {
  getAccessToken,
  getAuthHeaders,
  getHeaders,
  practomindAepsOnboarding,
  aepsOnboarding: practomindAepsOnboarding,
  practomindSendEkycOtp,
  sendOtp: practomindSendEkycOtp,
  practomindResendEkycOtp,
  resendOtp: practomindResendEkycOtp,
  practomindValidateEkycOtp,
  verifyOtp: practomindValidateEkycOtp,
  practomindEkycSubmit,
  onboardingBiometric: practomindEkycSubmit,
  practomindDailyAuthentication,
  dailyBiometric: practomindDailyAuthentication,
  practomindCashWithdrawal,
  practomindBalanceEnquiry,
  practomindMiniStatement,
  practomindAadhaarPay,
  transaction: practomindCashWithdrawal,
  sendTransactionOtp,
  getAepsStatus,
  aepsStatus: getAepsStatus,
  getStates,
  getDistricts,
  getBankIINs,
  getBanks,
  checkBalance,
  formatCoordinate,
  cleanAddress,
  formatPractomindName
};
