const express = require('express');
const router = express.Router();
const bankController = require('../../../controller/user/v1/bankController');
const authentication = require('../../../middleware/authentication');

// Get all customer banks for the authenticated user
router.get('/list', authentication, bankController.getAllCustomerBanks);

// Get primary customer bank
router.get('/primary', authentication, bankController.getPrimaryCustomerBank);

// Get customer bank by ID
router.get('/:id', authentication, bankController.getCustomerBankById);

module.exports = router;