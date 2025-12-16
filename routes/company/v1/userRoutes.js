const express = require('express');
const router = express.Router();
const whitelabelController = require('../../../controller/company/v1/whitelabelController');
const userController = require('../../../controller/company/v1/userContoller');
const authentication = require('../../../middleware/authentication');

router.post('/list', authentication, userController.findAllUsers);
router.post('/upgradeUser', authentication, whitelabelController.upgradeUserRole);
router.post('/degradeUser', authentication, whitelabelController.degradeUserRole);

module.exports = router;