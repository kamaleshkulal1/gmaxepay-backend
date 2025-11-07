const express = require('express');
const router = express.Router();
const userController = require('../../../controller/user/v1/userDetails');
const authentication = require('../../../middleware/authentication');

router.post('/getProfile', authentication, userController.getProfile);

module.exports = router;