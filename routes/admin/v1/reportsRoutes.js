const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const reportController = require('../../../controller/admin/v1/reportController');

router.post('/aeps1Reports', authentication, reportController.getAeps1Reports);
router.post('/aeps1/transactionDetails/:id', authentication, reportController.getAepsTransactionDetailsById);
router.post('/recharge1Reports', authentication, reportController.getRecharge1Reports);
router.post('/recharge2Reports', authentication, reportController.getRecharge2Reports);
router.post('/aeps2Reports', authentication, reportController.getAeps2Reports);
router.post('/aeps2/transactionDetails/:id', authentication, reportController.getAeps2TransactionDetailsById);
router.post('/surRecReports', authentication, reportController.getSurRecReports);
router.post('/bbpReports', authentication, reportController.getBbpReports);
router.post('/gstReports', authentication, reportController.getGstReports);

module.exports = router;