const express = require('express');
const router = express.Router();
const fundController = require('../../../controller/employee/v1/fundController');
const authentication = require('../../../middleware/authentication');

router.post('/approve-fund-request', authentication, fundController.approveFundRequest);
router.post('/fund-requests', authentication, fundController.getFundRequests);

module.exports = router;
