const express = require('express');
const router = express.Router();
const walletController = require('../../../controller/user/v1/walletController');

router.post('/alsWallet', walletController.alsWallet);

module.exports = router;