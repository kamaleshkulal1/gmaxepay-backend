const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const reportController = require('../../../controller/admin/v1/reportController');

// AEPS Reports routes
router.post('/aeps', authentication, reportController.getAepsReports);
router.post('/aeps/transactionDetails/:id', authentication, reportController.getAepsTransactionDetailsById);
router.post('/rechargeReports', authentication, reportController.getRechargeReports);

module.exports = router;

