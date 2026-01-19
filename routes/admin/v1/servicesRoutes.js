const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const servicesController = require('../../../controller/admin/v1/servicesController');

router.post('/', authentication, servicesController.registerService);
router.post('/list', authentication, servicesController.findAllServices);
router.post('/packages', authentication, servicesController.registerServicePackage);
router.get('/:id', authentication, servicesController.getServices);
router.put('/:id', authentication, servicesController.updateUserPackage);
router.get('/:id/packages', authentication, servicesController.listUserPackage);
router.put('/:id/update', authentication, servicesController.updateUserService);

module.exports = router;