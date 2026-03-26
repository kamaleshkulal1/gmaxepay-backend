const axios = require('axios');
const crypto = require('crypto');

const ZUPAY_BASE_URL = process.env.ZUPAY_BASE_URL;
const ZUPAY_API_KEY = process.env.ZUPAY_API_KEY;
const ZUPAY_API_SECRET = process.env.ZUPAY_API_SECRET;
const ZUPAY_CLIENT_ID = process.env.ZUPAY_CLIENT_ID;
const ZUPAY_SIGNATURE = process.env.ZUPAY_SIGNATURE;

const sortObject = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sortObject);
    return Object.keys(obj).sort().reduce((acc, key) => {
        acc[key] = sortObject(obj[key]);
        return acc;
    }, {});
};

const generateSignature = (timestamp, payloadString) => {
    if (!ZUPAY_SIGNATURE) return '';
    const data = timestamp + payloadString;
    return crypto.createHmac('sha256', ZUPAY_SIGNATURE).update(data).digest('hex');
};

const getRequestConfig = (payload) => {
    const timestamp = new Date().toISOString();
    const sortedPayload = sortObject(payload);
    const payloadString = payload ? JSON.stringify(sortedPayload) : '';

    const signature = generateSignature(timestamp, payloadString);

    return {
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': ZUPAY_API_KEY,
            'X-API-Secret': ZUPAY_API_SECRET,
            'X-Client-Id': ZUPAY_CLIENT_ID,
            'X-Signature': signature,
            'X-Timestamp': timestamp
        },
        payloadString
    };
};

const initiateOnboarding = async (payload) => {
    try {
        const { headers, payloadString } = getRequestConfig(payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}/v1/submerchant/onboarding/aeps/initiateOnboarding`,
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
        const { headers, payloadString } = getRequestConfig(payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}/v1/submerchant/onboarding/aeps/verifyOTP`,
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
        const { headers, payloadString } = getRequestConfig(payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}/v1/submerchant/onboarding/aeps/resendOTP`,
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
        const { headers, payloadString } = getRequestConfig(payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}/v1/submerchant/onboarding/aeps/biometricVerification`,
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
        const { headers, payloadString } = getRequestConfig(payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}/v1/submerchant/onboarding/aeps/statusCheck`,
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
        const { headers, payloadString } = getRequestConfig(payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}/api/v1/transactions`,
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
        const { headers, payloadString } = getRequestConfig(payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}/api/v1/transactions`,
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
        const { headers, payloadString } = getRequestConfig(payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}/api/v1/transactions`,
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
        const { headers, payloadString } = getRequestConfig(payload);
        const response = await axios.post(
            `${ZUPAY_BASE_URL}/api/v1/transactions`,
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
