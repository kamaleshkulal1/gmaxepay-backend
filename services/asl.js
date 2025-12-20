const axios = require('axios');
const FormData = require('form-data');
const https = require('https');
const http = require('http');
const aslUrl = process.env.ASL_URL;
const aslApiToken = process.env.ASL_API_TOKEN;
const aslAssociateId = process.env.ASL_ASSOCIATE_ID;
const aslApiUserId = process.env.ASL_USER_ID;
const FILE_DOWNLOAD_TIMEOUT_MS = Number(process.env.ASL_FILE_DOWNLOAD_TIMEOUT_MS || 8000);
const FILE_DOWNLOAD_MAX_BYTES = Number(process.env.ASL_FILE_DOWNLOAD_MAX_BYTES || 5 * 1024 * 1024);

// HTTP Agent with keepAlive for connection pooling (reuses connections)
const httpAgent = new http.Agent({ 
  keepAlive: true, 
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10
});

const httpsAgent = new https.Agent({ 
  keepAlive: true, 
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10
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

// Download file from URL (optimized with better error handling)
const downloadFileFromUrl = async (url, key) => {
  const downloadStartedAt = Date.now();
  try {
    const fileResponse = await fileDownloadClient.get(url);
    const filename = getFileNameFromUrl(url, `${key}.jpg`);
    const downloadTime = Date.now() - downloadStartedAt;
    console.log(`[ASL AEPS] Downloaded ${key} (${filename}) in ${downloadTime}ms`);
    return {
      data: fileResponse.data,
      filename,
      contentType: fileResponse.headers['content-type'] || 'application/octet-stream'
    };
  } catch (error) {
    const downloadTime = Date.now() - downloadStartedAt;
    console.error(`[ASL AEPS] Failed to download ${key} from ${url} after ${downloadTime}ms:`, error.message);
    throw new Error(`Unable to download ${key} asset: ${error.message}`);
  }
};

// Process file field value (handles Buffer, base64, or URL)
const processFileField = (key, value) => {
  if (Buffer.isBuffer(value)) {
    return { key, type: 'buffer', data: value, filename: `${key}.jpg`, contentType: 'application/octet-stream' };
  }

  if (typeof value === 'string' && value.startsWith('data:')) {
    const [mimeType, base64Part] = value.split(',');
    const buffer = Buffer.from(base64Part, 'base64');
    const contentType = mimeType.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
    return { key, type: 'buffer', data: buffer, filename: `${key}.jpg`, contentType };
  }

  if (isHttpUrl(value)) {
    return { key, type: 'url', url: value };
  }

  return null;
};

// Append non-file fields to FormData (synchronous)
const appendNonFileField = (formData, key, value) => {
  if (value === undefined || value === null || value === '') {
    return;
  }

  const normalizedValue =
    typeof value === 'number'
      ? value.toString()
      : typeof value === 'boolean'
      ? value ? 'true' : 'false'
      : value;
  formData.append(key, normalizedValue);
};

// ASL AEPS Onboarding (Optimized for faster file downloads)
const aslAepsOnboarding = async (data) => {
  const overallStartTime = Date.now();
  try {
    const payload = {
      associateId: aslAssociateId,
      apiToken: aslApiToken,
      Service: 'AEPS',
      ...data
    };

    const formData = new FormData();
    
    // Separate file fields from non-file fields for optimization
    const fileFieldsToProcess = [];
    const nonFileFields = [];

    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      if (AEPS_FILE_FIELDS.has(key)) {
        const fileInfo = processFileField(key, value);
        if (fileInfo) {
          fileFieldsToProcess.push(fileInfo);
        }
      } else {
        nonFileFields.push([key, value]);
      }
    }

    // Step 1: Download all files in parallel (biggest bottleneck)
    const fileDownloadStart = Date.now();
    const fileDownloads = await Promise.all(
      fileFieldsToProcess.map(async (fileInfo) => {
        if (fileInfo.type === 'url') {
          const downloaded = await downloadFileFromUrl(fileInfo.url, fileInfo.key);
          return { 
            key: fileInfo.key, 
            data: downloaded.data, 
            filename: downloaded.filename, 
            contentType: downloaded.contentType 
          };
        }
        // Buffer or base64 - already processed
        return { 
          key: fileInfo.key, 
          data: fileInfo.data, 
          filename: fileInfo.filename, 
          contentType: fileInfo.contentType 
        };
      })
    );
    const fileDownloadTime = Date.now() - fileDownloadStart;
    if (fileDownloads.length > 0) {
      console.log(`[ASL AEPS] All ${fileDownloads.length} files downloaded in ${fileDownloadTime}ms`);
    }

    // Step 2: Append non-file fields first (faster, synchronous)
    nonFileFields.forEach(([key, value]) => {
      appendNonFileField(formData, key, value);
    });

    // Step 3: Append file fields
    fileDownloads.forEach((file) => {
      formData.append(file.key, file.data, {
        filename: file.filename,
        contentType: file.contentType || 'application/octet-stream'
      });
    });

    const formBuildTime = Date.now() - overallStartTime;
    console.log(`[ASL AEPS] FormData built in ${formBuildTime}ms (${fileDownloads.length} files, ${nonFileFields.length} non-file fields)`);

    // Step 4: Send request to ASL API
    const apiRequestStart = Date.now();
    const response = await axios.post(`${aslUrl}/aeps/v1/onboarding`, formData, {
      headers: {
        ...formData.getHeaders()
      },
      timeout: 30000, // 30s timeout for API request
    });
    const apiRequestTime = Date.now() - apiRequestStart;
    const totalTime = Date.now() - overallStartTime;
    console.log(`[ASL AEPS] API request completed in ${apiRequestTime}ms. Total onboarding time: ${totalTime}ms`);
    
    return response.data;
  } catch (error) {
    const totalTime = Date.now() - overallStartTime;
    console.error(`[ASL AEPS] Onboarding failed after ${totalTime}ms:`, error?.response?.data || error.message);
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