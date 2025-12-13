const express = require('express');
const router = express.Router();
const authentication = require('../../middleware/authentication');
const { route } = require('../admin');

router.use('/companyDetails', require('./v1/companyRoutes'));
// Image routes
router.use('/images',authentication, require('./v1/imageRoutes'));

router.use('/onboarding', require('./v1/onboardingRoute'));

module.exports = router;