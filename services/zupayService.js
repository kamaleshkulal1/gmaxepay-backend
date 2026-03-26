const axios = require('axios');
const crypto = require('crypto');

const ZUPAY_BASE_URL = process.env.ZUPAY_BASE_URL;
const ZUPAY_API_KEY = process.env.ZUPAY_API_KEY;
const ZUPAY_API_SECRET = process.env.ZUPAY_API_SECRET;
const ZUPAY_CLIENT_ID = process.env.ZUPAY_CLIENT_ID;
const ZUPAY_SIGNATURE = process.env.ZUPAY_SIGNATURE;


const generateSignature = (method, path, timestamp, payloadString) => {
    if (!ZUPAY_SIGNATURE) return '';

    let bodyHash = "";
    if (payloadString) {
        bodyHash = crypto.createHash('sha256').update(payloadString).digest('base64');
    }

    let stringToSign = method.toUpperCase() + "\n" + path + "\n";
    // if (query) stringToSign += query + "\n"; 
    if (bodyHash) {
        stringToSign += bodyHash + "\n";
    }
    stringToSign += timestamp;

    return crypto.createHmac('sha256', ZUPAY_SIGNATURE)
        .update(stringToSign)
        .digest('base64');
};

const getRequestConfig = (method, path, payload) => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payloadString = payload ? JSON.stringify(payload) : '';

    const signature = generateSignature(method, path, timestamp, payloadString);

    return {
        headers: {
            'Content-Type': 'application/json',
            'X-Client-Id': ZUPAY_CLIENT_ID,
            'X-Signature': signature,
            'X-Timestamp': timestamp
        },
        payloadString
    };
};

const initiateOnboarding = async (payload) => {
    try {
        const path = '/v1/submerchant/onboarding/aeps/initiateOnboarding';
        const { headers, payloadString } = getRequestConfig('POST', path, payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}${path}`,
            payloadString,
            { headers }
        );
        console.log("response", response.data)
        return response.data;
    } catch (error) {
        console.error('Error Zupay initiateOnboarding:', error.response ? error.response.data : error.message);
        throw error;
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
        console.log("response", response.data);
        return response.data;
    } catch (error) {
        console.error('Error Zupay verifyOTP:', error.response ? error.response.data : error.message);
        throw error;
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
        console.log("response", response.data);
        return response.data;
    } catch (error) {
        console.error('Error Zupay resendOTP:', error.response ? error.response.data : error.message);
        throw error;
    }
};

const biometricVerification = async (payload) => {
    try {
        const path = '/v1/submerchant/onboarding/aeps/biometricVerification';
        const { headers, payloadString } = getRequestConfig('POST', path, payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}${path}`,
            payloadString,
            { headers }
        );
        console.log("response", response.data);
        return response.data;
    } catch (error) {
        console.error('Error Zupay biometricVerification:', error.response ? error.response.data : error.message);
        throw error;
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
        console.log("response", response.data);
        return response.data;
    } catch (error) {
        console.error('Error Zupay statusCheck:', error.response ? error.response.data : error.message);
        throw error;
    }
};

const aeps2FA = async (payload) => {
    try {
        const path = '/api/v1/transactions';
        const { headers, payloadString } = getRequestConfig('POST', path, payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}${path}`,
            payloadString,
            { headers }
        );
        console.log("response", response.data);
        return response.data;
    } catch (error) {
        console.error('Error Zupay aeps2FA:', error.response ? error.response.data : error.message);
        throw error;
    }
};

const cashWithdrawal = async (payload) => {
    try {
        const path = '/api/v1/transactions';
        const { headers, payloadString } = getRequestConfig('POST', path, payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}${path}`,
            payloadString,
            { headers }
        );
        console.log("response", response.data);
        return response.data;
    } catch (error) {
        console.error('Error Zupay cashWithdrawal:', error.response ? error.response.data : error.message);
        throw error;
    }
};

const balanceEnquiry = async (payload) => {
    try {
        const path = '/api/v1/transactions';
        const { headers, payloadString } = getRequestConfig('POST', path, payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}${path}`,
            payloadString,
            { headers }
        );
        console.log("response", response.data);
        return response.data;
    } catch (error) {
        console.error('Error Zupay balanceEnquiry:', error.response ? error.response.data : error.message);
        throw error;
    }
};

const miniStatement = async (payload) => {
    try {
        const path = '/api/v1/transactions';
        const { headers, payloadString } = getRequestConfig('POST', path, payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}${path}`,
            payloadString,
            { headers }
        );
        console.log("response", response.data);
        return response.data;
    } catch (error) {
        console.error('Error Zupay miniStatement:', error.response ? error.response.data : error.message);
        throw error;
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
    miniStatement
};
