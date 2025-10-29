const express = require('express');
const router = express.Router();
const authentication = require('../../middleware/authentication');
const onboardingController = require('../../controller/auth/v1/onboardingController');

router.use('/companyDetails', require('./v1/companyRoutes'));
// Image routes
router.use('/images',authentication, require('./v1/imageRoutes'));

router.get('/onboarding/:token', onboardingController.verifyOnboardingLink);

module.exports = router;