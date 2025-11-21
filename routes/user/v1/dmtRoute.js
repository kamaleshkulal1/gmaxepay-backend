const express = require('express');
const router = express.Router();
const dmtController = require('../../../controller/user/v1/dmtContoller');

router.post('/senderRegistration', dmtController.registerSender);

module.exports = router;