const express = require('express');

const router = express.Router();

router.use('/onboarding', require('./v1/onboardingRoute'));
router.use('/userDetails', require('./v1/userRoute'));
router.use('/aeps', require('./v1/aepsRoute'));
router.use('/wallet', require('./v1/walletRoute'));

module.exports = router;
