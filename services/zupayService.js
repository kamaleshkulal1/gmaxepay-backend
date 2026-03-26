const axios = require('axios');

const ZUPAY_BASE_URL = process.env.ZUPAY_BASE_URL;
const ZUPAY_API_KEY = process.env.ZUPAY_API_KEY;
const ZUPAY_API_SECRET = process.env.ZUPAY_API_SECRET;
const ZUPAY_CLIENT_ID = process.env.ZUPAY_CLIENT_ID;

const headers = () => ({
    'Content-Type': 'application/json',
    'X-API-Key': ZUPAY_API_KEY,
    'X-API-Secret': ZUPAY_API_SECRET,
    'X-Client-Id': ZUPAY_CLIENT_ID
});

const initiateOnboarding = async (payload) => {
    try {
        const response = await axios.post(
            `${ZUPAY_BASE_URL}/v1/submerchant/onboarding/aeps/initiateOnboarding`,
            payload,
            { headers: headers() }
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
        const response = await axios.post(
            `${ZUPAY_BASE_URL}/v1/submerchant/onboarding/aeps/verifyOTP`,
            payload,
            { headers: headers() }
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
        const response = await axios.post(
            `${ZUPAY_BASE_URL}/v1/submerchant/onboarding/aeps/resendOTP`,
            payload,
            { headers: headers() }
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
        const response = await axios.post(
            `${ZUPAY_BASE_URL}/v1/submerchant/onboarding/aeps/biometricVerification`,
            payload,
            { headers: headers() }
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
        const response = await axios.post(
            `${ZUPAY_BASE_URL}/v1/submerchant/onboarding/aeps/statusCheck`,
            payload,
            { headers: headers() }
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
        const response = await axios.post(
            `${ZUPAY_BASE_URL}/api/v1/transactions`,
            payload,
            { headers: headers() }
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
        const response = await axios.post(
            `${ZUPAY_BASE_URL}/api/v1/transactions`,
            payload,
            { headers: headers() }
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
        const response = await axios.post(
            `${ZUPAY_BASE_URL}/api/v1/transactions`,
            payload,
            { headers: headers() }
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
        const response = await axios.post(
            `${ZUPAY_BASE_URL}/api/v1/transactions`,
            payload,
            { headers: headers() }
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
