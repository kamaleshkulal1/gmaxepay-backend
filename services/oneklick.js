const axios = require('axios');

const createContact = async (data) => {
    try {
        const response = await axios.post(`${process.env.ONEKLICK_URL}/extends/createContact`, data, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ONEKLICK_API_KEY,
                'x-api-token': process.env.ONEKLICK_SECRET_KEY
            }
        });
        return response.data;
    } catch (error) {
        throw error;
    }
};

const initiatePayout = async (data) => {
    try {
        const response = await axios.post(`${process.env.ONEKLICK_URL}/extends/initiatePayout`, data, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ONEKLICK_API_KEY,
                'x-api-token': process.env.ONEKLICK_SECRET_KEY
            }
        });
        return response.data;
    } catch (error) {
        throw error;
    }
};

const checkStatus = async (data) => {
    try {
        const response = await axios.post(`${process.env.ONEKLICK_URL}/extends/checkStatus`, data, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ONEKLICK_API_KEY,
                'x-api-token': process.env.ONEKLICK_SECRET_KEY
            }
        });
        return response.data;
    } catch (error) {
        throw error;
    }
};

module.exports = {
    createContact,
    initiatePayout,
    checkStatus
};
