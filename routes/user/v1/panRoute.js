const express = require('express');
const router = express.Router();
const pan1Controller = require('../../../controller/user/v1/pan1Controller');
const authentication = require('../../../middleware/authentication');

router.post('/actions', authentication, pan1Controller.panCardActions);

module.exports = router;

