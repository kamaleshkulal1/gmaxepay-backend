const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const serviceController = require('../../../controller/user/v1/serviceController');

router.post('/list', authentication, serviceController.getServices);

module.exports = router;