const axios = require('axios');
const https = require('https');
const FormData = require('form-data');
const aslUrl = process.env.ASL_URL;
const aslApiToken = process.env.ASL_API_TOKEN;
const aslAssociateId = process.env.ASL_ASSOCIATE_ID;
const aslApiUserId = process.env.ASL_USER_ID;
// Reduced timeout from 15s to 3s for faster failure
const FILE_DOWNLOAD_TIMEOUT_MS = Number(process.env.ASL_FILE_DOWNLOAD_TIMEOUT_MS || 3000);
const FILE_DOWNLOAD_MAX_BYTES = Number(process.env.ASL_FILE_DOWNLOAD_MAX_BYTES || 5 * 1024 * 1024);

// Optimized HTTP agent with keep-alive for connection reuse
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: FILE_DOWNLOAD_TIMEOUT_MS
});

const fileDownloadClient = axios.create({
  timeout: FILE_DOWNLOAD_TIMEOUT_MS,
  responseType: 'arraybuffer',
  maxContentLength: FILE_DOWNLOAD_MAX_BYTES,
  validateStatus: (status) => status >= 200 && status < 300,
  httpsAgent: httpsAgent,
  httpAgent: httpsAgent, // Also use for http requests
  maxRedirects: 3
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

// Download a single image and return buffer with metadata
const downloadImage = async (url, key) => {
  const downloadStartedAt = Date.now();
  try {
    const fileResponse = await fileDownloadClient.get(url);
    const filename = getFileNameFromUrl(url, `${key}.jpg`);
    console.log(`[ASL AEPS] Downloaded ${key} (${filename}) in ${Date.now() - downloadStartedAt}ms`);
    return {
      buffer: fileResponse.data,
      filename,
      contentType: fileResponse.headers['content-type'] || 'application/octet-stream'
    };
  } catch (error) {
    console.error(`[ASL AEPS] Failed to download ${key} from ${url}`, error.message);
    throw new Error(`Unable to download ${key} asset: ${error.message}`);
  }
};

// Process image value and return buffer or original value
const processImageValue = async (value, key) => {
  if (Buffer.isBuffer(value)) {
    return { type: 'buffer', buffer: value, filename: `${key}.jpg` };
  }

  if (typeof value === 'string' && value.startsWith('data:')) {
    const [, base64Part] = value.split(',');
    const buffer = Buffer.from(base64Part, 'base64');
    return { type: 'buffer', buffer, filename: `${key}.jpg` };
  }

  if (isHttpUrl(value)) {
    const result = await downloadImage(value, key);
    return { type: 'buffer', ...result };
  }

  return { type: 'original', value };
};

const appendFormField = (formData, key, value, imageCache = null) => {
  if (value === undefined || value === null || value === '') {
    return;
  }

  // Use cached processed image if available
  if (AEPS_FILE_FIELDS.has(key) && imageCache && imageCache[key]) {
    const cached = imageCache[key];
    if (cached.type === 'buffer') {
      formData.append(key, cached.buffer, {
        filename: cached.filename,
        contentType: cached.contentType || 'application/octet-stream'
      });
      return;
    }
    // If cached but type is 'original', fall through to handle as non-image
  }

  // Handle image fields that weren't cached (shouldn't happen in optimized flow)
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
    
    // If it's an HTTP URL that wasn't processed, skip it (shouldn't happen)
    if (isHttpUrl(value)) {
      console.warn(`[ASL AEPS] Image field ${key} is a URL but wasn't pre-processed`);
      return;
    }
  }

  // Handle non-image fields
  const normalizedValue =
    typeof value === 'number'
      ? value.toString()
      : typeof value === 'boolean'
      ? value ? 'true' : 'false'
      : value;
  formData.append(key, normalizedValue);
};

// ASL AEPS Onboarding
const  aslAepsOnboarding = async (data) => {
  try{
    const payload = {
      associateId: aslAssociateId,
      apiToken : aslApiToken,
      Service: 'AEPS',
      ...data
    };

    const downloadStart = Date.now();
    
    // Step 1: Pre-download all images in parallel for maximum performance
    const imageDownloadPromises = [];
    
    for (const [key, value] of Object.entries(payload)) {
      if (AEPS_FILE_FIELDS.has(key) && value && (isHttpUrl(value) || Buffer.isBuffer(value) || (typeof value === 'string' && value.startsWith('data:')))) {
        imageDownloadPromises.push(
          processImageValue(value, key).then(result => ({ key, result })).catch(err => ({ key, error: err.message }))
        );
      }
    }

    // Download all images in parallel
    const downloadedImages = await Promise.all(imageDownloadPromises);
    const imageCache = {};
    for (const item of downloadedImages) {
      if (item.error) {
        throw new Error(`Failed to process image ${item.key}: ${item.error}`);
      }
      imageCache[item.key] = item.result;
    }

    console.log(`[ASL AEPS] All images downloaded in ${Date.now() - downloadStart}ms`);

    // Step 2: Build FormData synchronously with cached images
    const formData = new FormData();
    for (const [key, value] of Object.entries(payload)) {
      appendFormField(formData, key, value, imageCache);
    }

    // Step 3: Make API call with optimized timeout
    const apiStart = Date.now();
    const response = await axios.post(`${aslUrl}/aeps/v1/onboarding`,
      formData,
      {
        headers: {
          ...formData.getHeaders()
        },
        timeout: 3000, // 3 second timeout for API call (allowing ~1.9s for images + processing)
        httpsAgent: httpsAgent,
        httpAgent: httpsAgent
      });
    
    console.log(`[ASL AEPS] API call completed in ${Date.now() - apiStart}ms`);
    console.log(`[ASL AEPS] Total onboarding time: ${Date.now() - downloadStart}ms`);
    
    return response.data;
  } catch (error) {
    console.log("error",error?.response?.data || error.message);
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
            Service: 'AEPS',
            ...data
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    return response.data;
  } catch (error) {
    console.log("ASL AEPS Transaction error", error?.response?.data || error.message);
    return error.response?.data || { status: 'error', message: 'Unable to reach ASL AEPS Transaction API' };
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

const alsWallet = async () => {
    try{
        const response = await axios.post(`${aslUrl}/check/walletBalance`,
            {
              apiToken : aslApiToken,
              associateId: aslAssociateId
            }
        );
        return response.data;
    } catch (error) {
        console.error("error",error);
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
    aslDmtMoneyTransfer,
    alsWallet
}