const express = require('express');
const router = express.Router();
const dth2Controller = require('../../../controller/user/v1/dth2Controller');
const authentication = require('../../../middleware/authentication');

router.post('/plan-fetch', authentication, dth2Controller.dthPlanFetch);
router.post('/customer-info', authentication, dth2Controller.customerInfo);
router.post('/recharge', authentication, dth2Controller.dthRecharge);
router.post('/check-status', authentication, dth2Controller.checkStatus);

module.exports = router;
