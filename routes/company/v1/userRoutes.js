const express = require('express');
const router = express.Router();
const whitelabelController = require('../../../controller/company/v1/whitelabelController');
const userController = require('../../../controller/company/v1/userContoller');
const authentication = require('../../../middleware/authentication');

router.post('/list', authentication, userController.findAllUsers);
router.post('/upgradeUser', authentication, whitelabelController.upgradeUserRole);
router.post('/degradeUser', authentication, whitelabelController.degradeUserRole);

// MPIN endpoints
router.post('/setMPIN', authentication, userController.setMPIN);
router.post('/resetMPIN', authentication, userController.resetMPIN);
router.post('/getProfile', authentication, userController.getUserProfile);
router.post('/reportToUser', authentication, userController.reportToUser);

module.exports = router;