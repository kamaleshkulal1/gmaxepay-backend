const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const slabController = require('../../../controller/admin/v1/slabController');
const subSlabController = require('../../../controller/admin/v1/subSlabController');

// Users (MD, Distributor, Retailer) can view accessible slabs and manage their sub-slabs
router.get('/slabs', authentication, slabController.findAllService);
router.get('/slabs/all', authentication, slabController.getAllSlab);
router.get('/slabs/:id', authentication, slabController.getService);

// User sub-slab routes (MD, Distributor can create their own sub-slabs)
router.post('/sub-slabs', authentication, subSlabController.createSubSlab);
router.get('/sub-slabs', authentication, subSlabController.getAllSubSlabs);
router.get('/sub-slabs/:id', authentication, subSlabController.getSubSlab);
router.put('/sub-slabs/:id', authentication, subSlabController.updateSubSlab);
router.delete('/sub-slabs/:id', authentication, subSlabController.deleteSubSlab);
router.post('/sub-slabs/:id/assign-users', authentication, subSlabController.assignUsersToSubSlab);
router.post('/sub-slabs/:id/remove-users', authentication, subSlabController.removeUsersFromSubSlab);

module.exports = router;

