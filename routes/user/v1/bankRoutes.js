const express = require('express');
const router = express.Router();
const bankController = require('../../../controller/user/v1/bankController');
const authentication = require('../../../middleware/authentication');

router.post('/get-all-banks', authentication, bankController.getAllBanks);

module.exports = router;