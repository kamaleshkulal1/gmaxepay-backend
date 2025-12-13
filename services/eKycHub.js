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

const createAadharVerificationUrl = async (redirect_url) => {
  const orderid = generateSystemReference();
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
        return response.data;
      })
      .catch((error) => {
        return error.response.data;
      });
};

const createPanVerificationUrl = async (redirect_url) => {
  const orderid = generateSystemReference();
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
        return response.data;
      })
      .catch((error) => {
        return error.response.data;
      });
}  

const getDocuments = async(verification_id, reference_id, document_type)=>{
  const orderid = generateSystemReference();
    let config = {
      method: 'get',
      url: `${ekychubUrl}/digilocker/get_document?`,
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
        return response.data;
      })
      .catch((error) => {
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
    // Set timeout to 30 seconds for bank verification (penny drop can take longer)
    const timeout = Number(process.env.EKYCHUB_BANK_VERIFICATION_TIMEOUT_MS || 30000);
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
      },
      timeout: timeout
    }
    return axios
      .request(config)
      .then((response) => {
        return response.data;
      })
      .catch((error) => {
        // Handle timeout and network errors
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          return {
            status: 'Failure',
            message: `Bank verification request timed out after ${timeout}ms. Please try again.`,
            'Account Number': account_number,
            'Ifsc Code': ifsc,
            nameAtBank: null,
            error: 'TIMEOUT'
          };
        }
        // Handle cases where error.response might not exist
        if (error.response && error.response.data) {
          return error.response.data;
        }
        // Return a structured error response for other cases
        return {
          status: 'Failure',
          message: error.message || 'Bank verification service error',
          'Account Number': account_number,
          'Ifsc Code': ifsc,
          nameAtBank: null,
          error: 'SERVICE_ERROR'
        };
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