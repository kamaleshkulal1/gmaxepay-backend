const axios = require('axios');
const crypto = require('crypto');

const zuelpayUrl = process.env.ZUELPAY_URL;
const ZUELPAY_TOKEN = process.env.ZUELPAY_TOKEN;
const ZUELPAY_MOBILE_NO = process.env.ZUELPAY_MOBILE_NO;
const ZUELPAY_ACCOUNT_PASSWORD = process.env.ZUELPAY_ACCOUNT_PASSWORD;
const generateChecksum = () => {
    const stringToHash = `${ZUELPAY_TOKEN}:${ZUELPAY_MOBILE_NO}`;
    const hmac = crypto.createHmac('sha256', ZUELPAY_ACCOUNT_PASSWORD);
    hmac.update(stringToHash);
    return hmac.digest('hex');
};

const checkZuelpayBalance = async () => {
    try {
        const checkSum = generateChecksum();
        const response = await axios.post(`${zuelpayUrl}/account/balance`, {}, {
            headers: {
                'Token': ZUELPAY_TOKEN,
                'checkSum': checkSum
            }
        });
        return response.data;
    } catch (error) {
        console.error("Error checking Zuelpay balance:", error.response ? error.response.data : error.message);
        throw error;
    }
};

const payoutPayment = async (data) => {
    try {
        const checkSum = generateChecksum();
        const { account, account_name, agent_id, amount, ifsc, email, mobile, remark, payment_type } = data;
        const response = await axios.post(`${zuelpayUrl}/finance/payout/payment`, {
            account,
            account_name,
            agent_id,
            amount: amount.toString(),
            ifsc,
            email,
            mobile,
            remark,
            payment_type
        }, {
            headers: {
                'Token': ZUELPAY_TOKEN,
                'checkSum': checkSum
            }
        });
        return response.data;
    } catch (error) {
        console.error("Error Zuelpay Payout Payment:", error.response ? error.response.data : error.message);
        throw error;
    }
};

const checkUpiStatus = async (agent_id) => {
    try {
        const checkSum = generateChecksum();
        const response = await axios.get(`${zuelpayUrl}/finance/upi/status?agent_id=${agent_id}`, {
            headers: {
                'Token': ZUELPAY_TOKEN,
                'checkSum': checkSum
            }
        });
        return response.data;
    } catch (error) {
        console.error("Error checking Zuelpay UPI status:", error.response ? error.response.data : error.message);
        throw error;
    }
};

module.exports = {
    generateChecksum,
    checkZuelpayBalance,
    payoutPayment,
    checkUpiStatus
};
