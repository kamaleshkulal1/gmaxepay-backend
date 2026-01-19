const express = require('express');
const router = express.Router();
const slabController = require('../../../controller/admin/v1/slabController');
const authentication = require('../../../middleware/authentication');

router.post('/', authentication, slabController.createGlobalSlabTemplate);
router.post('/list', authentication, slabController.getAllGlobalSlabTemplates);
router.post('/slabcomm', authentication, slabController.findAllslabComm);
router.post('/assign', authentication, slabController.assignGlobalSlabToCompany);

module.exports = router;