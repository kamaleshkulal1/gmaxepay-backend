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

module.exports = router;