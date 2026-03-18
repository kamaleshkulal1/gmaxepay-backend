const axios = require('axios');
const jwt = require('jsonwebtoken');
const secret = process.env.PRACTOMIND_SECRET_KEY;
const apikey = process.env.PRACTOMIND_API_KEY;
const apiUrl = process.env.PRACTOMIND_BASE_URL;
const initiateAirtelCms = async (referenceId) => {
    try {
        const payload = { referenceId };
        const token = jwt.sign(payload, secret, { algorithm: 'HS256', noTimestamp: true });
        const config = {
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            }
        };

        const response = await axios.post(`${apiUrl}/payapi/airtelcms`, {
            Apikey: apikey
        }, config);

        console.log("Response", response)
        return response.data;

    } catch (error) {
        console.error('Error in initiateAirtelCms service:', error.response?.data || error.message);
        return error.response?.data || { status: false, message: error.message };
    }
};

module.exports = {
    initiateAirtelCms
};
