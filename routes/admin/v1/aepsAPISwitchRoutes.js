const express = require('express');
const router = express.Router();
const aepsAPISwitchController = require('../../../controller/admin/v1/aepsAPISwitchController');
const authentication = require('../../../middleware/authentication');

router.post('/list', authentication, aepsAPISwitchController.getAllAepsAPISwitch);
router.post('/create', authentication, aepsAPISwitchController.createAepsAPISwitch);
router.post('/switch', authentication, aepsAPISwitchController.switchAepsAPI);
router.post('/update', authentication, aepsAPISwitchController.updateAepsAPISwitch);
router.post('/delete', authentication, aepsAPISwitchController.deleteAepsAPISwitch);

module.exports = router;
