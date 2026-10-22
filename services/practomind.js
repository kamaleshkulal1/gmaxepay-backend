const axios = require('axios');
const crypto = require('crypto');

const getClientId = () => {
  return (
    (process.env.PRACTOMIND_API_KEY || '').trim() ||
    (process.env.PUNJIKENDRA_CLIENT_ID || '').trim() ||
    ''
  );
};

const getClientSecret = () => {
  return (
    (process.env.PRACTOMIND_SECRET_KEY || '').trim() ||
    (process.env.PUNJIKENDRA_CLIENT_SECRET || '').trim() ||
    ''
  );
};

const getBaseUrl = () => {
  const url =
    (process.env.PRACTOMIND_BASE_URL || '').trim() ||
    (process.env.PUNJIKENDRA_BASE_URL || '').trim() ||
    'https://app.punjikendra.in';
  return url.replace(/\/+$/, '');
};

const getAepsPipe = () => (process.env.AEPSPIPE || '2').trim();

const buildUrl = (endpointPath) => {
  if (typeof endpointPath === 'string' && (endpointPath.startsWith('http://') || endpointPath.startsWith('https://'))) {
    return endpointPath;
  }
  const base = getBaseUrl();
  const cleanPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  return `${base}${cleanPath}`;
};

const getAuthHeaders = (body = null, method = 'POST') => {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  const timestamp = Math.floor(Date.now() / 1000);

  let rawBody = '';
  if (body !== null && body !== undefined) {
    if (typeof body === 'string') {
      rawBody = body;
    } else if (typeof body === 'object' && Object.keys(body).length > 0) {
      rawBody = JSON.stringify(body);
    }
  }

  const payloadToSign = rawBody ? `${timestamp}.${rawBody}` : timestamp.toString();

  const signature = crypto
    .createHmac('sha256', clientSecret || '')
    .update(payloadToSign)
    .digest('hex');

  const headers = {
    'X-API-KEY': clientId,
    'X-TIMESTAMP': timestamp.toString(),
    'X-SIGNATURE': signature,
    'X-Domain': process.env.PUNJIKENDRA_DOMAIN || 'https://bharat.gmaxepay.in'
  };

  if (rawBody || String(method).toUpperCase() === 'POST') {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
};

const getHeaders = async (payload = null, tokenPayload = {}) => {
  return getAuthHeaders(payload, 'POST');
};

const getAccessToken = async () => {
  console.warn('[Practomind] getAccessToken called, but Bearer tokens are disabled. Requests use Stateless HMAC-SHA256 headers directly.');
  return null;
};

const makeGetRequest = async (endpointPath, logLabel = 'GET', params = null) => {
  const url = buildUrl(endpointPath);
  const clientId = getClientId();
  const clientSecret = getClientSecret();

  console.log(`[Practomind] ===== ${logLabel} (GET REQUEST) =====`);
  console.log(`[Practomind] URL: ${url}`);
  if (params) {
    console.log(`[Practomind] Query Params:`, JSON.stringify(params, null, 2));
  }

  const attempts = [
    { payloadFn: (ts) => ts.toString(), hasContentType: false, desc: 'timestamp without dot (no Content-Type)' },
    { payloadFn: (ts) => `${ts}.`, hasContentType: false, desc: 'timestamp with dot (no Content-Type)' },
    { payloadFn: (ts) => ts.toString(), hasContentType: true, desc: 'timestamp without dot (with Content-Type)' },
    { payloadFn: (ts) => `${ts}.`, hasContentType: true, desc: 'timestamp with dot (with Content-Type)' }
  ];

  let lastError = null;
  let lastData = null;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    const timestamp = Math.floor(Date.now() / 1000);
    const payloadToSign = attempt.payloadFn(timestamp);

    const signature = crypto
      .createHmac('sha256', clientSecret || '')
      .update(payloadToSign)
      .digest('hex');

    const headers = {
      'X-API-KEY': clientId,
      'X-TIMESTAMP': timestamp.toString(),
      'X-SIGNATURE': signature,
      'X-Domain': process.env.PUNJIKENDRA_DOMAIN || 'https://bharat.gmaxepay.in'
    };
    if (attempt.hasContentType) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      console.log(`[Practomind] Attempt ${i + 1}/${attempts.length}: ${attempt.desc}`);
      console.log(`[Practomind] Request Headers:`, JSON.stringify(headers, null, 2));
      const response = await axios.get(url, { headers, ...(params ? { params } : {}) });

      const resStatus = (response.data?.status || '').toLowerCase();
      const resMsg = (response.data?.message || '').toLowerCase();
      if (resStatus === 'error' && (resMsg.includes('signature') || resMsg.includes('hmac'))) {
        console.warn(`[Practomind] Attempt ${i + 1} rejected with signature error: "${response.data.message}". Trying fallback HMAC...`);
        lastData = response.data;
        continue;
      }

      console.log(`[Practomind] ===== ${logLabel} SUCCESS (${response.status}) =====`);
      console.log(`[Practomind] Response Data:`, JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (err) {
      const errData = err.response?.data;
      const errMsg = (errData?.message || err.message || '').toLowerCase();
      const isSigError = errMsg.includes('signature') || errMsg.includes('hmac') || err.response?.status === 401;

      if (isSigError && i < attempts.length - 1) {
        console.warn(`[Practomind] Attempt ${i + 1} failed with signature error (${errData?.message || err.message}). Trying fallback HMAC...`);
        lastError = err;
        lastData = errData;
        continue;
      }

      console.error(`[Practomind] ===== ${logLabel} ERROR =====`);
      console.error(`[Practomind] URL: ${url}`);
      console.error(`[Practomind] Error Message: ${err.message}`);
      if (err.response) {
        console.error(`[Practomind] Response Status: ${err.response.status}`);
        console.error(`[Practomind] Response Body:`, JSON.stringify(err.response.data, null, 2));
      }
      return errData || { status: 'failure', message: err.message, code: err.code };
    }
  }

  if (lastData) {
    return lastData;
  }
  return lastError?.response?.data || { status: 'failure', message: lastError?.message || 'HMAC computation failed across all attempts' };
};

const sanitizeLogPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;
  const copy = { ...payload };
  if (copy.pidData) copy.pidData = '[REDACTED_PID_DATA]';
  if (copy.txtPidData) copy.txtPidData = '[REDACTED_PID_DATA]';
  return copy;
};

const makePostRequest = async (endpointPath, payload, logLabel = 'POST') => {
  const url = buildUrl(endpointPath);
  const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const headers = getAuthHeaders(rawBody, 'POST');
  const config = {
    method: 'post',
    url,
    headers,
    data: rawBody
  };

  console.log(`[Practomind] ===== ${logLabel} (POST REQUEST) =====`);
  console.log(`[Practomind] URL: ${url}`);
  console.log(`[Practomind] Request Headers:`, JSON.stringify(headers, null, 2));
  console.log(
    `[Practomind] Request Payload:`,
    typeof payload === 'string'
      ? payload
      : JSON.stringify(sanitizeLogPayload(payload), null, 2)
  );

  try {
    const response = await axios.request(config);
    console.log(`[Practomind] ===== ${logLabel} SUCCESS (${response.status}) =====`);
    console.log(`[Practomind] Response Data:`, JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error(`[Practomind] ===== ${logLabel} ERROR =====`);
    console.error(`[Practomind] URL: ${url}`);
    console.error(`[Practomind] Error Message: ${error.message}`);
    console.error(`[Practomind] Error Code: ${error.code}`);
    if (error.response) {
      console.error(`[Practomind] Response Status: ${error.response.status}`);
      console.error(`[Practomind] Response Body:`, JSON.stringify(error.response.data, null, 2));
    }
    return error.response?.data || { status: 'failure', message: error.message };
  }
};

const practomindAepsOnboarding = async (data, merchantLoginId) => {
  try {
    const payload = {
      merchantRefId: String(data.merchantRefId || data.transactionId || merchantLoginId || data.merchantLoginId || '').slice(0, 20),
      firstName: data.firstName || data.merchantFirstName || '',
      lastName: data.lastName || data.merchantLastName || '',
      middleName: data.middleName || data.merchantMiddleName || '',
      dob: data.dob || '',
      fatherName: data?.fatherName || '',
      motherName: data?.motherName || '',
      maritalStatus: data.maritalStatus || '',
      gender: data.gender || 'M',
      mcc: data.mcc || data.c_code || '5411',
      merchantPhoneNumber: String(data.merchantPhoneNumber || data.mobileNo || ''),
      merchantPan: data.merchantPan || data.userPan || data.panNumber || '',
      aadhaarNumber: String(data.aadhaarNumber || data.adhaarNumber || ''),
      shopName: data.shopName || data.companyLegalName || '',
      merchantAddress1: data.merchantAddress1 || data.merchantAddress || '',
      merchantAddress2: data.merchantAddress2 || '',
      merchantState: data.merchantState || data.stateCode || '',
      stateCode: data.stateCode || data.merchantState || '',
      merchantDistrict: data.merchantDistrict || data.merchantDistrictCode || '',
      merchantPinCode: String(data.merchantPinCode || ''),
      emailId: data.emailId || '',
      bankAccountNumber: String(data.bankAccountNumber || data.companyBankAccountNumber || ''),
      bankIfscCode: data.bankIfscCode || '',
      bankName: data.bankCode || data.companyBankName || data.bankName || '',
      accountType: data.accountType || 'Savings account',
      shopAddress: data.shopAddress || data.merchantAddress1 || '',
      shopDistrict: data.shopDistrict || data.shopDistrictCode || data.merchantDistrict || '',
      shopState: data.shopState || data.shopStateCode || data.merchantState || '',
      shopPincode: String(data.shopPincode || data.merchantPinCode || ''),
      shopLat: data.shopLat || data.lat || data.latitude || '',
      shopLong: data.shopLong || data.long || data.longitude || '',
      lat: data.lat || data.shopLat || data.latitude || '',
      long: data.long || data.shopLong || data.longitude || '',
      ipAddress: data.ipAddress || '127.0.0.1',
      pipe: data.pipe || getAepsPipe()
    };

    return await makePostRequest('/api/partner/v1/aeps/merchant/register', payload, 'aepsOnboarding');
  } catch (error) {
    console.error('Practomind Merchant Register Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind register API' };
  }
};

const practomindSendEkycOtp = async (data) => {
  try {
    const payload = {
      merchantId: data.merchantId || data.merchantLoginId,
      merchantRefId: String(data.merchantRefId || data.merchantLoginId || `OTP_REF_${Date.now()}`).slice(0, 20),
      pipe: data.pipe || getAepsPipe()
    };

    return await makePostRequest('/api/partner/v1/aeps/merchant/otp/send', payload, 'sendOtp');
  } catch (error) {
    console.error('Practomind Send KYC OTP Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind send OTP API' };
  }
};

const practomindResendEkycOtp = async (data) => {
  try {
    const payload = {
      merchantId: data.merchantId || data.merchantLoginId,
      merchantRefId: String(data.merchantRefId || data.merchantLoginId || `RESEND_REF_${Date.now()}`).slice(0, 20),
      pipe: data.pipe || getAepsPipe()
    };

    return await makePostRequest('/api/partner/v1/aeps/merchant/otp/resend', payload, 'resendOtp');
  } catch (error) {
    console.error('Practomind Resend KYC OTP Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind resend OTP API' };
  }
};

const practomindValidateEkycOtp = async (data) => {
  try {
    const payload = {
      merchantId: data.merchantId || data.merchantLoginId,
      merchantRefId: String(data.merchantRefId || data.merchantLoginId || `VERIFY_REF_${Date.now()}`).slice(0, 20),
      otp: String(data.otp),
      pipe: data.pipe || getAepsPipe()
    };

    return await makePostRequest('/api/partner/v1/aeps/merchant/otp/validate', payload, 'verifyOtp');
  } catch (error) {
    console.error('Practomind Verify KYC OTP Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind verify OTP API' };
  }
};

const practomindEkycSubmit = async (data) => {
  try {
    const payload = {
      merchantId: data.merchantId || data.merchantLoginId,
      merchantRefId: String(data.merchantRefId || data.merchantLoginId || `BIO_REF_${Date.now()}`).slice(0, 20),
      aadhaarNumber: String(data.aadhaarNumber || data.adhaarNumber || ''),
      pidData: data.pidData || data.txtPidData,
      deviceType: data.deviceType || 'mantra',
      pipe: data.pipe || getAepsPipe(),
      lat: String(data.lat || data.latitude || ''),
      long: String(data.long || data.longitude || '')
    };

    return await makePostRequest('/api/partner/v1/aeps/merchant/ekyc', payload, 'onboardingBiometric');
  } catch (error) {
    console.error('Practomind Biometric KYC Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind biometric KYC API' };
  }
};

const practomindDailyAuthentication = async (data) => {
  try {
    const payload = {
      merchantId: data.merchantId || data.merchantLoginId,
      merchantRefId: String(data.merchantRefId || data.merchantLoginId || `2FA_REF_${Date.now()}`).slice(0, 20),
      aadhaarNumber: String(data.aadhaarNumber || data.adhaarNumber || ''),
      pidData: data.pidData || data.txtPidData,
      deviceType: data.deviceType || 'mantra',
      pipe: data.pipe || getAepsPipe(),
      lat: String(data.lat || data.latitude || ''),
      long: String(data.long || data.longitude || '')
    };

    return await makePostRequest('/api/partner/v1/aeps/merchant/2fa', payload, 'dailyBiometric');
  } catch (error) {
    console.error('Practomind Daily 2FA Biometric Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind daily biometric API' };
  }
};

const practomindCashWithdrawal = async (data) => {
  try {
    const payload = {
      merchantId: data.merchantId || data.merchantLoginId,
      merchantRefId: String(data.merchantRefId || data.reference_id || data.referenceId || data.transactionId || `AEPS_CW_${Date.now()}`).slice(0, 20),
      service_type: 2,
      amount: Number(data.amount !== undefined && data.amount !== null ? data.amount : data.transactionAmount || 0),
      aadhaar: String(data.aadhaar || data.aadhaarNumber || data.adhaarNumber || ''),
      pidData: data.pidData || data.txtPidData,
      bank_iin: String(data.bank_iin || data.nationalBankIdenticationNumber || ''),
      cwAuthTxnId: data.cwAuthTxnId || '',
      deviceType: data.deviceType || 'mantra',
      pipe: data.pipe || getAepsPipe(),
      lat: String(data.lat || data.latitude || ''),
      long: String(data.long || data.longitude || ''),
      reference_id: String(data.reference_id || data.referenceId || data.merchantRefId || data.transactionId || `AEPS_CW_${Date.now()}`).slice(0, 20)
    };

    return await makePostRequest('/api/partner/v1/aeps/transaction', payload, 'Cash Withdrawal');
  } catch (error) {
    console.error('Practomind Cash Withdrawal Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind cash withdrawal API' };
  }
};

const practomindBalanceEnquiry = async (data) => {
  try {
    const payload = {
      merchantId: data.merchantId || data.merchantLoginId,
      merchantRefId: String(data.merchantRefId || data.reference_id || data.referenceId || data.transactionId || `AEPS_BE_${Date.now()}`).slice(0, 20),
      service_type: 3,
      aadhaar: String(data.aadhaar || data.aadhaarNumber || data.adhaarNumber || ''),
      pidData: data.pidData || data.txtPidData,
      bank_iin: String(data.bank_iin || data.nationalBankIdenticationNumber || ''),
      deviceType: data.deviceType || 'mantra',
      pipe: data.pipe || getAepsPipe(),
      lat: String(data.lat || data.latitude || ''),
      long: String(data.long || data.longitude || ''),
      reference_id: String(data.reference_id || data.referenceId || data.merchantRefId || data.transactionId || `AEPS_BE_${Date.now()}`).slice(0, 20)
    };

    return await makePostRequest('/api/partner/v1/aeps/transaction', payload, 'Balance Enquiry');
  } catch (error) {
    console.error('Practomind Balance Enquiry Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind balance enquiry API' };
  }
};

const practomindMiniStatement = async (data) => {
  try {
    const payload = {
      merchantId: data.merchantId || data.merchantLoginId,
      merchantRefId: String(data.merchantRefId || data.reference_id || data.referenceId || data.transactionId || `AEPS_MS_${Date.now()}`).slice(0, 20),
      service_type: 4,
      aadhaar: String(data.aadhaar || data.aadhaarNumber || data.adhaarNumber || ''),
      pidData: data.pidData || data.txtPidData,
      bank_iin: String(data.bank_iin || data.nationalBankIdenticationNumber || ''),
      deviceType: data.deviceType || 'mantra',
      pipe: data.pipe || getAepsPipe(),
      lat: String(data.lat || data.latitude || ''),
      long: String(data.long || data.longitude || ''),
      reference_id: String(data.reference_id || data.referenceId || data.merchantRefId || data.transactionId || `AEPS_MS_${Date.now()}`).slice(0, 20)
    };

    return await makePostRequest('/api/partner/v1/aeps/transaction', payload, 'Mini Statement');
  } catch (error) {
    console.error('Practomind Mini Statement Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind mini statement API' };
  }
};

const practomindAadhaarPay = async (data) => {
  try {
    const payload = {
      merchantId: data.merchantId || data.merchantLoginId,
      merchantRefId: String(data.merchantRefId || data.reference_id || data.referenceId || data.transactionId || `AEPS_AP_${Date.now()}`).slice(0, 20),
      service_type: 5,
      amount: Number(data.amount !== undefined && data.amount !== null ? data.amount : data.transactionAmount || 0),
      aadhaar: String(data.aadhaar || data.aadhaarNumber || data.adhaarNumber || ''),
      pidData: data.pidData || data.txtPidData,
      bank_iin: String(data.bank_iin || data.nationalBankIdenticationNumber || ''),
      cwAuthTxnId: data.cwAuthTxnId || '',
      deviceType: data.deviceType || 'mantra',
      pipe: data.pipe || getAepsPipe(),
      lat: String(data.lat || data.latitude || ''),
      long: String(data.long || data.longitude || ''),
      reference_id: String(data.reference_id || data.referenceId || data.merchantRefId || data.transactionId || `AEPS_AP_${Date.now()}`).slice(0, 20)
    };

    return await makePostRequest('/api/partner/v1/aeps/transaction', payload, 'Aadhaar Pay');
  } catch (error) {
    console.error('Practomind Aadhaar Pay Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind aadhaar pay API' };
  }
};

const sendTransactionOtp = async (data) => {
  try {
    const payload = {
      merchantId: data.merchantId || data.merchantLoginId,
      transactionType: data.transactionType || 'CW',
      pipe: data.pipe || getAepsPipe()
    };

    return await makePostRequest('/api/partner/v1/aeps/transaction/otp', payload, 'Transaction OTP');
  } catch (error) {
    console.error('Practomind Transaction OTP Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind transaction OTP API' };
  }
};

const getAepsStatus = async (merchantId) => {
  try {
    console.log('[Practomind] Fetching AEPS status...');
    const result = await makeGetRequest(
      '/api/partner/v1/aeps/status',
      'aepsStatus',
      merchantId ? { merchantId } : null
    );
    console.log('Practomind AEPS Status Response:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('Practomind AEPS Status Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind status API' };
  }
};

const getStates = async () => {
  try {
    console.log('[Practomind] Fetching states...');
    const result = await makeGetRequest('/api/partner/v1/aeps/states', 'getStates');
    return result;
  } catch (error) {
    console.error('Practomind Get States Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind states API' };
  }
};

const getDistricts = async (data) => {
  try {
    const payload = { stateCode: data?.stateCode };
    return await makePostRequest('/api/partner/v1/aeps/districts', payload, 'getDistricts');
  } catch (error) {
    console.error('Practomind Get Districts Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind districts API' };
  }
};

const getBankIINs = async (data = {}) => {
  try {
    return await makePostRequest('/api/partner/v1/aeps/bank-iins', data, 'getBankIINs');
  } catch (error) {
    console.error('Practomind Get Bank IINs Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'error', message: error.message || 'Unable to reach Practomind bank IIN API' };
  }
};

const getBanks = async () => {
  try {
    console.log('[Practomind] Fetching banks...');
    const result = await makeGetRequest('/api/partner/v1/aeps/banks', 'getBanks');
    console.log('response', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('[Practomind] getBanks Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'failure', message: error.message };
  }
};

const checkBalance = async () => {
  try {
    console.log('[Practomind] Fetching balance...');
    const result = await makeGetRequest('/api/partner/v1/balance', 'checkBalance');
    console.log('balance response', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('[Practomind] checkBalance Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'failure', message: error.message };
  }
};

const getPurposes = async () => {
  try {
    console.log('[Practomind] Fetching purposes...');
    const result = await makeGetRequest('/api/partner/v1/payout/purposes', 'getPurposes');
    console.log('response', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('[Practomind] getPurposes Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'failure', message: error.message };
  }
};

const getPayoutStatus = async (referenceId) => {
  try {
    const trimmedRefId = String(referenceId || '').trim();
    if (!trimmedRefId) {
      return { status: 'failure', message: 'referenceId is required' };
    }
    console.log(`[Practomind] Fetching status for reference ${trimmedRefId}...`);
    const result = await makeGetRequest(`/api/partner/v1/payout/status/${encodeURIComponent(trimmedRefId)}`, 'getPayoutStatus');
    console.log('response', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('[Practomind] getPayoutStatus Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'failure', message: error.message, code: error.code };
  }
};

const initiateTransfer = async (data) => {
  try {
    const payload = {
      accountNumber: data.accountNumber,
      ifsc: data.ifsc,
      accountName: data.accountName,
      bankName: data.bankName,
      mobile: data.mobile,
      amount: Number(data.amount),
      mode: data.mode || 'IMPS',
      purpose: data.purpose || '004',
      state: data.state || 'DL',
      lat: data.lat ? String(data.lat) : (data.latitude ? String(data.latitude) : '28.6139'),
      long: data.long ? String(data.long) : (data.longitude ? String(data.longitude) : '77.2090'),
      reference_id: data.reference_id
    };

    return await makePostRequest('/api/partner/v1/payout/transfer', payload, 'initiateTransfer');
  } catch (error) {
    console.error('[Practomind] initiateTransfer Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'failure', message: error.message, code: error.code };
  }
};

const stateCodePayout = async () => {
  try {
    console.log('[Practomind] Fetching state code payout...');
    const result = await makeGetRequest('/api/partner/v1/payout/states', 'stateCodePayout');
    console.log('response', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('[Practomind] stateCodePayout Error:', error.response?.data || error.message);
    return error.response?.data || { status: 'failure', message: error.message };
  }
};

module.exports = {
  getAccessToken,
  getAuthHeaders,
  getHeaders,
  makeGetRequest,
  makePostRequest,
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
  getPurposes,
  getPayoutStatus,
  initiateTransfer,
  stateCodePayout
};
