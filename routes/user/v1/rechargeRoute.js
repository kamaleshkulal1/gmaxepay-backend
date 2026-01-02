const express = require('express');
const router = express.Router();
const rechargeController = require('../../../controller/user/v1/rechargeController');
const authentication = require('../../../middleware/authentication');

router.post('/find-mobile-operator', authentication, rechargeController.findMobileNumberOperator);
router.post('/recharge', authentication, rechargeController.recharge);
router.post('/get-recharge-history', authentication, rechargeController.getRechargeHistory);

module.exports = router;