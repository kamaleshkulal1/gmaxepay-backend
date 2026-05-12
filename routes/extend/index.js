const express = require('express');
const router = express.Router();
const { createVendorPayout, vendorWalletBalance } = require('../../controller/extend/v1/vendorPayout');

router.post('/vendor-payout', createVendorPayout);
router.post('/vendor-balance', vendorWalletBalance);

module.exports = router;