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
const subscriptionController = require('../../controller/admin/v1/subscriptionController');
const ekycHubController = require('../../controller/admin/v1/eKycHubContoller');



// User management routes
router.post('/users', userController.createUser);
router.post('/users-list',authentication, userController.findAllUsers);
router.get('/users/:id', userController.getUser);
router.put('/users/:id', userController.updateUser);
router.delete('/users/:id', userController.deleteUser);

// Role and permission routes
router.put('/roles/permissions', rolePermissionController.updatePermission);
router.get('/roles/:roleId/permissions', rolePermissionController.getPermissionByRoleId);
router.post('/roles/permissions', rolePermissionController.createPermission);
router.post('/roles/permission', rolePermissionController.createRolePermission);

// Services routes
router.post('/services', authentication, servicesController.registerService);
router.get('/services', servicesController.findAllServices);
router.post('/services/packages', authentication, servicesController.registerServicePackage);
router.get('/services/:id', servicesController.getServices);
router.put('/services/:id', servicesController.updateUserPackage);
router.get('/services/:id/packages', servicesController.listUserPackage);
router.put('/services/:id/update', servicesController.updateUserService);

// Slab routes
router.post('/slabs', authentication, slabController.registerService);
router.put('/slabs/:id', slabController.updateService);
router.get('/slabs', slabController.findAllService);
router.get('/slabs/:id', slabController.getService);
router.patch('/slabs/:id', slabController.partialUpdateService);
router.delete('/slabs/:id', slabController.deleteService);
router.post('/slabs/bulk-recharge', slabController.createBulkRecharge);
router.post('/slabs/dth', slabController.createDth);
router.post('/slabs/recharge', slabController.createRecharge);
router.get('/slabs/commission/all', slabController.findAllslabComm);
router.get('/slabs/commission/bbps', slabController.bbpsSlabComm);
router.get('/slabs/commission/zaakpay', slabController.zaakpaySlabComm);
router.get('/slabs/commission/recharge', slabController.findAllRechargeSlabComm);
router.get('/slabs/users', slabController.getSlabUser);
router.put('/slabs/users/:id', slabController.updateSlabUser);
router.get('/slabs/all', slabController.getAllSlab);
router.get('/slabs/commission/credit-card', slabController.creditCardSlabComm);

// Package routes
router.post('/packages', authentication, packageController.registerPackage);
router.get('/packages', packageController.findAllPackage);
router.get('/packages/:id', packageController.getPackage);
router.patch('/packages/:id', packageController.partialUpdatePackage);
router.get('/packages/:id/users', packageController.getUserPackage);
router.delete('/packages/:id', packageController.deletePackage);

// Service Charge routes
router.post('/service-charges', subscriptionController.createServiceCharge);
router.get('/service-charges', subscriptionController.getAllServiceCharges);
router.put('/service-charges/:id', subscriptionController.updateServiceCharge);
router.delete('/service-charges/:id', subscriptionController.deleteServiceCharge);

// Subscription routes
router.post('/subscriptions/:userId', subscriptionController.createSubscription);
router.get('/subscriptions', subscriptionController.getAllSubscriptions);
router.get('/subscriptions/user/:userId', subscriptionController.getUserSubscriptions);
router.get('/subscriptions/history/:userId', subscriptionController.getSubscriptionHistory);
router.put('/subscriptions/:id/cancel', subscriptionController.cancelSubscription);
router.get('/subscriptions/company/services', subscriptionController.getCompanySubscribedServices);

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
