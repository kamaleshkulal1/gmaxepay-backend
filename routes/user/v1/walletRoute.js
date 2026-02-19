const express = require('express');
const router = express.Router();
const walletController = require('../../../controller/user/v1/walletController');
const authentication = require('../../../middleware/authentication');

router.post('/balance', authentication, walletController.walletBalance);
router.post('/walletHistory', authentication, walletController.walletHistory);
module.exports = router;