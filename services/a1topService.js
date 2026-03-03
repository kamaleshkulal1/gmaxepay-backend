const axios = require('axios');

const a1topUrl = process.env.A1TOP_RECHARGE_URL;
const a1topUsername = process.env.A1TOP_USERNAME;
const a1topPwd = process.env.A1TOP_PWD;
const ekychubUrl = process.env.EKYCHUB_URL;
const ekychubUsername = process.env.EKYCHUB_USERNAME;
const ekychubToken = process.env.EKYCHUB_TOKEN;

const { generateSystemReference } = require('../utils/generateSystemReferenceNumber');

const Recharge = async (mobile, opcode, amount, circlecode, value1, value2, value3, value4, transactionId) => {
    const orderid = transactionId || generateSystemReference();
    const config = {
        method: 'get',
        url: `${a1topUrl}/recharge/api`,
        headers: { 'Content-Type': 'application/json' },
        params: {
            username: a1topUsername,
            pwd: a1topPwd,
            operatorcode: opcode,
            number: mobile,
            amount,
            orderid,
            format: 'json',
            ...(circlecode && { circlecode }),
            ...(value1 && { value1 }),
            ...(value2 && { value2 }),
            ...(value3 && { value3 }),
            ...(value4 && { value4 })
        }
    };
    console.log("config", config);

    return axios
        .request(config)
        .then((response) => {
            console.log("Recharge", response)
            console.log('[A1Top] Recharge response:', response.data);
            return {
                ...response.data,
                orderid: response.data.orderid || orderid
            };
        })
        .catch((error) => {
            console.error('[A1Top] Recharge error:', error.response?.data || error.message);
            const errorResponse = error.response ? error.response.data : { message: error.message };
            return { ...errorResponse, orderid, status: errorResponse.status || 'Failure' };
        });
};


const DTHRecharge = async (dth_number, opcode, amount, transactionId) => {
    const orderid = transactionId || generateSystemReference();
    const config = {
        method: 'get',
        url: `${a1topUrl}/recharge/api`,
        headers: { 'Content-Type': 'application/json' },
        params: {
            username: a1topUsername,
            pwd: a1topPwd,
            operatorcode: opcode,
            number: dth_number,
            amount,
            orderid,
            format: 'json'
        }
    };

    return axios
        .request(config)
        .then((response) => {
            console.log('[A1Top] DTH Recharge response:', response.data);
            return { ...response.data, orderid: response.data.orderid || orderid };
        })
        .catch((error) => {
            console.error('[A1Top] DTH Recharge error:', error.response?.data || error.message);
            const errorResponse = error.response ? error.response.data : { message: error.message };
            return { ...errorResponse, orderid, status: errorResponse.status || 'Failure' };
        });
};

const checkStatus = async (orderid) => {
    const config = {
        method: 'get',
        url: `${a1topUrl}/recharge/status`,
        headers: { 'Content-Type': 'application/json' },
        params: {
            username: a1topUsername,
            pwd: a1topPwd,
            orderid,
            format: 'json'
        }
    };

    return axios
        .request(config)
        .then((response) => {
            console.log('[A1Top] checkStatus response:', response.data);
            return response.data;
        })
        .catch((error) => {
            console.error('[A1Top] checkStatus error:', error.response?.data || error.message);
            return error.response ? error.response.data : { message: error.message };
        });
};

const checkBalance = async () => {
    const config = {
        method: 'get',
        url: `${a1topUrl}/recharge/balance`,
        headers: { 'Content-Type': 'application/json' },
        params: {
            username: a1topUsername,
            pwd: a1topPwd,
            format: 'json'
        }
    };

    return axios
        .request(config)
        .then((response) => {
            console.log('[A1Top] checkBalance response:', response.data);
            return response.data;
        })
        .catch((error) => {
            console.error('[A1Top] checkBalance error:', error.response?.data || error.message);
            return error.response ? error.response.data : { message: error.message };
        });
};


const operatorFetch = async (mobile) => {
    const orderid = generateSystemReference();
    const config = {
        method: 'get',
        url: `${ekychubUrl}/verification/operator_fetch?`,
        headers: { 'Content-Type': 'application/json' },
        params: {
            username: ekychubUsername,
            token: ekychubToken,
            mobile,
            orderid
        }
    };

    return axios
        .request(config)
        .then((response) => {
            console.log('[A1Top/ekychub] operatorFetch response:', response.data);
            return response.data;
        })
        .catch((error) => {
            console.error('[A1Top/ekychub] operatorFetch error:', error.response?.data || error.message);
            return error.response ? error.response.data : error.message;
        });
};


const rechargePlanFetch = async (mobile, opcode, circle) => {
    const orderid = generateSystemReference();
    const config = {
        method: 'get',
        url: `${ekychubUrl}/verification/operator_plan_fetch?`,
        headers: { 'Content-Type': 'application/json' },
        params: {
            username: ekychubUsername,
            token: ekychubToken,
            mobile,
            opcode,
            circle,
            orderid
        }
    };

    return axios
        .request(config)
        .then((response) => {
            console.log('[A1Top/ekychub] rechargePlanFetch response:', response.data);
            return response.data;
        })
        .catch((error) => {
            console.error('[A1Top/ekychub] rechargePlanFetch error:', error.response?.data || error.message);
            return error.response ? error.response.data : error.message;
        });
};


const RechargeOfferFetch = async (mobile, opcode, circle) => {
    const orderid = generateSystemReference();
    const config = {
        method: 'get',
        url: `${ekychubUrl}/verification/r_offer?`,
        headers: { 'Content-Type': 'application/json' },
        params: {
            username: ekychubUsername,
            token: ekychubToken,
            mobile,
            opcode,
            circle,
            orderid
        }
    };

    return axios
        .request(config)
        .then((response) => {
            console.log('[A1Top/ekychub] RechargeOfferFetch response:', response.data);
            return response.data;
        })
        .catch((error) => {
            console.error('[A1Top/ekychub] RechargeOfferFetch error:', error.response?.data || error.message);
            return error.response ? error.response.data : error.message;
        });
};


const DTHPlanFetch = async (dth_number, opcode) => {
    const orderid = generateSystemReference();
    const config = {
        method: 'get',
        url: `${ekychubUrl}/verification/dth_plan_fetch?`,
        headers: { 'Content-Type': 'application/json' },
        params: {
            username: ekychubUsername,
            token: ekychubToken,
            opcode,
            dth_number,
            orderid
        }
    };

    return axios
        .request(config)
        .then((response) => {
            console.log('[A1Top/ekychub] DTHPlanFetch response:', response.data);
            return response.data;
        })
        .catch((error) => {
            console.error('[A1Top/ekychub] DTHPlanFetch error:', error.response?.data || error.message);
            return error.response ? error.response.data : error.message;
        });
};


const DTHCustomerInfo = async (dth_number, opcode) => {
    const orderid = generateSystemReference();
    const config = {
        method: 'get',
        url: `${ekychubUrl}/verification/dth_info?`,
        headers: { 'Content-Type': 'application/json' },
        params: {
            username: ekychubUsername,
            token: ekychubToken,
            opcode,
            dth_number,
            orderid
        }
    };

    return axios
        .request(config)
        .then((response) => {
            console.log('[A1Top/ekychub] DTHCustomerInfo response:', response.data);
            return response.data;
        })
        .catch((error) => {
            console.error('[A1Top/ekychub] DTHCustomerInfo error:', error.response?.data || error.message);
            return error.response ? error.response.data : error.message;
        });
};

module.exports = {
    Recharge,
    DTHRecharge,
    checkStatus,
    checkBalance,
    operatorFetch,
    rechargePlanFetch,
    RechargeOfferFetch,
    DTHPlanFetch,
    DTHCustomerInfo
};
