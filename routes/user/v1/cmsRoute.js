const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const cmsController = require('../../../controller/user/v1/cmsController');

router.post('/initiate', authentication, cmsController.initiateCms);
router.post('/cmsReports', authentication, cmsController.getCmsReports);

module.exports = router;
