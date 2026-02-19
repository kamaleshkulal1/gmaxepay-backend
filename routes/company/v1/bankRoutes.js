const express = require('express');
const router = express.Router();
const bankController = require('../../../controller/company/v1/bankController');
const authentication = require('../../../middleware/authentication');

router.post('/add', authentication, bankController.addCustomerBank);
router.post('/delete/:id', authentication, bankController.deleteCustomerBank);
router.put('/update/:id', authentication, bankController.updateCustomerBank);
module.exports = router;