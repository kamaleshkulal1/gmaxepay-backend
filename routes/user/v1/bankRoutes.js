const express = require('express');
const router = express.Router();
const bankController = require('../../../controller/user/v1/bankController');
const authentication = require('../../../middleware/authentication');

router.get('/list', authentication, bankController.getAllCustomerBanks);
router.get('/primary', authentication, bankController.getPrimaryCustomerBank);
router.get('/:id', authentication, bankController.getCustomerBankById);
router.post('/add', authentication, bankController.addCustomerBank);

module.exports = router;