const express = require('express');
const router = express.Router();
const payoutController = require('../../../controller/user/v1/payoutController');
const authentication = require('../../../middleware/authentication');

// Process payout
router.post('/', authentication, payoutController.payout);

// Get payout bank list
router.post('/bank-list', authentication, payoutController.getPayoutBankList);

module.exports = router; 