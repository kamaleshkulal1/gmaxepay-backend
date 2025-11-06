const express = require('express');
const authentication = require('../../../middleware/authentication');
const ekycHubController = require('../../../controller/admin/v1/eKycHubContoller');
const companyController = require('../../../controller/admin/v1/companyController');
const { upload, multer } = require('../../../middleware/multerConfig');
const router = express.Router();

router.post('/testCompletedAddress', companyController.testCompletedAddress);
router.post('/testMappplesMap', companyController.testMappplesMap);

router.post('/pan-verification', authentication, ekycHubController.ekycHubPanVerification );
router.post('/bank-verification', authentication, ekycHubController.ekycHubBankVerification );
router.post('/get-pincode-by-city', authentication, companyController.getPincodeByCity );
router.post('/get-city-by-pincode', authentication, companyController.getCityByPincode );
router.post('/get-company/:id', authentication, companyController.getCompanyById );
router.get('/company/:id', authentication, companyController.getCompanyById );
router.post('/upload-profile-image', authentication, upload.single('image'), multer, companyController.uploadProfileImage );
router.post('/create-company', authentication, upload.single('profileImage'), multer, companyController.createCompany );
router.put('/update-company/:id', authentication, companyController.updateCompany );
router.put('/update-logo-favicon/:id', authentication, upload.single('image'), multer, companyController.updateCompanyLogoAndFavicon );
router.post('/ip-check', authentication, companyController.getIpCheck );
// deactivate and resend onboarding link
router.post('/:token/deactivate-onboarding-link', authentication, companyController.deactivateOnboarding);
router.post('/:companyid/resend-onboarding-link', authentication, companyController.resendOnboardingLink);

module.exports = router;