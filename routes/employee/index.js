const express = require('express');

const router = express.Router();

router.use('/wallet', require('./v1/walletRoute'));
router.use('/reports', require('./v1/reportsRoutes'));

module.exports = router;