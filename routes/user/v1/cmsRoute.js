const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const cmsController = require('../../../controller/user/v1/cmsController');

// Requires user authentication to initiate CMS
router.post('/initiate', authentication, cmsController.initiateCms);

module.exports = router;
