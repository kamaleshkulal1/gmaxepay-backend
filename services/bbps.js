const axios = require('axios');
const encrypt = require('../utils/encrypt');
const generateRequestId = require('../utils/generateRequestId');
const decrypt = require('../utils/decrypt');

const BBPS_URL = process.env.BBPS_BASE_URL;
const ACCESS_CODE = process.env.BBPS_ACCESS_CODE;
const REQUEST_TYPE = process.env.BBPS_REQUEST_TYPE;
const RESPONSE_TYPE = process.env.BBPS_RESPONSE_TYPE;
const VERSION = process.env.BBPS_VERSION;
const BBPS_INSTITUTE_ID = process.env.BBPS_INSTITUTE_ID;

const buildSecurePayload = ({ jsonData }) => {
  if (!jsonData) {
    throw new Error('jsonData is required.');
  }

  const requestData = {
    request: jsonData
  };

  const encRequest = encrypt(JSON.stringify(requestData.request));
  const requestId = generateRequestId();

  return {
    enc_request: encRequest,
    access_code: ACCESS_CODE,
    requestId: requestId,
    request_type: REQUEST_TYPE,
    response_type: RESPONSE_TYPE,
    version: VERSION,
    bbpsInstituteId: BBPS_INSTITUTE_ID
  };
};

const buildSecurePayloadComplaint = ({ jsonData }) => {
  if (!jsonData) {
    throw new Error('jsonData is required.');
  }

  const requestData = {
    request: jsonData
  };

  const encRequest = encrypt(JSON.stringify(requestData.request));

  return {
    enc_request: encRequest,
    access_code: ACCESS_CODE,
    requestId: generateRequestId(),
    request_type: REQUEST_TYPE,
    response_type: RESPONSE_TYPE,
    version: '2.0',
    bbpsInstituteId: BBPS_INSTITUTE_ID
  };
};

const fetchBillers = async (category) => {
  try {
    const payload = buildSecurePayload({
      jsonData: { category },
      command: 'fetch_billers'
    });

    const response = await axios.post(
      `${BBPS_URL}/fetch-billers`,
      payload
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching billers:', error);
    throw error;
  }
};

const fetchBillParameters = async (billerId) => {
  try {
    const payload = buildSecurePayload({
      jsonData: { billerId },
      command: 'fetch_bill_parameters'
    });

    const response = await axios.post(
      `${BBPS_URL}/fetch-parameters`,
      payload
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching bill parameters:', error);
    throw error;
  }
};

const fetchBill = async (billDetails) => {
  try {
    const payload = buildSecurePayload({
      jsonData: billDetails,
      command: 'fetch_bill'
    });

    const response = await axios.post(`${BBPS_URL}/fetch-bill`, payload);
    return response.data;
  } catch (error) {
    console.error('Error fetching bill:', error);
    throw error;
  }
};

const payBill = async (paymentDetails) => {
  try {
    const payload = buildSecurePayload({
      jsonData: paymentDetails,
      command: 'pay_bill'
    });

    const response = await axios.post(`${BBPS_URL}/pay-bill`, payload);
    return response.data;
  } catch (error) {
    console.error('Error paying bill:', error);
    throw error;
  }
};

const getTransactionStatus = async (transactionId) => {
  try {
    const payload = buildSecurePayload({
      jsonData: { transactionId },
      command: 'transaction_status'
    });

    const response = await axios.post(
      `${BBPS_URL}/transaction-status`,
      payload
    );
    return response.data;
  } catch (error) {
    console.error('Error getting transaction status:', error);
    throw error;
  }
};

const getTransactionHistory = async (filters) => {
  try {
    const payload = buildSecurePayload({
      jsonData: filters,
      command: 'transaction_history'
    });

    const response = await axios.post(
      `${BBPS_URL}/transaction-history`,
      payload
    );
    return response.data;
  } catch (error) {
    console.error('Error getting transaction history:', error);
    throw error;
  }
};

const getBillerInfo = async (billerId) => {
  try {
    const jsonData = { billerId: [billerId] };
    const payload = buildSecurePayload({ jsonData });

    const url = `${BBPS_URL}/billpay/extMdmCntrl/mdmRequestNew/json?accessCode=${payload.access_code}&requestId=${payload.requestId}&ver=${payload.version}&instituteId=${payload.bbpsInstituteId}`;

    const response = await axios.post(url, payload.enc_request, {
      headers: {
        'Content-Type': 'text/plain'
      }
    });

    let parsedResponse;
    if (typeof response.data === 'object' && response.data !== null) {
      parsedResponse = response.data;
    } else if (typeof response.data === 'string') {
      try {
        parsedResponse = JSON.parse(response.data);
      } catch (jsonParseError) {
        try {
          const decryptedResponse = decrypt(response.data);
          parsedResponse = JSON.parse(decryptedResponse);
        } catch (decryptError) {
          console.error('Decryption error:', decryptError);
          throw new Error(
            `Failed to process response: ${decryptError.message}`
          );
        }
      }
    } else {
      throw new Error(`Unexpected response data type: ${typeof response.data}`);
    }

    return {
      data: parsedResponse,
      requestId: payload.requestId
    };
  } catch (error) {
    console.error('Error getting biller info:', error);
    throw error;
  }
};

module.exports = {
  fetchBillers,
  fetchBillParameters,
  fetchBill,
  payBill,
  getTransactionStatus,
  getTransactionHistory,
  getBillerInfo,
  buildSecurePayload,
  buildSecurePayloadComplaint
};
