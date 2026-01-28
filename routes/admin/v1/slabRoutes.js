const express = require('express');
const router = express.Router();
const slabController = require('../../../controller/admin/v1/slabController');
const authentication = require('../../../middleware/authentication');

router.post('/', authentication, slabController.createSlab);
router.post('/list', authentication, slabController.getAllSlabs);
router.post('/slabcomm/:id', authentication, slabController.findAllslabComm);
router.post('/assign', authentication, slabController.assignSlabToCompany);
router.put('/update', authentication, slabController.updateSlabName);
router.put('/updateSlabComm', authentication, slabController.updateSlabComm);

module.exports = router;