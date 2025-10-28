const express = require('express');
const authentication = require('../../../middleware/authentication');
const ekycHubController = require('../../../controller/admin/v1/eKycHubContoller');
const companyController = require('../../../controller/admin/v1/companyController');
const multer = require('multer');
const router = express.Router();

// Multer configuration for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

router.post('/pan-verification', authentication, ekycHubController.ekycHubPanVerification );
router.post('/bank-verification', authentication, ekycHubController.ekycHubBankVerification );
router.post('/get-pincode-by-city', authentication, companyController.getPincodeByCity );
router.post('/get-city-by-pincode', authentication, companyController.getCityByPincode );
router.post('/get-company/:id', authentication, companyController.getCompanyById );
router.get('/company/:id', authentication, companyController.getCompanyById );
router.post('/upload-profile-image', authentication, upload.single('image'), companyController.uploadProfileImage );
router.post('/create-company', authentication,upload.single('profileImage'), companyController.createCompany );
router.put('/update-company/:id', authentication, companyController.updateCompany );
router.put('/update-logo-favicon/:id', authentication, upload.single('image'), companyController.updateCompanyLogoAndFavicon );
router.post('/ip-check', authentication, companyController.getIpCheck );

module.exports = router;