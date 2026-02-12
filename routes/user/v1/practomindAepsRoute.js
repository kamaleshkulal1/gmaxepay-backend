const express = require('express');
const router = express.Router();
const practomindAepsController = require('../../../controller/user/v1/practomindAepsController');
const authentication = require('../../../middleware/authentication');

router.post('/onboarding-status', authentication, practomindAepsController.getPractomindAepsOnboardingStatus);
router.post('/onboarding', authentication, practomindAepsController.createPractomindAepsOnboarding);
router.post('/send-ekyc-otp', authentication, practomindAepsController.sendEkycOtp);
router.post('/validate-ekyc-otp', authentication, practomindAepsController.validateEkycOtp);
router.post('/resend-ekyc-otp', authentication, practomindAepsController.resendEkycOtp);
router.post('/ekyc-submit', authentication, practomindAepsController.ekycSubmit);
router.post('/daily-authentication', authentication, practomindAepsController.dailyAuthentication);
router.post('/cash-withdrawal', authentication, practomindAepsController.cashWithdrawal);
router.post('/balance-enquiry', authentication, practomindAepsController.balanceEnquiry);
router.post('/mini-statement', authentication, practomindAepsController.miniStatement);
router.post('/recent-banks', authentication, practomindAepsController.recentBanks);
router.post('/bank-list', authentication, practomindAepsController.bankList);
router.post('/transaction-history', authentication, practomindAepsController.aepsTransactionHistory);

module.exports = router;

