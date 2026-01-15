const express = require('express');
const router = express.Router();
const fundController = require('../../../controller/company/v1/fundController');
const authentication = require('../../../middleware/authentication');
const { upload, multer } = require('../../../middleware/multerConfig');

// Create fund transfer request (company admin requests go to superadmin)
router.post('/fund-transfer-request', authentication, upload.single('paySlip'), multer, fundController.fundTransferRequest);

// Approve or reject fund request (for requests assigned to company admin)
router.post('/approve-fund-request', authentication, fundController.approveFundRequest);

router.post('/fund-requests', authentication, fundController.getFundRequests);

router.get('/bank-details', authentication, fundController.allbankDetails);

module.exports = router;
