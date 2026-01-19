const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const slabController = require('../../../controller/admin/v1/slabController');

// Company Slab routes (Company Admin creates company-specific slabs)
router.post('/slabs', authentication, slabController.createCompanySlab);
router.get('/slabs', authentication, slabController.getAllCompanySlabs);

module.exports = router;
