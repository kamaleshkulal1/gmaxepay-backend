const axios = require('axios');
const { error } = require('winston');

const runPaisaPayoutUrl = process.env.RUNPAISA_PAYOUT_URL;
const runPaisaPayoutClientId = process.env.RUNPAISA_PAYOUT_CLIENTID;
const runPaisaClientSecretKey = process.env.RUNPAISA_CLIENT_SECRET_KEY;

const generatePayoutToken = async () => {
    let config = {
        method: 'post',
        url: `${runPaisaPayoutUrl}/token`,
        headers: {
            'content-type': 'application/json',
            client_id: runPaisaPayoutClientId,
            client_secret: runPaisaClientSecretKey
        }
    }

    return axios
        .request(config)
        .then((response) => {
            return response.data;
        })
        .catch((error) => {
            console.log(error)
            return error
        })
};


const bankTransfer = async (data) => {
    try {
        const tokenRes = await generatePayoutToken();
        console.log('RunPaisa Token Response:', tokenRes);
        console.log("tokenRes", JSON.stringify(tokenRes))
        if (tokenRes.code !== 'RP000') {
            return {
                message: "Token Generation Failed!"
            };
        }

        const config = {
            method: 'post',
            url: `${runPaisaPayoutUrl}/payment`,
            headers: {
                'Content-Type': 'application/json',
                'token': tokenRes.data.token
            },
            data: {
                account_number: data.accountNumber,
                ifsc_code: data.ifscCode,
                amount: data.amount,
                order_id: data.orderId,
                beneficiary_name: data.beneficiaryName,
                payment_mode: data.paymentMode
            }
        };

        const response = await axios.request(config);
        console.log('RunPaisa Payout Response:', response.data);
        return response.data;
    } catch (error) {
        console.log(error)
        return error;
    }
};


const bankTransferStatus = async (orderId) => {
    try {
        const tokenRes = await generatePayoutToken();
        if (tokenRes.code !== 'RP000') {
            return {
                code: 'RP001',
                status: 'FAILED',
                message: 'Token Generation Failed!'
            };
        }

        const config = {
            method: 'post',
            url: `${runPaisaPayoutUrl}/status`,
            headers: {
                'Content-Type': 'application/json',
                'token': tokenRes.data.token
            },
            data: {
                order_id: orderId
            }
        };

        const response = await axios.request(config);
        console.log('RunPaisa Status Response:', response.data);
        return response.data;
    } catch (error) {
        console.error('RunPaisa Status Error:', error.response?.data || error.message);
        return error.response?.data || { code: 'RP001', status: 'FAILED', message: error.message };
    }
};

module.exports = {
    generatePayoutToken,
    bankTransfer,
    bankTransferStatus
};
