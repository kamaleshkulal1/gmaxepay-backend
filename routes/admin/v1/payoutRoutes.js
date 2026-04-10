const express = require('express');
const router = express.Router();
const payoutController = require('../../../controller/admin/v1/payoutController');
const authentication = require('../../../middleware/authentication');

router.post('/history', authentication, payoutController.getAllPayoutHistory);
router.post('/list', authentication, payoutController.getPayoutList);
router.post('/switch-status', authentication, payoutController.switchPayoutStatus);
router.post('/create', authentication, payoutController.createPayoutList);

module.exports = router;