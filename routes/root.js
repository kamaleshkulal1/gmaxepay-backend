
const express = require('express');
const router = express.Router();
const { authLimit } = require('../middleware/ratelimiter');
const imageController = require('../controller/company/v1/imageController');


router.get('/images/secure/:encryptedKey', imageController.serveSecureImage);
router.get(/^\/images\/(.+)$/, imageController.serveImage);

router.use('/apilogger', require('./logRoutes'));

router.use('/auth', authLimit, require('./auth/index'));

router.use('/admin', require('./admin/index'));

router.use('/company', require('./company/index'));

router.use('/user', require('./user/index'));


module.exports = router;