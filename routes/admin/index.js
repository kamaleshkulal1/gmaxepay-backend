/**
 * admin/index.js
 * @description :: admin routes
 */

const express = require('express');
const router = express.Router();
const authentication = require('../../middleware/authentication');
// Apply authentication middleware to all admin routes

// Import admin controllers
const userController = require('../../controller/admin/v1/userController');
const rolePermissionController = require('../../controller/admin/v1/rolePermissionController');
const servicesController = require('../../controller/admin/v1/servicesController');
const slabController = require('../../controller/admin/v1/slabController');
const packageController = require('../../controller/admin/v1/packageController');
const operatorController = require('../../controller/admin/v1/operatorController');
const ekycHubController = require('../../controller/admin/v1/eKycHubContoller');


// User management routes
router.use('/users', require('./v1/userRoute'));

// Role and permission routes
router.use('/rolesAndPermissions', require('./v1/rolesAndPermission'));

// Services routes
router.post('/services', authentication, servicesController.registerService);
router.get('/services', servicesController.findAllServices);
router.post('/services/packages', authentication, servicesController.registerServicePackage);
router.get('/services/:id', servicesController.getServices);
router.put('/services/:id', servicesController.updateUserPackage);
router.get('/services/:id/packages', servicesController.listUserPackage);
router.put('/services/:id/update', servicesController.updateUserService);

// Slab routes - use separate route file
router.use('/slabs', require('./v1/slabRoute'));

// Package routes
router.post('/packages', authentication, packageController.registerPackage);
router.get('/packages', packageController.findAllPackage);
router.get('/packages/:id', packageController.getPackage);
router.patch('/packages/:id', packageController.partialUpdatePackage);
router.get('/packages/:id/users', packageController.getUserPackage);
router.delete('/packages/:id', packageController.deletePackage);

// Operator routes
router.post('/operators', authentication, operatorController.registerService);
router.get('/operators', operatorController.findAllService);
router.get('/operators/:id', operatorController.getService);
router.patch('/operators/:id', operatorController.partialUpdateService);
router.delete('/operators/:id', operatorController.deleteService);
router.get('/operators/states', operatorController.findAllstate);
router.get('/operators/types', operatorController.findAlloperatorType);
router.get('/operators/list', operatorController.operatorList);
router.use('/company', require('./v1/companyRoute'));

router.use('/ekyc-hub', require('./v1/ekycHubRoutes'));

module.exports = router;
