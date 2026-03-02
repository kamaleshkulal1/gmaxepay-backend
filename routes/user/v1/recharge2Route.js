const express = require('express');
const router = express.Router();
const recharge2Controller = require('../../../controller/user/v1/recharge2Controller');
const authentication = require('../../../middleware/authentication');

router.post('/pay', authentication, recharge2Controller.recharge);
router.post('/recharge-history', authentication, recharge2Controller.getRechargeHistory);
router.post('/rechargeReports', authentication, recharge2Controller.getRecharge2Reports);
router.post('/getUserRechargeReports', authentication, recharge2Controller.getDownlineRecharge2Reports);
router.post('/recent-history', authentication, recharge2Controller.recentRechargeHistory);
router.post('/find-mobile-operator', authentication, recharge2Controller.findMobileNumberOperator);
router.post('/find-recharge-plan', authentication, recharge2Controller.findAllRechargePlanFetch);
router.post('/recharge-offer', authentication, recharge2Controller.findRechargeOfferFetch);

module.exports = router;
