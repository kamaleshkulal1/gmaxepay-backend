const express = require('express');
const router = express.Router();
const authentication = require('../../middleware/authentication');
// Apply authentication middleware to all admin routes

const packageController = require('../../controller/admin/v1/packageController');
const operatorController = require('../../controller/admin/v1/operatorController');
router.use('/users', require('./v1/userRoute'));
router.use('/rolesAndPermissions', require('./v1/rolesAndPermission'));
router.use('/services', require('./v1/servicesRoutes'));
router.use('/slabs', require('./v1/slabRoutes'));
router.post('/packages', authentication, packageController.registerPackage);
router.get('/packages', packageController.findAllPackage);
router.get('/packages/:id', packageController.getPackage);
router.patch('/packages/:id', packageController.partialUpdatePackage);
router.get('/packages/:id/users', packageController.getUserPackage);
router.delete('/packages/:id', packageController.deletePackage);

router.post('/operators', authentication, operatorController.registerService);
router.get('/operators', operatorController.findAllService);
router.get('/operators/:id', operatorController.getService);
router.patch('/operators/:id', operatorController.partialUpdateService);
router.delete('/operators/:id', operatorController.deleteService);
router.get('/operators/states', operatorController.findAllstate);
router.get('/operators/types', operatorController.findAlloperatorType);
router.get('/operators/list', operatorController.operatorList);

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

module.exports = router;
