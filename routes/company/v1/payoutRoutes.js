const express = require('express');
const router = express.Router();
const payoutController = require('../../../controller/company/v1/payoutController');
const authentication = require('../../../middleware/authentication');


router.post('/payout', authentication, payoutController.payout);
router.post('/bank-list', authentication, payoutController.getPayoutBankList);

module.exports = router;