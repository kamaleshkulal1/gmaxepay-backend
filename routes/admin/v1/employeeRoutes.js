const express = require('express');
const router = express.Router();
const userController = require('../../../controller/admin/v1/userController');
const authentication = require('../../../middleware/authentication');

router.post('/create', authentication, userController.createEmployee);
router.post('/resend/:id', authentication, userController.resendEmployeePassword);


module.exports = router;
