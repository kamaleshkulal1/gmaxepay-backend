const express = require('express');
const router = express.Router();
const { createVendorPayout } = require('../../controller/extend/v1/vendorPayout');

router.post('/vendor-payout', createVendorPayout);

module.exports = router;