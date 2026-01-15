const express = require('express');
const router = express.Router();
const fundController = require('../../../controller/admin/v1/fundController');
const authentication = require('../../../middleware/authentication');

router.post('/approve-fund-request', authentication, fundController.approveFundRequest);
router.get('/fund-requests', authentication, fundController.getFundRequests);

module.exports = router;
