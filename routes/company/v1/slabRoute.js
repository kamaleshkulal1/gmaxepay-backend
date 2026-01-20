const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const slabController = require('../../../controller/company/v1/slabController');

// Create a new subslab (Basic, Gold, Platinum)
router.post('/create', authentication, slabController.createSubSlab);

// Get all subslabs for the company
router.get('/', authentication, slabController.getAllSubSlabs);

// Get a specific slab by ID
router.get('/:id', authentication, slabController.getSlab);

// Update a subslab
router.put('/:id', authentication, slabController.updateSubSlab);

module.exports = router;
