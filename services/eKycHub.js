const axios = require('axios');
const ekychubUrl = process.env.EKYCHUB_URL;
const username = process.env.EKYCHUB_USERNAME;
const token = process.env.EKYCHUB_TOKEN;
const redirect_url = process.env.EKYCHUB_REDIRECT_URL;
const {generateSystemReference} = require('../utils/generateSystemReferenceNumber');

const  balanceEnquiry = async () => {
  let config = {
    method: 'get',
    url: `${ekychubUrl}/verification/balance?`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      username,
      token
    }
  }
  return axios
    .request(config)
    .then((response) => {
      console.log(response.data);
      return response.data;
    })
    .catch((error) => {
      console.log(error.response);
      return error.response.data;
    });
}

const createAadharVerificationUrl = async () => {
    let config = {
      method: 'get',
      url: `${ekychubUrl}/digilocker/create_url_aadhaar?`,
      headers: {
        'Content-Type': 'application/json'
      },
      params: {
        username,
        token,
        redirect_url,
        orderid
      }
    };
  
    return axios
      .request(config)
      .then((response) => {
        console.log(response.data);
        return response.data;
      })
      .catch((error) => {
        console.log(error.response);
        return error.response.data;
      });
};

const createPanVerificationUrl = async () => {
    let config = {
      method: 'get',
      url: `${ekychubUrl}/digilocker/create_url_pan?`,
      headers: {
        'Content-Type': 'application/json'
      },
      params: {
        username,
        token,
        redirect_url,
        orderid
      }
    };
    return axios
      .request(config)
      .then((response) => {
        console.log(response.data);
        return response.data;
      })
      .catch((error) => {
        console.log(error.response);
        return error.response.data;
      });
}  

const getDocuments = async(verification_id, reference_id, document_type)=>{
  const orderid = generateSystemReference();
    let config = {
      method: 'get',
      url: `${ekychubUrl}/digilocker/get_documents?`,
      headers: {
        'Content-Type': 'application/json'
      },
      params: {
        username,
        token,
        orderid,
        verification_id,
        reference_id,
        document_type
      }
    };
    return axios
      .request(config)
      .then((response) => {
        console.log(response.data);
        return response.data;
      })
      .catch((error) => {
        console.log(error.response);
        return error.response.data;
      });
 }

const panVerification = async (pan) => {
    const orderid = generateSystemReference();
    let config = {
      method: 'get',
      url: `${ekychubUrl}/verification/pan_verification?`,
      headers: {
        'Content-Type': 'application/json'
      },
      params: {
        username,
        token,
        pan,
        orderid
      }
    }
    return axios
      .request(config)
      .then((response) => {
        return response.data;
      })
      .catch((error) => {
        console.log(error.response);
        return error.response.data;
      });   
}

const bankVerification = async (account_number, ifsc) => {
  const orderid = generateSystemReference();
    let config = {
      method: 'get',
      url: `${ekychubUrl}/verification/penny_less?`,
      headers: {
        'Content-Type': 'application/json'
      },
      params: {
        username,
        token,
        account_number,
        ifsc,
        orderid
      }
    }
    return axios
      .request(config)
      .then((response) => {
        return response.data;
      })
      .catch((error) => { 
        console.log(error.response);
        return error.response.data;
      });
}

module.exports = {
    createAadharVerificationUrl,
    createPanVerificationUrl,
    getDocuments,
    balanceEnquiry,
    panVerification,
    bankVerification
}