const axios = require('axios');
const amezesmsUrl = process.env.AMEZESMS_URL;
const amezesmsKey = process.env.AMEZESMS_AUTHKEY;
const amezesmsSenderId = process.env.AMEZESMS_SENDERID;
const amezesmsentityid = process.env.AMEZESMA_ENTITYID;
const amezesmstemplateidotp = process.env.AMEZESMA_TEMPLATEIDOTP;
const amezesmstemplateidSuccess = process.env.AMEZESMA_TEMPLATEIDSUCCESS;
const amezesmstemplateidLogin = process.env.AMEZESMA_TEMPLATEIDLOGIN;
const amezesmstemplateidBbpsPaymentSucess =
  process.env.AMEZESMA_TEMPLATEIDBBPPAYMENTSSUCESS;
const amezesmstemplateidBbpsComplaintSucess =
  process.env.AMEZESMA_TEMPLATEIDBBPSCOMPLAINTSUCESS;

const sendSmsOtp = async (mobileNo, msg) => {
  let config = {
    method: 'get',
    url: `${amezesmsUrl}`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      user: 'Gmaxepay',
      authkey: amezesmsKey,
      sender: amezesmsSenderId,
      mobile: mobileNo,
      text: msg,
      entityid: amezesmsentityid,
      templateid: amezesmstemplateidotp,
      rpt: 0
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

const sendSmsSuccess = async (mobileNo, url) => {
  let config = {
    method: 'get',
    url: `${amezesmsUrl}`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      user: 'Gmaxepay',
      authkey: amezesmsKey,
      sender: amezesmsSenderId,
      mobile: mobileNo,
      text: url,
      entityid: amezesmsentityid,
      templateid: amezesmstemplateidSuccess,
      rpt: 0
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

const sendSmsLogin = async (mobileNo, url) => {
  // Security: OTP logging removed for protection
  let config = {
    method: 'get',
    url: `${amezesmsUrl}`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      user: 'Gmaxepay',
      authkey: amezesmsKey,
      sender: amezesmsSenderId,
      mobile: mobileNo,
      text: url,
      entityid: amezesmsentityid,
      templateid: amezesmstemplateidLogin,
      rpt: 0
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

const sendBbpsPaymentSucess = async (mobileNo, url) => {
  let config = {
    method: 'get',
    url: `${amezesmsUrl}`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      user: 'Gmaxepay',
      authkey: amezesmsKey,
      sender: amezesmsSenderId,
      mobile: mobileNo,
      text: url,
      entityid: amezesmsentityid,
      templateid: amezesmstemplateidBbpsPaymentSucess,
      rpt: 0
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

const sendComplaintSms = async (mobileNo, url) => {
  let config = {
    method: 'get',
    url: `${amezesmsUrl}`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      user: 'Gmaxepay',
      authkey: amezesmsKey,
      sender: amezesmsSenderId,
      mobile: mobileNo,
      text: url,
      entityid: amezesmsentityid,
      templateid: amezesmstemplateidBbpsComplaintSucess,
      rpt: 0
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

module.exports = {
  sendSmsOtp,
  sendSmsSuccess,
  sendSmsLogin,
  sendBbpsPaymentSucess,
  sendComplaintSms
};
