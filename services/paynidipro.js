const axios = require('axios');
const doSettlement = async (data) => {
    const paynidiproUrl = (process.env.PAYINDIPRO_URL || '').trim();
    const apiKey = (process.env.PAYINDIPRO_API_KEY || '').trim();
    const token = (process.env.PAYINDIPRO_TOKEN || '').trim();

    if (!paynidiproUrl || !apiKey || !token) {
        console.error("[Paynidipro] Configuration missing. Please check .env file.");
        return { status: false, message: "Service configuration missing (URL, API Key, or Token)" };
    }

    try {
        const payload = {
            benIFSC: data.benIFSC,
            benAccount: data.benAccount,
            benName: data.benName,
            amount: Number(data.amount),
            benMobile: data.benMobile,
            bankName: data.bankName,
            agentId: data.agentId,
            dmtMode: Number(data.dmtMode || 1)
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

        console.log(`[Paynidipro] Sending Request to: ${config.url}`);
        console.log(`[Paynidipro] Headers: Content-Type: ${config.headers['Content-Type']}, X-Customer-Id: ${apiKey.substring(0, 4)}... (Length: ${apiKey.length}), X-Token: ${token.substring(0, 4)}... (Length: ${token.length})`);
        console.log(`[Paynidipro] Payload: ${JSON.stringify(payload)}`);

        const response = await axios.request(config);
        console.log('[Paynidipro] Response Data:', JSON.stringify(response.data));

        return response.data;
    } catch (error) {
        console.error("[Paynidipro] Error Details:", {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
        return error.response?.data || { status: false, message: error.message };
    }
};

module.exports = {
    doSettlement
};
