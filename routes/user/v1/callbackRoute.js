const express = require('express');
const router = express.Router();
const callbackController = require('../../../controller/user/v1/callbackController');

router.get('/payment-callback', callbackController.inspayCallback);
router.post('/payout-callback', callbackController.aslPayoutCallback);
router.post('/runpaisa-payout-callback', callbackController.runpaisaPayoutCallback);
router.post('/paynidipro-payout-callback', callbackController.paynidiproPayoutCallback);
router.post('/aeps-callback', callbackController.aslAEPSCallback);
router.get('/a1topup-callback', callbackController.a1topupCallback);
router.post('/cms-callback', callbackController.cmsCallback);

module.exports = router;