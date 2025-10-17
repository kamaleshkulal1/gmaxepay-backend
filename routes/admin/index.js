/**
 * admin/index.js
 * @description :: admin routes
 */

const express = require('express');
const router = express.Router();

// Import admin controllers
const userController = require('../../controller/admin/v1/userController');
const rolePermissionController = require('../../controller/admin/v1/rolePermissionController');
const servicesController = require('../../controller/admin/v1/servicesController');
const slabController = require('../../controller/admin/v1/slabController');
const packageController = require('../../controller/admin/v1/packageController');
const operatorController = require('../../controller/admin/v1/operatorController');

// User management routes
router.use('/users', userController);

// Role and permission routes
router.use('/roles', rolePermissionController);

// Services routes
router.use('/services', servicesController);

// Slab routes
router.use('/slabs', slabController);

// Package routes
router.use('/packages', packageController);

// Operator routes
router.use('/operators', operatorController);

module.exports = router;
