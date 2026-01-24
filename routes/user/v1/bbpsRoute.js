const express = require('express');
const router = express.Router();
const bbpsController = require('../../../controller/user/v1/bbpsController');
const authentication = require('../../../middleware/authentication');

router.post('/get-biller-ids', authentication, bbpsController.getBillerIds);
router.post('/get-biller-info', authentication, bbpsController.getBillerInfo);
router.post('/fetch-bill', authentication, bbpsController.fetchBill);
router.post('/pay-bill', authentication, bbpsController.payBill);
router.post('/transaction-status', authentication, bbpsController.getTransactionStatus);
router.post('/register-complaint', authentication, bbpsController.registerComplaint);
router.post('/track-complaint', authentication, bbpsController.trackComplaint);
router.post('/validate-bill', authentication, bbpsController.validateBill);
router.post('/pull-plan', authentication, bbpsController.pullPlan);
router.post('/check-balance', authentication, bbpsController.checkBalance);
router.post('/report-history', authentication, bbpsController.bbpsReportHistory);
router.post('/transaction-history', authentication, bbpsController.getRetailerAllTransaction);

module.exports = router;

