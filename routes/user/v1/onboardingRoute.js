const express = require('express');
const router = express.Router();
const onboardingController = require('../../../controller/user/v1/onboarding');
const { upload, uploadSingle, uploadFields, multer } = require('../../../middleware/multerConfig');

// Initial Step ReferCode
router.post('/postReferCode', onboardingController.postReferCode);

// Step 1: Mobile verification
router.post('/sendSmsOtp', onboardingController.sendSmsMobile);
router.post('/verifySmsOtp', onboardingController.verifySmsOtp);
router.post('/resetSmsOtp', onboardingController.resetSmsOtp);

// Step 2: Email verification
router.post('/sendEmailOtp', onboardingController.sendEmailOtp);
router.post('/verifyEmailOtp', onboardingController.verifyEmailOtp);
router.post('/resetEmailOtp', onboardingController.resetEmailOtp);

// Step 3: Aadhaar verification
router.post('/connectAadhaarVerification', onboardingController.connectAadhaarVerification);

router.post('/uploadAadhaarDocuments', uploadFields([
  { name: 'front_photo', maxCount: 1 },
  { name: 'back_photo', maxCount: 1 }
]), multer, onboardingController.uploadAadharDocuments);
// Step 4: PAN verification
router.post('/connectPanVerification', onboardingController.connectPanVerification);

router.post('/uploadPanDocuments', uploadFields([
    { name: 'front_photo', maxCount: 1 },
    { name: 'back_photo', maxCount: 1 }
  ]), multer, onboardingController.uploadPanDocuments);

router.post('/getDigilockerDocuments', onboardingController.getDigilockerDocuments);

// Step 5: Shop details
router.post('/postShopDetails', upload.single('shopImage'), multer, onboardingController.postShopDetails);

// Step 6: Bank details
router.post('/postBankDetails', onboardingController.postBankDetails);

// Step 7: Profile

router.post('/postProfile',
    uploadSingle('photo'),
    multer, 
 onboardingController.postProfile
);

// Utility: Get pending steps
router.post('/getPending', onboardingController.getPending);

module.exports = router;