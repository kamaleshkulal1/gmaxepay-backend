const express = require('express');
const router = express.Router();
const fundManagementController = require('../../../controller/admin/v1/fundManagementController');
const authentication = require('../../../middleware/authentication');
const { upload, multer } = require('../../../middleware/multerConfig');

// Create fund request (with payslip upload)
router.post('/request', authentication, upload.single('paySlip'), multer, fundManagementController.createFundRequest);

// Get fund requests for approval (where current user is superior)
router.post('/approval/list', authentication, fundManagementController.getFundRequestsForApproval);

// Get my fund requests (requests created by current user)
router.post('/my-requests', authentication, fundManagementController.getMyFundRequests);

// Approve fund request
router.post('/:id/approve', authentication, fundManagementController.approveFundRequest);

// Reject fund request
router.post('/:id/reject', authentication, fundManagementController.rejectFundRequest);

// Get downline users
router.post('/downline', authentication, fundManagementController.getDownlineUsers);

// Get superior bank list
router.post('/superior/banks', authentication, fundManagementController.getSuperiorBankList);

// Get fund request history
router.get('/history/:fundManagementId', authentication, fundManagementController.getFundRequestHistory);

module.exports = router;

