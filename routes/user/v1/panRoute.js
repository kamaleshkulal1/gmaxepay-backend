const express = require('express');
const router = express.Router();
const panCardController = require('../../../controller/user/v1/panCardController');
const authentication = require('../../../middleware/authentication');

router.post('/actions', authentication, panCardController.panCardActions);

module.exports = router;

