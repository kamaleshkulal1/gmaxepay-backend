const express = require('express');
const router = express.Router();
const callbackController = require('../../../controller/user/v1/callbackController');

router.get('/payment-callback', callbackController.inspayCallback);
router.post('/payout-callback', callbackController.aslPayoutCallback);
router.post('/aeps-callback', callbackController.aslAEPSCallback);
router.get('/a1topup-callback', callbackController.a1topupCallback);
module.exports = router;