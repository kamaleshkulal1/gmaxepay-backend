const express = require('express');

const router = express.Router();

router.use('/onboarding', require('./v1/onboardingRoute'));
router.use('/userDetails', require('./v1/userRoute'));
router.use('/aeps1', require('./v1/aslAepsRoute'));
router.use('/bank', require('./v1/bankRoutes'));
router.use('/bbps', require('./v1/bbpsRoute'));
router.use('/pan', require('./v1/panRoute'));
router.use('/slab', require('./v1/slabRoute'));
router.use('/payout', require('./v1/payoutRoute'));
router.use('/service', require('./v1/serviceRoute'));
router.use('/recharge', require('./v1/rechargeRoute'));
router.use('/dth', require('./v1/dthRoute'));
router.use('/callback', require('./v1/callbackRoute'));
router.use('/aeps2', require('./v1/practomindAepsRoute'));
router.use('/fund', require('./v1/fundRoute'));
router.use('/wallet', require('./v1/walletRoute'));
router.use('/dmt', require('./v1/dmtRoute'));
router.use('/subscription', require('./v1/subscriptionRoute'));
router.use('/dashboard', require('./v1/dashboardRoute'));

module.exports = router;