const express = require('express');
const router = express.Router();
const slabController = require('../../../controller/user/v1/slabController');
const authentication = require('../../../middleware/authentication');

router.post('/create-slab', authentication, slabController.createSlab);
router.post('/list', authentication, slabController.getAllSlabs);
router.post('/slabcomm/:id', authentication, slabController.findAllslabComm);
router.put('/update/:id', authentication, slabController.updateSlabDetails);
router.put('/updateSlabComm/:id', authentication, slabController.updateSlabComm);


module.exports = router;