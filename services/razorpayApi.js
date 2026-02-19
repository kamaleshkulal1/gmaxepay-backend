const axios = require('axios');
const razorpayUrl = process.env.RAZORPAY_IFSC_URL;
const bankDetails = async (ifsc) => {
    try {
        const response = await axios.get(`${razorpayUrl}/${ifsc.trim()}`);
        console.log("reponse ifsc Code", ifsc);
        console.log(response.data);
        return response.data;
    } catch (error) {
        console.error(error); // Suppress verbose error logging for 404s
        return null;
    }
}

module.exports = {
    bankDetails
}