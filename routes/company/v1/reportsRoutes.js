const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const reportController = require('../../../controller/company/v1/reportController');

router.post('/aeps1Reports', authentication, reportController.getAeps1Reports);
router.post('/aeps2Reports', authentication, reportController.getAeps2Reports);
router.post('/recharge1Reports', authentication, reportController.getRecharge1Reports);
router.post('/recharge2Reports', authentication, reportController.getRecharge2Reports);
router.post('/bbpReports', authentication, reportController.getBbpReports);
router.post('/aeps2/aeps2TransactionDetailsById/:id', authentication, reportController.getAeps2TransactionDetailsById);

module.exports = router;

