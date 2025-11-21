const express = require('express');
const router = express.Router();
const payoutController = require('../../../controller/user/v1/payoutController');

router.post('/payout', payoutController.payout);

module.exports = router;