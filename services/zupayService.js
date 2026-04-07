const axios = require('axios');
const crypto = require('crypto');

const ZUPAY_BASE_URL = process.env.ZUPAY_BASE_URL;
const ZUPAY_API_KEY = process.env.ZUPAY_API_KEY;
const ZUPAY_API_SECRET = process.env.ZUPAY_API_SECRET;
const ZUPAY_CLIENT_ID = process.env.ZUPAY_CLIENT_ID;
const ZUPAY_SIGNATURE = process.env.ZUPAY_SIGNATURE;


const generateSignature = (method, path, timestamp, payloadString, query = '') => {
    if (!ZUPAY_SIGNATURE) return '';

    let bodyHash = "";
    if (payloadString) {
        bodyHash = crypto.createHash('sha256').update(payloadString).digest('base64');
    }

    let stringToSign = method + "\n" + path + "\n";
    if (query) {
        stringToSign += query + "\n";
    }
    if (bodyHash) {
        stringToSign += bodyHash + "\n";
    }
    stringToSign += timestamp;

    return crypto.createHmac('sha256', ZUPAY_SIGNATURE)
        .update(stringToSign)
        .digest('base64');
};

const getRequestConfig = (method, path, payload, query = '') => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payloadString = payload ? JSON.stringify(payload) : '';

    const signature = generateSignature(method, path, timestamp, payloadString, query);

    return {
        headers: {
            'Content-Type': 'application/json',
            'X-Client-Id': ZUPAY_CLIENT_ID,
            'X-API-Key': ZUPAY_API_KEY,
            'X-API-Secret': ZUPAY_API_SECRET,
            'X-Signature': signature,
            // 'X-Mock-Response': 'FAILED',
            'X-Timestamp': timestamp
        },
        payloadString
    };
};


const initiateOnboarding = async (payload) => {
    try {
        console.log("Zupay Initiate Onboarding Payload:", JSON.stringify(payload, null, 2));
        const path = '/v1/submerchant/onboarding/aeps/initiateOnboarding';
        const { headers, payloadString } = getRequestConfig('POST', path, payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}${path}`,
            payloadString,
            { headers }
        );
        console.log("payload", payload)
        console.log("response", response.data)
        return response.data;
    } catch (error) {
        console.error('Error Zupay initiateOnboarding:', error.response ? error.response.data : error.message);
        return error.response ? error.response.data : { errors: [{ error_message: error.message }], meta: { message: error.message, status: false } };
    }
};

const verifyOTP = async (payload) => {
    try {
        const path = '/v1/submerchant/onboarding/aeps/verifyOTP';
        const { headers, payloadString } = getRequestConfig('POST', path, payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}${path}`,
            payloadString,
            { headers }
        );
        console.log("payload", payload);
        console.log("response", response.data);
        return response.data;
    } catch (error) {
        console.error('Error Zupay verifyOTP:', error.response ? error.response.data : error.message);
        return error.response ? error.response.data : { errors: [{ error_message: error.message }], meta: { message: error.message, status: false } };
    }
};

const resendOTP = async (payload) => {
    try {
        const path = '/v1/submerchant/onboarding/aeps/resendOTP';
        const { headers, payloadString } = getRequestConfig('POST', path, payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}${path}`,
            payloadString,
            { headers }
        );
        console.log("payload", payload);
        console.log("response", response.data);
        return response.data;
    } catch (error) {
        console.error('Error Zupay resendOTP:', error.response ? error.response.data : error.message);
        return error.response ? error.response.data : { errors: [{ error_message: error.message }], meta: { message: error.message, status: false } };
    }
};

const biometricVerification = async (payload) => {
    try {
        console.log("Zupay Biometric Verification Payload:", JSON.stringify(payload, null, 2));
        const path = '/v1/submerchant/onboarding/aeps/biometricVerification';
        const { headers, payloadString } = getRequestConfig('POST', path, payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}${path}`,
            payloadString,
            { headers }
        );
        console.log("payload", payload);
        console.log("response", response.data);
        return response.data;
    } catch (error) {
        console.error('Error Zupay biometricVerification:', error.response ? error.response.data : error.message);
        return error.response ? error.response.data : { errors: [{ error_message: error.message }], meta: { message: error.message, status: false } };
    }
};

const statusCheck = async (payload) => {
    try {
        const path = '/v1/submerchant/onboarding/aeps/statusCheck';
        const { headers, payloadString } = getRequestConfig('POST', path, payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}${path}`,
            payloadString,
            { headers }
        );
        console.log("payload", payload);
        console.log("response", response.data);
        return response.data;
    } catch (error) {
        console.error('Error Zupay statusCheck:', error.response ? error.response.data : error.message);
        return error.response ? error.response.data : { errors: [{ error_message: error.message }], meta: { message: error.message, status: false } };
    }
};

const aeps2FA = async (payload) => {
    try {
        console.log("Zupay AEPS 2FA Payload:", JSON.stringify(payload, null, 2));
        const path = '/v1/transactions';
        const { headers, payloadString } = getRequestConfig('POST', path, payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}${path}`,
            payloadString,
            { headers }
        );
        console.log("response", response.data);
        return response.data;
    } catch (error) {
        const errorData = error.response ? error.response.data : { message: error.message };
        console.error('Error Zupay aeps2FA Status:', error.response?.status);
        console.error('Error Zupay aeps2FA Body:', JSON.stringify(errorData, null, 2));
        return error.response ? error.response.data : { errors: [{ error_message: error.message }], meta: { message: error.message, status: false } };
    }
};

const cashWithdrawal = async (payload) => {
    try {
        console.log("Zupay AEPS CW Payload:", JSON.stringify(payload, null, 2));
        const path = '/v1/transactions';
        const { headers, payloadString } = getRequestConfig('POST', path, payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}${path}`,
            payloadString,
            { headers }
        );
        console.log("response", response);
        console.log("Zupay AEPS CW Response Data:", JSON.stringify(response.data, null, 2));
        return response.data;
    } catch (error) {
        const errorData = error.response ? error.response.data : { message: error.message };
        console.error('Error Zupay cashWithdrawal Status:', error.response?.status);
        console.error('Error Zupay cashWithdrawal Body:', JSON.stringify(errorData, null, 2));
        return error.response ? error.response.data : { errors: [{ error_message: error.message }], meta: { message: error.message, status: false } };
    }
};

const balanceEnquiry = async (payload) => {
    try {
        const path = '/v1/transactions';
        const { headers, payloadString } = getRequestConfig('POST', path, payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}${path}`,
            payloadString,
            { headers }
        );
        console.log("Zupay AEPS BE Response Data:", JSON.stringify(response.data, null, 2));
        return response.data;
    } catch (error) {
        const errorData = error.response ? error.response.data : { message: error.message };
        console.error('Error Zupay balanceEnquiry Status:', error.response?.status);
        console.error('Error Zupay balanceEnquiry Body:', JSON.stringify(errorData, null, 2));
        return error.response ? error.response.data : { errors: [{ error_message: error.message }], meta: { message: error.message, status: false } };
    }
};

const miniStatement = async (payload) => {
    try {
        const path = '/v1/transactions';
        const { headers, payloadString } = getRequestConfig('POST', path, payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}${path}`,
            payloadString,
            { headers }
        );
        console.log("Zupay AEPS MS Response Data:", JSON.stringify(response.data, null, 2));
        return response.data;
    } catch (error) {
        const errorData = error.response ? error.response.data : { message: error.message };
        console.error('Error Zupay miniStatement Status:', error.response?.status);
        console.error('Error Zupay miniStatement Body:', JSON.stringify(errorData, null, 2));
        return error.response ? error.response.data : { errors: [{ error_message: error.message }], meta: { message: error.message, status: false } };
    }
};

const reconcile = async (payload) => {
    try {
        console.log("Payload", payload)
        const path = '/v1/recon/reconcile';
        const { headers, payloadString } = getRequestConfig('POST', path, payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}${path}`,
            payloadString,
            { headers }
        );
        console.log("Zupay AEPS Recon Response Data:", JSON.stringify(response.data, null, 2));
        return response.data;
    } catch (error) {
        const errorData = error.response ? error.response.data : { message: error.message };
        console.error('Error Zupay reconcile Status:', error.response?.status);
        console.error('Error Zupay reconcile Body:', JSON.stringify(errorData, null, 2));
        return error.response ? error.response.data : { errors: [{ error_message: error.message }], meta: { message: error.message, status: false } };
    }
};

module.exports = {
    initiateOnboarding,
    verifyOTP,
    resendOTP,
    biometricVerification,
    statusCheck,
    aeps2FA,
    cashWithdrawal,
    balanceEnquiry,
    miniStatement,
    reconcile
};

