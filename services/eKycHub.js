const axios = require('axios');
const ekychubUrl = process.env.EKYCHUB_URL;
const inspayUrl = process.env.INSPAY_URL;
const inspayUsername = process.env.INSPAY_USERNAME;
const inspayToken = process.env.INSPAY_TOKEN;
const username = process.env.EKYCHUB_USERNAME;
const token = process.env.EKYCHUB_TOKEN;

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
    console.log('config', config);
    return axios
      .request(config)
      .then((response) => {
        console.log('response', response);
        console.log('response', response.data);
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
  // Set timeout to 60 seconds (60000ms) for bank verification as it can take longer
  const BANK_VERIFICATION_TIMEOUT = Number(process.env.EKYCHUB_BANK_VERIFICATION_TIMEOUT_MS || 60000);
  
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
    timeout: BANK_VERIFICATION_TIMEOUT
  }
  return axios
    .request(config)
    .then((response) => {
      return response.data;
    })
    .catch((error) => {
      // Handle timeout errors specifically
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.error('Bank verification timeout:', error.message);
        return {
          status: 'Failure',
          'Account Number': account_number,
          'Ifsc Code': ifsc,
          nameAtBank: null,
          utr: null,
          message: `Error contacting verification server: ${error.message}`,
          txid: orderid
        };
      }
      
      // Handle network errors
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        console.error('Bank verification network error:', error.code, error.message);
        return {
          status: 'Failure',
          'Account Number': account_number,
          'Ifsc Code': ifsc,
          nameAtBank: null,
          utr: null,
          message: `Error contacting verification server: ${error.message || error.code}`,
          txid: orderid
        };
      }
      
      // Handle response errors (API returned error status)
      if (error.response && error.response.data) {
        return error.response.data;
      }
      
      // Handle other errors
      console.error('Bank verification error:', error.message);
      return {
        status: 'Failure',
        'Account Number': account_number,
        'Ifsc Code': ifsc,
        nameAtBank: null,
        utr: null,
        message: `Error during bank verification: ${error.message}`,
        txid: orderid
      };
    });
}


const panCardCorrection = async (number, mode) => {
  const orderid = generateSystemReference();
  const url = `${inspayUrl}/nsdl/correction?`;
    let config = {
    method: 'get',
    url: url,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      username: inspayUsername,
      token: inspayToken,
      number,
      mode,
      orderid,
    }
  }
  return axios
    .request(config)
    .then((response) => {
      console.log("request", response)
      console.log("response", response.data);
      return response.data;
    })
    .catch((error) => {
      console.log("error", error.response.data);
      return error.response.data;
    });
}

const panCardNew = async (number, mode) => {
  const orderid = generateSystemReference();
  const url = `${inspayUrl}/nsdl/new_pan?`;
  let config = {
    method: 'get',
    url: url,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      username: inspayUsername,
      token: inspayToken,
      number,
      mode,
      orderid
    }
  }
  return axios
  .request(config)
  .then((response) => {
    console.log("response", response)
    console.log("response", response.data);
    return response.data;
  })
  .catch((error) => {
    return error.response.data;
  });
}
module.exports = {
  createAadharVerificationUrl,
  createPanVerificationUrl,
  getDocuments,
  balanceEnquiry,
  panVerification,
  bankVerification,
  panCardCorrection,
  panCardNew
}