const express = require('express');
const router = express.Router();
const walletController = require('../../../controller/admin/v1/walletContoller');
const authentication = require('../../../middleware/authentication');

router.post('/alsWallet', authentication, walletController.alsWallet);

module.exports = router;