const express = require('express');
const router = express.Router();
const mposController = require('../../../controller/user/v1/mposController');
const authentication = require('../../../middleware/authentication');

router.post('/transaction', authentication, mposController.processMposTransaction);

module.exports = router;
