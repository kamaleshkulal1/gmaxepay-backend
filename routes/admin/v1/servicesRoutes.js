const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const servicesController = require('../../../controller/admin/v1/servicesController');
const { uploadSingle, multer } = require('../../../middleware/multerConfig');

router.post('/', authentication, uploadSingle('icon'), multer, servicesController.registerService);
router.post('/list', authentication, servicesController.findAllServices);
router.post('/:id', authentication, servicesController.getServices);
router.put('/:id', authentication, uploadSingle('icon'), multer, servicesController.updateService);

module.exports = router;