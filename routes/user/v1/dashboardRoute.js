const express = require('express');
const router = express.Router();
const dashboardController = require('../../../controller/user/v1/dashboardController');

router.post('/statistics', dashboardController.getDashboard);

module.exports = router;