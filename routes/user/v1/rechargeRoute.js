const express = require('express');
const router = express.Router();
const rechargeController = require('../../../controller/user/v1/rechargeController');
const authentication = require('../../../middleware/authentication');

router.post('/find-mobile-operator', authentication, rechargeController.findMobileNumberOperator);
router.post('/pay', authentication, rechargeController.recharge);
router.post('/find-recharge-plan',authentication, rechargeController.findAllRechargePlanFetch);
router.post('/recharge-offer',authentication, rechargeController.findRechargeOfferFetch);

router.post('/get-recharge-history', authentication, rechargeController.getRechargeHistory);

module.exports = router;