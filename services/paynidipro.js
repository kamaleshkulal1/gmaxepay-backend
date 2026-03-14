const axios = require('axios');
const doSettlement = async (data) => {
    const paynidiproUrl = process.env.PAYINDIPRO_URL;
    const apiKey = process.env.PAYINDIPRO_API_KEY;
    const token = process.env.PAYINDIPRO_TOKEN;

    if (!paynidiproUrl || !apiKey || !token) {
        console.error("[Paynidipro] Configuration missing. Please check .env file.");
        return { status: false, message: "Service configuration missing (URL, API Key, or Token)" };
    }

    try {
        const payload = {
            benIFSC: data.benIFSC,
            benAccount: data.benAccount,
            benName: data.benName,
            amount: data.amount,
            benMobile: data.benMobile,
            bankName: data.bankName,
            agentId: data.agentId,
            dmtMode: data.dmtMode || 1
        };

        const config = {
            method: 'post',
            url: `${paynidiproUrl}/ApiUser/doSettlement`,
            headers: {
                'Content-Type': 'application/json',
                'X-Customer-Id': apiKey,
                'X-Token': token
            },
            data: payload
        };

        const response = await axios.request(config);
        console.log('Paynidipro Response Data:', JSON.stringify(response.data));

        return response.data;
    } catch (error) {
        console.error("[Paynidipro] Error:", error.response?.data || error.message);
        return error.response?.data || { status: false, message: error.message };
    }
};

module.exports = {
    doSettlement
};
