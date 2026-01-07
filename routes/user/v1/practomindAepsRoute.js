const express = require('express');
const router = express.Router();
const practomindAepsController = require('../../../controller/user/v1/practomindAepsController');
const authentication = require('../../../middleware/authentication');

// Onboarding routes
router.post('/onboarding-status', authentication, practomindAepsController.getPractomindAepsOnboardingStatus);
router.post('/onboarding', authentication, practomindAepsController.createPractomindAepsOnboarding);

// EKYC routes
router.post('/send-ekyc-otp', authentication, practomindAepsController.sendEkycOtp);
router.post('/validate-ekyc-otp', authentication, practomindAepsController.validateEkycOtp);
router.post('/resend-ekyc-otp', authentication, practomindAepsController.resendEkycOtp);
router.post('/ekyc-submit', authentication, practomindAepsController.ekycSubmit);

// Daily authentication (2FA)
router.post('/daily-authentication', authentication, practomindAepsController.dailyAuthentication);

// Transaction routes
router.post('/cash-withdrawal', authentication, practomindAepsController.cashWithdrawal);
router.post('/balance-enquiry', authentication, practomindAepsController.balanceEnquiry);
router.post('/mini-statement', authentication, practomindAepsController.miniStatement);

module.exports = router;

