const express = require('express');
const router = express.Router();
const recharge1Controller = require('../../../controller/user/v1/recharge1Controller');
const authentication = require('../../../middleware/authentication');

router.post('/find-mobile-operator', authentication, recharge1Controller.findMobileNumberOperator);
router.post('/pay', authentication, recharge1Controller.recharge);
router.post('/find-recharge-plan', authentication, recharge1Controller.findAllRechargePlanFetch);
router.post('/recharge-offer', authentication, recharge1Controller.findRechargeOfferFetch);
router.post('/recharge-history', authentication, recharge1Controller.getRechargeHistory);
router.post('/rechargeReports', authentication, recharge1Controller.getRecharge1Reports);
router.post('/getUserRechargeReports', authentication, recharge1Controller.getDownlineRecharge1Reports);
router.post('/recent-history', authentication, recharge1Controller.recentRechargeHistory);
router.delete('/delete-recharge-plan', authentication, recharge1Controller.deleteOldRechargePlan);

module.exports = router;