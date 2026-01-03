const axios = require('axios');
const ekychubUrl = process.env.EKYCHUB_URL;
const rechargeUrl = process.env.INSPAY_RECHARGE_URL;
const inspayUsername = process.env.INSPAY_USERNAME;
const inspayToken = process.env.INSPAY_TOKEN;
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
      console.log('response', response);
      console.log(response.data);
      return response.data;
    })
    .catch((error) => {
      console.log(error.response);
      return error.response ? error.response.data : error.message;
    });
};

const rechargePlanFetch = async (mobile,opcode,circle) => {
  const orderid = generateSystemReference();
  let config = {
    method: 'get',
    url: `${ekychubUrl}/verification/operator_plan_fetch?`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      username,
      token,
      mobile,
      opcode,
      circle,
      orderid
    }
  }; 
  return axios
    .request(config)
    .then((response) => {
      console.log('response', response);
      console.log(response.data);
      return response.data;
    })
    .catch((error) => {
      console.log(error.response);
      return error.response ? error.response.data : error.message;
    });
};

const RechargeOfferFetch = async (mobile,opcode,circle) => {  
  const orderid = generateSystemReference();
  let config = {
    method: 'get',
    url: `${ekychubUrl}/verification/r_offer?`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      username,
      token,
      mobile,
      opcode,
      circle,
      orderid
    }
  };
  return axios
    .request(config)
    .then((response) => {
      console.log('response', response);
      console.log(response.data);
      return response.data;
    })
    .catch((error) => {
      console.log(error.response);
      return error.response ? error.response.data : error.message;
    });
};  

const Recharge = async (mobile, opcode, amount,value1, value2, value3, value4) => {
  const orderid = generateSystemReference();
  let config = {
    method: 'get',
    url: `${rechargeUrl}/recharge/api`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      username: inspayUsername,
      token: inspayToken,
      opcode,
      number: mobile,
      amount,
      orderid,
      format: 'json',
      ...(value1 && { value1 }),
      ...(value2 && { value2 }),
      ...(value3 && { value3 }),
      ...(value4 && { value4 })
    }
  };
  
  return axios
    .request(config)
    .then((response) => {
      console.log('recharge response', response);
      console.log(response.data);
      return {
        ...response.data,
        orderid: response.data.orderid || orderid
      };
    })
    .catch((error) => {
      console.log(error.response);
      const errorResponse = error.response ? error.response.data : { message: error.message };
      return {
        ...errorResponse,
        orderid: orderid,
        status: errorResponse.status || 'Failure'
      };
    });
};


const DTHPlanFetch = async (dth_number,opcode) => {
  const orderid = generateSystemReference();
  let config = {
    method: 'get',
    url: `${ekychubUrl}/verification/dth_plan_fetch?`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      username,
      token,
      opcode,
      dth_number,
      orderid
    }
  };
  return axios
    .request(config)
    .then((response) => {
      console.log('response', response);
      console.log(response.data);
      return response.data;
    })
    .catch((error) => {
      console.log(error.response);
      return error.response ? error.response.data : error.message;
    });
};

const DTHCustomerInfo = async (dth_number,opcode) => {
  const orderid = generateSystemReference();
  let config = {
    method: 'get',
    url: `${ekychubUrl}/verification/dth_info?`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      username,
      token,
      opcode,
      dth_number,
      orderid
    }
  };
  return axios
    .request(config)
    .then((response) => {
      console.log('response', response);
      console.log(response.data);
      return response.data;
    })
    .catch((error) => {
      console.log(error.response);
      return error.response ? error.response.data : error.message;
    });
};
    
module.exports = {
  operatorFetch,
  rechargePlanFetch,
  RechargeOfferFetch,
  Recharge,
  DTHPlanFetch,
  DTHCustomerInfo
};

