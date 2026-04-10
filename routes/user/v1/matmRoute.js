const express = require('express');
const router = express.Router();
const matmController = require('../../../controller/user/v1/matmController');
const authentication = require('../../../middleware/authentication');

router.post('/transaction', authentication, matmController.processMatmTransaction);

module.exports = router;
