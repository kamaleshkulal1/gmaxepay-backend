const express = require('express');
const router = express.Router();
const pan2Controller = require('../../../controller/user/v1/pan2Controller');
const authentication = require('../../../middleware/authentication');

router.post('/actions', authentication, pan2Controller.panCard2Actions);

module.exports = router;
