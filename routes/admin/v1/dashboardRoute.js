const express = require('express');
const router = express.Router();
const dashboardController = require('../../../controller/admin/v1/dashboardController');
const authentication = require('../../../middleware/authentication');

router.post('/', authentication, dashboardController.getDashboard);

module.exports = router;