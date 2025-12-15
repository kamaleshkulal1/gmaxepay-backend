const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const { uploadSingle, multer } = require('../../../middleware/multerConfig');
const servicesController = require('../../../controller/admin/v1/servicesController');

router.post('/', authentication, uploadSingle('image'), multer, servicesController.registerService);
router.get('/', authentication, servicesController.findAllServices);
router.get('/active', authentication, servicesController.getActiveServices);
router.get('/service/:id', authentication, servicesController.getServiceById);
router.put('/service/:id', authentication, uploadSingle('image'), multer, servicesController.updateService);
router.delete('/service/:id', authentication, servicesController.deleteService);

// Package-Service relationship routes
router.post('/packages', authentication, servicesController.registerServicePackage);
router.get('/:id', authentication, servicesController.getServices);

// User-Package-Service routes
router.put('/:id', authentication, servicesController.updateUserPackage);
router.get('/:id/packages', authentication, servicesController.listUserPackage);
router.put('/:id/update', authentication, servicesController.updateUserService);

module.exports = router;