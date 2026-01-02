const express = require('express');
const router = express.Router();
const payoutController = require('../../../controller/user/v1/payoutController');
const authentication = require('../../../middleware/authentication');

// Get payout bank list
router.post('/bank-list', authentication, payoutController.getPayoutBankList);

// Process payout
router.post('/payout', authentication, payoutController.payout);

module.exports = router;