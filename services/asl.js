const axios = require('axios');
const FormData = require('form-data');
const https = require('https');
const http = require('http');
const aslUrl = process.env.ASL_URL;
const aslApiToken = process.env.ASL_API_TOKEN;
const aslAssociateId = process.env.ASL_ASSOCIATE_ID;
const aslApiUserId = process.env.ASL_USER_ID;
const FILE_DOWNLOAD_TIMEOUT_MS = Number(process.env.ASL_FILE_DOWNLOAD_TIMEOUT_MS || 10000);
const FILE_DOWNLOAD_MAX_BYTES = Number(process.env.ASL_FILE_DOWNLOAD_MAX_BYTES || 5 * 1024 * 1024);

// HTTP agents with keepAlive for connection pooling (reuses connections for faster downloads)
const httpAgent = new http.Agent({ 
  keepAlive: true, 
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000
});

const httpsAgent = new https.Agent({ 
  keepAlive: true, 
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000
});

const fileDownloadClient = axios.create({
  timeout: FILE_DOWNLOAD_TIMEOUT_MS,
  responseType: 'arraybuffer',
  maxContentLength: FILE_DOWNLOAD_MAX_BYTES,
  maxRedirects: 3,
  httpAgent: httpAgent,
  httpsAgent: httpsAgent,
  validateStatus: (status) => status >= 200 && status < 300
});

const AEPS_FILE_FIELDS = new Set([
  'retailerAadhaarFrontImage',
  'retailerAadhaarBackImage',
  'retailerPanFrontImage',
  'retailerPanBackImage',
  'retailerShopImage'
]);

const isHttpUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value);

const getFileNameFromUrl = (url, fallback) => {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length) {
      return segments.pop();
    }
  } catch (error) {
    // ignore and fallback
  }
  return fallback;
};

const appendFormField = async (formData, key, value) => {
  if (value === undefined || value === null || value === '') {
    return;
  }

  if (AEPS_FILE_FIELDS.has(key)) {
    if (Buffer.isBuffer(value)) {
      formData.append(key, value, { filename: `${key}.jpg` });
      return;
    }

    if (typeof value === 'string' && value.startsWith('data:')) {
      const [, base64Part] = value.split(',');
      const buffer = Buffer.from(base64Part, 'base64');
      formData.append(key, buffer, { filename: `${key}.jpg` });
      return;
    }

    if (isHttpUrl(value)) {
      const downloadStartedAt = Date.now();
      try {
        console.log(`[ASL AEPS] Starting download for ${key} from ${value.substring(0, 50)}...`);
        const fileResponse = await fileDownloadClient.get(value);
        const filename = getFileNameFromUrl(value, `${key}.jpg`);
        const fileSize = fileResponse.data.length;
        const downloadTime = Date.now() - downloadStartedAt;
        const downloadSpeed = fileSize > 0 ? ((fileSize / 1024) / (downloadTime / 1000)).toFixed(2) : 0;
        formData.append(key, fileResponse.data, {
          filename,
          contentType: fileResponse.headers['content-type'] || 'application/octet-stream'
        });
        console.log(`[ASL AEPS] ✅ Downloaded ${key} (${filename}) - ${(fileSize / 1024).toFixed(2)}KB in ${downloadTime}ms (${downloadSpeed} KB/s)`);
      } catch (error) {
        const downloadTime = Date.now() - downloadStartedAt;
        console.error(`[ASL AEPS] ❌ Failed to download ${key} from ${value} after ${downloadTime}ms:`, error.message);
        throw new Error(`Unable to download ${key} asset: ${error.message}`);
      }
      return;
    }
  }

  const normalizedValue =
    typeof value === 'number'
      ? value.toString()
      : typeof value === 'boolean'
      ? value ? 'true' : 'false'
      : value;
  formData.append(key, normalizedValue);
};

// ASL AEPS Onboarding
const aslAepsOnboarding = async (data) => {
  const aslFunctionStart = Date.now();
  try {
    const payloadStart = Date.now();
    const payload = {
      associateId: aslAssociateId,
      apiToken: aslApiToken,
      Service: 'AEPS',
      ...data
    };
    const payloadTime = Date.now() - payloadStart;
    console.log(`[ASL AEPS] Payload created in ${payloadTime}ms`);

    const formData = new FormData();
    const formBuildStart = Date.now();
    
    // Separate file fields for tracking
    const fileFields = [];
    const nonFileFields = [];
    
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null || value === '') continue;
      if (AEPS_FILE_FIELDS.has(key) && isHttpUrl(value)) {
        fileFields.push({ key, url: value });
      } else {
        nonFileFields.push({ key, value });
      }
    }
    
    console.log(`[ASL AEPS] Processing ${fileFields.length} file fields and ${nonFileFields.length} non-file fields`);
    
    // Process file downloads in parallel
    const fileDownloadStart = Date.now();
    await Promise.all(
      Object.entries(payload).map(([key, value]) => appendFormField(formData, key, value))
    );
    const formBuildTime = Date.now() - formBuildStart;
    const fileDownloadTime = fileFields.length > 0 ? Date.now() - fileDownloadStart : 0;
    
    if (fileFields.length > 0) {
      console.log(`[ASL AEPS] File downloads completed in ${fileDownloadTime}ms (${fileFields.length} files)`);
    }
    console.log(`[ASL AEPS] FormData built in ${formBuildTime}ms`);

    const apiRequestStart = Date.now();
    const response = await axios.post(`${aslUrl}/aeps/v1/onboarding`,
      formData,
      {
        headers: {
          ...formData.getHeaders()
        },
        timeout: 30000, // 30 second timeout for the API request
      });
    const apiRequestTime = Date.now() - apiRequestStart;
    const totalAslTime = Date.now() - aslFunctionStart;
    console.log(`[ASL AEPS] API request completed in ${apiRequestTime}ms. Total ASL function time: ${totalAslTime}ms`);
    
    return response.data;
  } catch (error) {
    const totalAslTime = Date.now() - aslFunctionStart;
    console.error(`[ASL AEPS] Error after ${totalAslTime}ms:`, error?.response?.data || error.message);
    return error.response?.data || { status: 'error', message: 'Unable to reach ASL onboarding API' };
  }
}


const aslAepsValidateAgentOtp = async (data) => {
  try{
    const payload = {
      associateId: aslAssociateId,
      apiToken: aslApiToken,
      Service: 'AEPS',
      ...data
    }
    console.log('payload', payload);
    const response = await axios.post(`${aslUrl}/aeps/v1/otpValidate`, {
      ...payload
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log("response.data",response.data);
    return response.data;
  } catch (error) {
    console.log("error",error);
    return error.response.data;
  }
}

// ASL AEPS Validate Agent Biometric
const aslAepsValidateAgentBiometric = async (data) => {
  try{
    const response = await axios.post(`${aslUrl}/aeps/v1/biometricValidate`,
        {
            associateId: aslAssociateId,
            apiToken: aslApiToken,
            ServiceType: 'AEPS',
            ...data
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    console.log("response",response);
    console.log("response.data",response.data);
    return response.data;
  } catch (error) {
    console.log("error",error);
    return error.response.data;
  }
}

// ASL AEPS 2FA
const aslAeps2FA = async (data) => {
  try {
    const response = await axios.post(`${aslUrl}/aeps/v1/two-factor-authenticate`,
      {
        associateId: aslAssociateId,
        apiToken: aslApiToken,
        Service: 'AEPS',
        ...data
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('ASL AEPS 2FA error:', error.message);
    if (error.response && error.response.data) {
      if (typeof error.response.data === 'string') {
        try {
          return JSON.parse(error.response.data);
        } catch (e) {
          return error.response.data;
        }
      }
      return error.response.data;
    }
    return { status: 'ERROR', message: error.message || 'Unknown error' };
  }
}

// ASL AEPS Transaction
const aslAepsTransaction = async (data) => {
  try{
    const response = await axios.post(`${aslUrl}/aeps/v1/aepsTransaction`,
        {
            associateId: aslAssociateId,
            apiToken: aslApiToken,
            ServiceType: 'AEPS',
            ...data
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    console.log("response",response);
    console.log("response.data",response.data);
    return response.data;
  } catch (error) {
    console.log("error",error);
    return error.response.data;
  }
}

// ASL AEPS Receive OTP
const aslAepsReceiveOtp = async (data) => {
  try{
    const response = await axios.post(`${aslUrl}/aeps/v1/receiveOTP`,
        {
            associateId: aslAssociateId,
            apiToken: aslApiToken,
            ...data
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    console.log("response",response);
    console.log("response.data",response.data);
    return response.data;
  } catch (error) {
    console.log("error",error);
    return error.response.data;
  }
}

const aslAepsResendOtp = async (data) => {
  try{
    const response = await axios.post(`${aslUrl}/aeps/v1/resendOTP`,
        {
            associateId: aslAssociateId,
            apiToken: aslApiToken,
            ...data
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    console.log("response.data",response.data);
    return response.data;
  } catch (error) {
    console.log("error",error);
    return error.response.data;
  }
}

// ASL AEPS Pay Out
const aslAepsPayOut = async (data) => {
  try{
    const payload = {
      associateId: aslAssociateId,
      apiToken: aslApiToken,
      ...data
    }
    const response = await axios.post(`${aslUrl}/payout/v1/payout`, {
      ...payload
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log("response.data",response.data);
    return response.data;
  } catch (error) {
    console.log("error",error?.response?.data || error.message);
    return error.response?.data || { status: 'error', message: 'Unable to reach ASL Payout API' };
  }
}

// ASL DMT Sender Registration
const aslDmtSenderRegistration = async (data) => {
    try{
        const response = await axios.post(`${aslUrl}dmt/senderregistration`,
            {
                apiToken : aslApiToken,
                apiUserId: aslApiUserId,
                ...data
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        console.log("response",response);
        console.log("response.data",response.data);
        return response.data;
    } catch (error) {
        console.log("error",error);
        return error.response.data;
    }
}

// ASL DMT Receive OTP
const aslDmtReceiveOtp = async (data) => {
    try{
        const response = await axios.post(`${aslUrl}/dmt/receiveotp`,
            {
                apiToken : aslApiToken,
                apiUserId: aslApiUserId,
                ...data
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        console.log("response",response);
        console.log("response.data",response.data);
        return response.data;
    } catch (error) {
        console.log("error",error);
        return error.response.data;
    }
}

// ASL DMT Verify OTP
const aslDmtVerifyOtp = async (data) => {
    try{
        const response = await axios.post(`${aslUrl}/dmt/verifyotp`,
            {
                apiToken : aslApiToken,
                apiUserId: aslApiUserId,
                ...data
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        console.log("response",response);
        console.log("response.data",response.data);
        return response.data;
    } catch (error) {
        console.log("error",error);
        return error.response.data;
    }
}

// ASL DMT Add Beneficiary
const aslDmtAddBeneficiary = async (data) => {
    try{
        const response = await axios.post(`${aslUrl}/dmt/addBeneficiary`,
            {
                apiToken : aslApiToken,
                apiUserId: aslApiUserId,
                ...data
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        console.log("response",response);
        console.log("response.data",response.data);
        return response.data;
    } catch (error) {
        console.log("error",error);
        return error.response.data;
    }
}

// ASL DMT Get Beneficiary
const aslDmtGetBeneficiary = async (data) => {
    try{
        const response = await axios.post(`${aslUrl}/dmt/getbeneficiary`,
            {
                apiToken : aslApiToken,
                apiUserId: aslApiUserId,
                ...data
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        console.log("response",response);
        console.log("response.data",response.data);
        return response.data;
    } catch (error) {
        console.log("error",error);
        return error.response.data;
    }
}

// ASL DMT Get Beneficiary Details
const aslDmtBeneficiaryDetails = async (data) => {
    try{
        const response = await axios.post(`${aslUrl}/dmt/getbeneficiarydetails`,
            {
                apiToken : aslApiToken,
                apiUserId: aslApiUserId,
                ...data
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        console.log("response",response);
        console.log("response.data",response.data);
        return response.data;
    } catch (error) {
        console.log("error",error);
        return error.response.data;
    }
}

// ASL DMT Get Beneficiary Names
const aslDmtGetBeneficiaryNames = async (data) => {
    try{
        const response = await axios.post(`${aslUrl}/dmt/getbeneficiaryname`,
            {
                apiToken : aslApiToken,
                apiUserId: aslApiUserId,
                ...data
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        console.log("response",response);
        console.log("response.data",response.data);
        return response.data;
    } catch (error) {
        console.log("error",error);
        return error.response.data;
    }
}

// ASL DMT Money Transfer
const aslDmtMoneyTransfer = async (data) => {
    try{
        const response = await axios.post(`${aslUrl}/dmt/moneytransfer`,
            {
                apiToken : aslApiToken,
                apiUserId: aslApiUserId,
                ...data
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        console.log("response",response);
        console.log("response.data",response.data);
        return response.data;
    } catch (error) {
        console.log("error",error);
        return error.response.data;
    }
}

module.exports = {
    aslAepsOnboarding,
    aslAepsValidateAgentOtp,
    aslAepsValidateAgentBiometric,
    aslAeps2FA,
    aslAepsTransaction,
    aslAepsReceiveOtp,
    aslAepsResendOtp,
    aslAepsPayOut,
    aslDmtSenderRegistration,
    aslDmtReceiveOtp,
    aslDmtVerifyOtp,
    aslDmtAddBeneficiary,
    aslDmtGetBeneficiary,
    aslDmtBeneficiaryDetails,
    aslDmtGetBeneficiaryNames,
    aslDmtMoneyTransfer
}