const express = require('express');
const router = express.Router();
const fundController = require('../../../controller/user/v1/fundController');
const authentication = require('../../../middleware/authentication');
const { upload, multer } = require('../../../middleware/multerConfig');

// Create fund transfer request (with optional payslip upload)
router.post('/fund-transfer-request', authentication, upload.single('paySlip'), multer, fundController.fundTransferRequest);

// Approve or reject fund request
router.post(
    '/approve-fund-request', 
    authentication, 
    fundController.approveFundRequest
);

// Get fund requests (both created by user and assigned to user for approval)
router.get(
    '/fund-requests', 
    authentication, 
    fundController.getFundRequests
);

// Get fund history for current user
router.get(
    '/fund-history', 
    authentication, 
    fundController.getFundHistory
);

module.exports = router;
