const express = require('express');

const router = express.Router();

router.use('/wallet', require('./v1/walletRoute'));

module.exports = router;