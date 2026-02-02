const express = require('express');
const router = express.Router();

router.use('/companyDetails', require('./v1/companyRoutes'));
router.use('/images',require('./v1/imageRoutes'));
router.use('/onboarding', require('./v1/onboardingRoute'));
router.use('/user', require('./v1/userRoutes'));
router.use('/reports', require('./v1/reportsRoutes'));
router.use('/fund', require('./v1/fundRoute'));
router.use('/slabs', require('./v1/slabRoute'));
router.use('/wallet', require('./v1/walletRoutes'));
router.use('/subscription', require('./v1/subscriptionRoutes'));

module.exports = router;