const express = require('express');
const router = express.Router();
const userController = require('../../controller/auth/v1/userController');

// Auth routes
router.post('/login', userController.login);
router.post('/verify-otp', userController.verifyOTP);
router.post('/reset-password', userController.resetPassword);
router.post('/handle-2fa', userController.handle2FA);
router.post('/refresh-token', userController.refreshAccessToken);
router.post('/resend-otp', userController.resendOTP);

module.exports = router;
