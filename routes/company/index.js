const express = require('express');
const router = express.Router();
const authentication = require('../../middleware/authentication');

router.use('/companyDetails', require('./v1/companyRoutes'));
// Image routes
router.use('/images',authentication, require('./v1/imageRoutes'));

module.exports = router;