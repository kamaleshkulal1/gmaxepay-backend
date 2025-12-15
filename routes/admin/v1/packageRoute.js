const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const packageController = require('../../../controller/admin/v1/packageController');

router.post('/', authentication, packageController.registerPackage);
router.get('/', authentication, packageController.findAllPackage);
router.get('/:id', authentication, packageController.getPackage);
router.patch('/:id', authentication, packageController.partialUpdatePackage);
router.get('/:id/users', authentication, packageController.getUserPackage);
router.delete('/:id', authentication, packageController.deletePackage);


module.exports = router;