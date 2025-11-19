const express = require('express');
const router = express.Router();
const whitelabelController = require('../../../controller/company/v1/whitelabelController');
const authentication = require('../../../middleware/authentication');

router.post('/upgradeUser', authentication, whitelabelController.upgradeUserRole);
router.post('/degradeUser', authentication, whitelabelController.degradeUserRole);

module.exports = router;