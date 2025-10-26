const express = require('express');
const companyController = require('../../controller/company/v1/companyController');
const imageRoutes = require('./v1/imageRoutes');
const router = express.Router();


router.post('/getCompanyDetails', companyController.getCompanyDettails);

// Image routes
router.use('/images', imageRoutes);

module.exports = router;