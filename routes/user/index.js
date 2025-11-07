const express = require('express');

const router = express.Router();

router.use('/onboarding', require('./v1/onboardingRoute'));
router.use('/userDetails', require('./v1/userRoute'));

module.exports = router;
