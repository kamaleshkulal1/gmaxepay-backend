const axios = require('axios');
const razorpayUrl = process.env.RAZORPAY_IFSC_URL;
const bankDetails = async (ifsc) => {
    try{
        const response = await axios.get(`${razorpayUrl}/${ifsc.trim()}`);
        return response.data;
    }catch(error){
        console.error(error);
        return error.response.data;
    }
}

module.exports = {
  bankDetails
}