
const express = require('express');
const router = express.Router();
const { generalLimit } = require('../middleware/ratelimiter');
router.use(generalLimit);

const imageController = require('../controller/company/v1/imageController');
router.get('/api/images/secure/:encryptedKey', imageController.serveSecureImage);
router.get(/^\/api\/images\/(.+)$/, imageController.serveImage);

router.use('/api/v1', require('./root'));

module.exports = router;