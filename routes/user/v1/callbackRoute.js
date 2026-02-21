const express = require('express');
const router = express.Router();
const callbackController = require('../../../controller/user/v1/callbackController');

router.get('/payment-callback', callbackController.paymentCallback);
router.post('/payout-callback', callbackController.aslPayoutCallback);
router.post('/aeps-callback', callbackController.aslAEPSCallback);
module.exports = router;