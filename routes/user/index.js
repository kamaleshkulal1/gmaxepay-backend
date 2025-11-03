const express = require('express');

const router = express.Router();

router.use('/onboarding', require('./v1/onboardingRoute'));

module.exports = router;
