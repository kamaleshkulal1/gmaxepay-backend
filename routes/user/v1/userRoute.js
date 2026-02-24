const express = require('express');
const router = express.Router();
const userController = require('../../../controller/user/v1/userController');
const authentication = require('../../../middleware/authentication');

router.post('/getProfile', authentication, userController.getProfile);
router.post('/upgradeUser', authentication, userController.upgradeUserRole);
router.post('/degradeUser', authentication, userController.degradeUserRole);
router.post('/list', authentication, userController.findAllUsers);
router.post('/setMPIN', authentication, userController.setMPIN);
router.post('/resetMPIN', authentication, userController.resetMPIN);
router.post('/getUserProfile', authentication, userController.getUserProfile);
router.post('/reportToUsersList', authentication, userController.findAllTheirDownlineUsers);
router.post('/profile/:id', authentication, userController.getByUserProfile);
router.post('/kyc/complete/:id', authentication, userController.getCompleteKycData);
router.post('/kyc/revert/:id', authentication, userController.revertKycData);
router.post('/old/send-otp', authentication, userController.sendOldChangeMobileNoOtp);
router.post('/old/verify-otp', authentication, userController.verifyOldChangeMobileNoOtp);
router.post('/new/send-otp', authentication, userController.sendNewChangeMobileNoOtp);
router.post('/new/verify-otp', authentication, userController.verifyNewChangeMobileNoOtp);

module.exports = router;