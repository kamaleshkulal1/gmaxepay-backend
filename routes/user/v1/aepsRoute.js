const express = require('express');
const router = express.Router();
const aepsController = require('../../../controller/user/v1/aepsController');
const authentication = require('../../../middleware/authentication');

router.post('/onboarding-status', authentication, aepsController.getOnboardingStatus);
router.post('/onboarding', authentication, aepsController.aepsOnboarding);
router.post('/validate-otp', authentication, aepsController.validateAgentOtp);
router.post('/resend-otp', authentication, aepsController.resendAgentOtp);
router.post('/bio-metric-verification', authentication, aepsController.bioMetricVerification);
router.post('/bank-kyc-send-otp', authentication, aepsController.bankKycSendOtp);
router.post('/bank-kyc-validate-otp', authentication, aepsController.bankKycValidateOtp);
router.post('/bank-kyc-biometric-validate', authentication, aepsController.bankKycBiometricValidate);
router.post('/2fa-authentication', authentication, aepsController.aeps2FaAuthentication);
router.post('/transaction', authentication, aepsController.aepsTransaction);
router.post('/recent-banks', authentication, aepsController.recentBanks);
router.post('/transaction-history', authentication, aepsController.aepsTransactionHistory);


module.exports = router;