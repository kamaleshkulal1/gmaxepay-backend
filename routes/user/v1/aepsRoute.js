const express = require('express');
const router = express.Router();
const aepsController = require('../../../controller/user/v1/aepsController');
const authentication = require('../../../middleware/authentication');

router.post('/onboarding-status', authentication, aepsController.getOnboardingStatus);
router.post('/onboarding', authentication, aepsController.aepsOnboarding);
router.post('/validate-otp', authentication, aepsController.validateAgentOtp);
router.post('/resend-otp', authentication, aepsController.resendAgentOtp);
router.post('/bio-metric-verification', authentication, aepsController.bioMetricVerification);
router.post('/2fa-authentication', authentication, aepsController.aeps2FaAuthentication);
router.post('/transaction', authentication, aepsController.aepsTransaction);


module.exports = router;