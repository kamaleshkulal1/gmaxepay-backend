const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const dashboardController = require('../../../controller/user/v1/dashboardController');


router.post('/statistics', authentication, dashboardController.getDashboard);

module.exports = router;