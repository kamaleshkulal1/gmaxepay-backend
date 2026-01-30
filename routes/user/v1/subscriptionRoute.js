const express = require('express');
const router = express.Router();
const subscriptionController = require('../../../controller/user/v1/subscriptionController');
const authentication = require('../../../middleware/authentication');

router.post('/list', authentication, subscriptionController.getAllSubscriptions);

module.exports = router;