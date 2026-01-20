const express = require('express');
const router = express.Router();
const authentication = require('../../middleware/authentication');


router.use('/companyDetails', require('./v1/companyRoutes'));
router.use('/images',authentication, require('./v1/imageRoutes'));
router.use('/onboarding', require('./v1/onboardingRoute'));
router.use('/user', authentication, require('./v1/userRoutes'));
router.use('/reports', authentication, require('./v1/reportsRoutes'));
router.use('/fund', authentication, require('./v1/fundRoute'));
router.use('/slabs', authentication, require('./v1/slabRoute'));
module.exports = router;