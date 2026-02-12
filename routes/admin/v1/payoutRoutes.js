const express = require('express');
const router = express.Router();
const payoutController = require('../../../controller/admin/v1/payoutController');
const authentication = require('../../../middleware/authentication');

router.post('/history', authentication, payoutController.getAllPayoutHistory);

module.exports = router;