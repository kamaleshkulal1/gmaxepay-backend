const express = require('express');
const router = express.Router();
const bankController = require('../../../controller/user/v1/bankController');
const authentication = require('../../../middleware/authentication');

router.get('/list', authentication, bankController.getAllCustomerBanks);
router.get('/primary', authentication, bankController.getPrimaryCustomerBank);
router.get('/:id', authentication, bankController.getCustomerBankById);
router.post('/add', authentication, bankController.addCustomerBank);
router.post('/delete/:id', authentication, bankController.deleteCustomerBank);
router.put('/update/:id', authentication, bankController.updateCustomerBank);

module.exports = router;