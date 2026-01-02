const axios = require('axios');
const ekychubUrl = process.env.EKYCHUB_URL;
const username = process.env.EKYCHUB_USERNAME;
const token = process.env.EKYCHUB_TOKEN;

const { generateSystemReference } = require('../utils/generateSystemReferenceNumber');

const operatorFetch = async (mobile) => {
  const orderid = generateSystemReference();
  let config = {
    method: 'get',
    url: `${ekychubUrl}/verification/operator_fetch?`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      username,
      token,
      mobile,
      orderid
    }
  };
  
  return axios
    .request(config)
    .then((response) => {
      return response.data;
    })
    .catch((error) => {
      console.log(error.response);
      return error.response ? error.response.data : error.message;
    });
};

module.exports = {
  operatorFetch
};

