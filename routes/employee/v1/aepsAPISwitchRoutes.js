const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const aepsAPISwitchController = require('../../../controller/employee/v1/aepsAPISwitchController');

router.post('/list', authentication, aepsAPISwitchController.getAllAepsAPISwitch);
router.post('/create', authentication, aepsAPISwitchController.createAepsAPISwitch);
router.post('/update', authentication, aepsAPISwitchController.updateAepsAPISwitch);
router.post('/delete', authentication, aepsAPISwitchController.deleteAepsAPISwitch);

module.exports = router;
