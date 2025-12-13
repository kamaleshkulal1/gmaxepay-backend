const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const slabController = require('../../../controller/admin/v1/slabController');
const subSlabController = require('../../../controller/admin/v1/subSlabController');

// Slab routes (Super Admin creates global slabs)
router.post('/', authentication, slabController.registerService);
router.get('/', slabController.findAllService);
router.get('/all', authentication, slabController.getAllSlab);
router.get('/:id', slabController.getService);
router.put('/:id', slabController.updateService);
router.patch('/:id', slabController.partialUpdateService);
router.delete('/:id', slabController.deleteService);

// Slab commission routes
router.get('/commission/all', slabController.findAllslabComm);
router.get('/commission/bbps', slabController.bbpsSlabComm);
router.get('/commission/zaakpay', slabController.zaakpaySlabComm);
router.get('/commission/recharge', slabController.findAllRechargeSlabComm);
router.get('/commission/credit-card', slabController.creditCardSlabComm);

// Slab bulk operations
router.post('/bulk-recharge', slabController.createBulkRecharge);
router.post('/dth', slabController.createDth);
router.post('/recharge', slabController.createRecharge);

// Slab user management
router.get('/users', slabController.getSlabUser);
router.put('/users/:id', slabController.updateSlabUser);

// Package upgrade (for company admins)
router.post('/upgrade-package', authentication, slabController.upgradePackage);

// Sub-Slab routes (Company, MD, Distributor create their commercials)
router.post('/sub-slabs', authentication, subSlabController.createSubSlab);
router.get('/sub-slabs', authentication, subSlabController.getAllSubSlabs);
router.get('/sub-slabs/:id', authentication, subSlabController.getSubSlab);
router.put('/sub-slabs/:id', authentication, subSlabController.updateSubSlab);
router.delete('/sub-slabs/:id', authentication, subSlabController.deleteSubSlab);
router.post('/sub-slabs/:id/assign-users', authentication, subSlabController.assignUsersToSubSlab);
router.post('/sub-slabs/:id/remove-users', authentication, subSlabController.removeUsersFromSubSlab);

// Sub-Slab Commercial routes
router.post('/sub-slabs/commercial', authentication, subSlabController.updateSubSlabCommercial);
router.post('/sub-slabs/pg-commercial', authentication, subSlabController.updateSubSlabPgCommercial);

module.exports = router;

