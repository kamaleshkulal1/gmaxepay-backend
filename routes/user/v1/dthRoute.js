const express = require('express');
const router = express.Router();
const dthController = require('../../../controller/user/v1/dthController');
const authentication = require('../../../middleware/authentication');
router.post('/plan-fetch', authentication, dthController.dthPlanFetch);
router.post('/customer-info', authentication, dthController.customerInfo);
router.post('/recharge', authentication, dthController.dthRecharge);
module.exports = router;