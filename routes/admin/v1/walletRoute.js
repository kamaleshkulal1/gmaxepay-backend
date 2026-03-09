const express = require('express');
const router = express.Router();
const walletController = require('../../../controller/admin/v1/walletContoller');
const authentication = require('../../../middleware/authentication');

router.post('/alsWallet', authentication, walletController.alsWallet);
router.post('/balance', authentication, walletController.walletBalance);
router.post('/inspayWallet', authentication, walletController.inspayWallet);
router.post('/bbpsWallet', authentication, walletController.bbpsWallet);
router.post('/walletHistory', authentication, walletController.walletHistory);
router.post('/a1TopupWallet', authentication, walletController.a1TopupWallet);

module.exports = router;