const express = require('express');

const router = express.Router();

router.use('/onboarding', require('./v1/onboardingRoute'));
router.use('/userDetails', require('./v1/userRoute'));
router.use('/aeps', require('./v1/aepsRoute'));
router.use('/bank', require('./v1/bankRoutes'));
router.use('/bbps', require('./v1/bbpsRoute'));
router.use('/pan', require('./v1/panRoute'));
router.use('/payout', require('./v1/payoutRoute'));
router.use('/recharge', require('./v1/rechargeRoute'));

module.exports = router;
