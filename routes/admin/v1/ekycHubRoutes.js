const express = require('express');
const ekycHubController = require('../../../controller/admin/v1/eKycHubContoller');
const authentication = require('../../../middleware/authentication');

const router = express.Router();

router.post('/balance',authentication, ekycHubController.ekycHubBalanceEnquiry);

module.exports = router;