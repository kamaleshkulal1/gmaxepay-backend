const express = require('express');
const router = express.Router();
const fundController = require('../../../controller/company/v1/fundController');
const authentication = require('../../../middleware/authentication');
const { upload, multer } = require('../../../middleware/multerConfig');

router.post('/fund-transfer-request', authentication, upload.single('paySlip'), multer, fundController.fundTransferRequest);

router.post('/approve-fund-request', authentication, fundController.approveFundRequest);

router.post('/fund-requests', authentication, fundController.getFundRequests);

router.post('/all-bank-details', authentication, fundController.allbankDetails);

module.exports = router;
