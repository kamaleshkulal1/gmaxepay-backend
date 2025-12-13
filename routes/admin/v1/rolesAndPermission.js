const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const rolePermissionController = require('../../../controller/admin/v1/rolePermissionController');

router.put('/roles/permissions', authentication, rolePermissionController.updatePermission);
router.get('/roles/:roleId/permissions', authentication,   rolePermissionController.getPermissionByRoleId);
router.post('/roles/permissions', authentication, rolePermissionController.createPermission);
router.post('/roles/permission', authentication, rolePermissionController.createRolePermission);

module.exports = router;