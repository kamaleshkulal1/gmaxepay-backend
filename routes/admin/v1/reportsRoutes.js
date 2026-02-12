const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const reportController = require('../../../controller/admin/v1/reportController');

// AEPS Reports routes
router.post('/aeps1Reports', authentication, reportController.getAeps1Reports);
router.post('/aeps1/transactionDetails/:id', authentication, reportController.getAepsTransactionDetailsById);
router.post('/rechargeReports', authentication, reportController.getRechargeReports);
router.post('/aeps2Reports', authentication, reportController.getAeps2Reports);
router.post('/aeps2/transactionDetails/:id', authentication, reportController.getAeps2TransactionDetailsById);
module.exports = router;

