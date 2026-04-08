const express = require('express');

const router = express.Router();

router.use('/wallet', require('./v1/walletRoute'));
router.use('/reports', require('./v1/reportsRoutes'));
router.use('/company', require('./v1/companyRoute'));
router.use('/bbps', require('./v1/bbpsOperatorRoutes'));
router.use('/fund', require('./v1/fundRoute'));
router.use('/slab', require('./v1/slabRoutes'));
router.use('/operators', require('./v1/operatorRoutes'));
router.use('/service', require('./v1/servicesRoutes'));
router.use('/payout', require('./v1/payoutRoutes'));
router.use('/user', require('./v1/userRoute'));

module.exports = router;