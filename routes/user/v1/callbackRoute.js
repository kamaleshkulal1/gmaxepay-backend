const express = require('express');
const router = express.Router();
const callbackController = require('../../../controller/user/v1/callbackController');

router.get('/payment-callback', callbackController.paymentCallback);
module.exports = router;