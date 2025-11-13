const express = require('express');
const router = express.Router();
const aepsController = require('../../controller/user/v1/aepsController');
const authentication = require('../../middleware/authentication');

router.post('/onboarding', authentication, aepsController.aepsOnboarding);

module.exports = router;