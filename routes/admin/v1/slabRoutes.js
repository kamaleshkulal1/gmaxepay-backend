const express = require('express');
const router = express.Router();
const slabController = require('../../../controller/admin/v1/slabController');
const authentication = require('../../../middleware/authentication');

router.post('/global-templates', authentication, slabController.createGlobalSlabTemplate);
router.get('/global-templates', authentication, slabController.getAllGlobalSlabTemplates);
router.post('/global-templates/assign', authentication, slabController.assignGlobalSlabToCompany);

module.exports = router;