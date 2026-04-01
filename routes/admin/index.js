const express = require('express');
const router = express.Router();

router.use('/users', require('./v1/userRoute'));
router.use('/rolesAndPermissions', require('./v1/rolesAndPermission'));
router.use('/services', require('./v1/servicesRoutes'));
router.use('/slabs', require('./v1/slabRoutes'));
router.use('/operators', require('./v1/operatorRoutes'));
router.use('/service', require('./v1/servicesRoutes'));
router.use('/company', require('./v1/companyRoute'));
router.use('/ekyc-hub', require('./v1/ekycHubRoutes'));
router.use('/bank', require('./v1/bankRoutes'));
router.use('/wallet', require('./v1/walletRoute'));
router.use('/reports', require('./v1/reportsRoutes'));
router.use('/bbps', require('./v1/bbpsOperatorRoutes'));
router.use('/practomind', require('./v1/practomindRoutes'));
router.use('/fund', require('./v1/fundRoute'));
router.use('/wallet', require('./v1/walletRoute'));
router.use('/dashboard', require('./v1/dashboardRoute'));
router.use('/payout', require('./v1/payoutRoutes'));
router.use('/employee', require('./v1/employeeRoutes'));

module.exports = router;
