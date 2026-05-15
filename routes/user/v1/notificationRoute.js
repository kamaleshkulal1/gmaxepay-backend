const express = require('express');
const router = express.Router();
const notificationController = require('../../../controller/user/v1/notificationController');
const authentication = require('../../../middleware/authentication');

router.post('/getAll', authentication, notificationController.getAllNotifications);
router.post('/markAsRead', authentication, notificationController.markAsRead);

module.exports = router;
