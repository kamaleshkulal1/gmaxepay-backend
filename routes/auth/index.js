const express = require('express');
const router = express.Router();
const userController = require('../../controller/auth/v1/userController');
const authentication = require('../../middleware/authentication');

router.post('/login', userController.login);
router.post('/verify-mobile-otp', userController.verifyOTP);
router.post('/reset-password', userController.resetPassword);
router.post('/forgot-password', userController.resendTemporaryPassword);
router.post('/verify-forgot-password-otp', userController.verifyForgotPasswordOTP);
router.post('/send-otp-temp', userController.requestResendTemporaryPassword);
router.post('/verify-otp-temp', userController.verifyResendTemporaryPasswordOTP);
router.post('/handle-2fa', userController.handle2FA);
router.post('/set-mpin', userController.setMPIN);
router.post('/verify-mpin', userController.verifyMPIN);
router.post('/refresh-token', userController.refreshAccessToken);
router.post('/resend-otp', userController.resendOTP);
router.post('/logout', authentication, userController.logout);

module.exports = router;
