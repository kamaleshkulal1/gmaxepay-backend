const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const slabController = require('../../../controller/company/v1/slabController');

router.post('/create-slab', authentication, slabController.createSlab);
router.post('/list', authentication, slabController.getAllSlabs);
router.post('/slabcomm/:id', authentication, slabController.findAllslabComm);
router.put('/update/:id', authentication, slabController.updateSlabDetails);
router.put('/updateSlabComm/:id', authentication, slabController.updateSlabComm);
router.post('/upradeORChangeSlab/:id', authentication, slabController.upradeORChangeSlab);
module.exports = router;
