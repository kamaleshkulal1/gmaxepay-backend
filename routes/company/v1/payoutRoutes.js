const express = require('express');
const router = express.Router();
const payoutController = require('../../../controller/company/v1/payoutController');
const authentication = require('../../../middleware/authentication');

router.post('/', authentication, payoutController.payout);
router.post('/bank-list', authentication, payoutController.getPayoutBankList);
router.post('/history', authentication, payoutController.getAllPayoutHistory);
router.post('/status-check', authentication, payoutController.checkPayoutStatus);

module.exports = router;