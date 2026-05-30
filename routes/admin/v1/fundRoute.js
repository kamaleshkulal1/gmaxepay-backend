const express = require('express');
const router = express.Router();
const fundController = require('../../../controller/admin/v1/fundController');
const authentication = require('../../../middleware/authentication');

router.post('/approve-fund-request', authentication, fundController.approveFundRequest);
router.post('/fund-requests', authentication, fundController.getFundRequests);
router.post('/credit-debit', authentication, fundController.creditDebitUserWallet);

module.exports = router;
