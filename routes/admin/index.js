/**
 * admin/index.js
 * @description :: admin routes
 */

const express = require('express');
const router = express.Router();
const authentication = require('../../middleware/authentication');

// Apply authentication middleware to all admin routes
router.use(authentication);

// Import admin controllers
const userController = require('../../controller/admin/v1/userController');
const rolePermissionController = require('../../controller/admin/v1/rolePermissionController');
const servicesController = require('../../controller/admin/v1/servicesController');
const slabController = require('../../controller/admin/v1/slabController');
const packageController = require('../../controller/admin/v1/packageController');
const operatorController = require('../../controller/admin/v1/operatorController');

// User management routes
router.post('/users', userController.createUser);
router.get('/users', userController.findAllUsers);
router.get('/users/:id', userController.getUser);
router.put('/users/:id', userController.updateUser);
router.delete('/users/:id', userController.deleteUser);

// Role and permission routes
router.put('/roles/permissions', rolePermissionController.updatePermission);
router.get('/roles/:roleId/permissions', rolePermissionController.getPermissionByRoleId);
router.post('/roles/permissions', rolePermissionController.createPermission);
router.post('/roles/permission', rolePermissionController.createRolePermission);

// Services routes
router.post('/services', servicesController.registerService);
router.get('/services', servicesController.findAllServices);
router.post('/services/packages', servicesController.registerServicePackage);
router.get('/services/:id', servicesController.getServices);
router.put('/services/:id', servicesController.updateUserPackage);
router.get('/services/:id/packages', servicesController.listUserPackage);
router.put('/services/:id/update', servicesController.updateUserService);

// Slab routes
router.post('/slabs', slabController.registerService);
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
router.post('/packages', packageController.registerPackage);
router.get('/packages', packageController.findAllPackage);
router.get('/packages/:id', packageController.getPackage);
router.patch('/packages/:id', packageController.partialUpdatePackage);
router.get('/packages/:id/users', packageController.getUserPackage);
router.delete('/packages/:id', packageController.deletePackage);

// Operator routes
router.post('/operators', operatorController.registerService);
router.get('/operators', operatorController.findAllService);
router.get('/operators/:id', operatorController.getService);
router.patch('/operators/:id', operatorController.partialUpdateService);
router.delete('/operators/:id', operatorController.deleteService);
router.get('/operators/states', operatorController.findAllstate);
router.get('/operators/types', operatorController.findAlloperatorType);
router.get('/operators/list', operatorController.operatorList);

module.exports = router;
