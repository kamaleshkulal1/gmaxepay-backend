const express = require('express');

const router = express.Router();

router.use('/onboarding', require('./v1/onboardingRoute'));
router.use('/userDetails', require('./v1/userRoute'));
router.use('/aeps', require('./v1/aepsRoute'));

// Slab routes
router.use('/slabs', require('./v1/slabRoute'));

module.exports = router;
