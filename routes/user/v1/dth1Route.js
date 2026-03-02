const express = require('express');
const router = express.Router();
const dth1Controller = require('../../../controller/user/v1/dth1Controller');
const authentication = require('../../../middleware/authentication');
router.post('/plan-fetch', authentication, dth1Controller.dthPlanFetch);
router.post('/customer-info', authentication, dth1Controller.customerInfo);
router.post('/recharge', authentication, dth1Controller.dthRecharge);
router.post('/check-status', authentication, dth1Controller.checkStatus);
module.exports = router;