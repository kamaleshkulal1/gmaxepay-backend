const express = require('express');
const router = express.Router();
const fundController = require('../../../controller/admin/v1/fundController');
const authentication = require('../../../middleware/authentication');

// Approve or reject fund request (superadmin only - for company admin requests)
router.post('/approve-fund-request', authentication, fundController.approveFundRequest);

module.exports = router;
