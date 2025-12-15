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
router.use('/services', require('./v1/serviceRoute'));

// Slab routes - use separate route file
router.use('/slabs', require('./v1/slabRoute'));

// Package routes
router.use('/packages', require('./v1/packageRoute'));
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
