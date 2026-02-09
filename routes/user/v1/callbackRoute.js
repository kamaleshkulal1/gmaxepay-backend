const express = require('express');
const router = express.Router();
const callbackController = require('../../../controller/user/v1/callbackController');

router.get('/payment-callback', callbackController.paymentCallback);
router.post('/payout-callback', callbackController.aslPayoutCallback);
module.exports = router;