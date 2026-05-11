const express = require('express');
const router = express.Router();
const aepsAPISwitchController = require('../../../controller/user/v1/aepsAPISwitchController');
const authentication = require('../../../middleware/authentication');

router.get('/', authentication, aepsAPISwitchController.getActiveAepsAPI);

module.exports = router;
