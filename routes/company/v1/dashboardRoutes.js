const express = require('express');
const router = express.Router();
const dashboardController = require('../../../controller/company/v1/dashboardController');
const authentication = require('../../../middleware/authentication');

router.post('/statistics', authentication, dashboardController.getDashboard);

module.exports = router;