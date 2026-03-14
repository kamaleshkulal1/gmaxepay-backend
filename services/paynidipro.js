const axios = require('axios');
const paynidiproUrl = process.env.PAYINDIPRO_URL;
const doSettlement = async (data) => {
    try {
        const config = {
            method: 'post',
            url: `${paynidiproUrl}/ApiUser/doSettlement`,
            headers: {
                'Content-Type': 'application/json',
                'X-Customer-Id': process.env.PAYINDIPRO_API_KEY,
                'X-Token': process.env.PAYINDIPRO_TOKEN
            },
            data: {
                benIFSC: data.benIFSC,
                benAccount: data.benAccount,
                benName: data.benName,
                amount: data.amount,
                benMobile: data.benMobile,
                bankName: data.bankName,
                agentId: data.agentId,
                dmtMode: data.dmtMode || 1
            }
        };

        const response = await axios.request(config);
        console.log('Paynidipro Payout Response:', response.data);
        return response.data;
    } catch (error) {
        console.error("Paynidipro Error:", error.response?.data || error.message);
        return error.response?.data || { status: false, message: error.message };
    }
};

module.exports = {
    doSettlement
};
