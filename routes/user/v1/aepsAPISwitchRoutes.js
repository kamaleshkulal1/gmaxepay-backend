const express = require('express');
const router = express.Router();
const aepsAPISwitchController = require('../../../controller/user/v1/aepsAPISwitchController');
const authentication = require('../../../middleware/authentication');

router.get('/active', authentication, aepsAPISwitchController.getActiveAepsAPI);

module.exports = router;
