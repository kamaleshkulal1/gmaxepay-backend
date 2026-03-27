const express = require('express');
const router = express.Router();
const zupayAepsController = require('../../../controller/user/v1/zupayAepsController');
const authentication = require('../../../middleware/authentication');

router.post('/onboarding-status', authentication, zupayAepsController.getOnboardingStatus);
router.post('/initiate-onboarding', authentication, zupayAepsController.initiateOnboarding);
router.post('/verify-otp', authentication, zupayAepsController.verifyOTP);
router.post('/resend-otp', authentication, zupayAepsController.resendOTP);
router.post('/ekyc-biometric', authentication, zupayAepsController.ekycBiometric);
router.post('/check-onboarding-status', authentication, zupayAepsController.checkOnboardingStatus);
router.post('/daily-authentication', authentication, zupayAepsController.dailyAuthentication);
router.post('/cash-withdrawal', authentication, zupayAepsController.cashWithdrawal);
router.post('/balance-enquiry', authentication, zupayAepsController.balanceEnquiry);
router.post('/mini-statement', authentication, zupayAepsController.miniStatement);
router.post('/transaction-history', authentication, zupayAepsController.transactionHistory);
router.post('/bank-list', authentication, zupayAepsController.bankList);
router.post('/recent-banks', authentication, zupayAepsController.recentBanks);

module.exports = router;
