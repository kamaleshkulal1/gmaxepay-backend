const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const reportController = require('../../../controller/company/v1/reportController');

router.post('/aeps1Reports', authentication, reportController.getAeps1Reports);
router.post('/aeps2Reports', authentication, reportController.getAeps2Reports);
router.post('/rechargeReports', authentication, reportController.getRechargeReports);
module.exports = router;

