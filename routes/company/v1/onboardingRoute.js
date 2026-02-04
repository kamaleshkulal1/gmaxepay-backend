const express = require('express');
const router = express.Router();
const onboardingController = require('../../../controller/auth/v1/onboardingController');
const onboardingCors = require('../../../middleware/onboardingCors');
const { upload, uploadSingle, uploadFields, multer } = require('../../../middleware/multerConfig');
// step 1
router.post('/:token', onboardingCors, onboardingController.verifyOnboardingLink);
router.post('/:token/sendSmsOtp', onboardingCors, onboardingController.sendSmsMobile);
router.post('/:token/verifySmsOtp', onboardingCors, onboardingController.verifySmsOtp);
router.post('/:token/resetSmsOtp', onboardingCors, onboardingController.resetSmsOtp);

//step 2
router.post('/:token/sendEmailOtp', onboardingCors, onboardingController.sendEmailOtp);
router.post('/:token/verifyEmailOtp', onboardingCors, onboardingController.verifyEmailOtp);
router.post('/:token/resetEmailOtp', onboardingCors, onboardingController.resetEmailOtp);

//step 3
router.post('/:token/connectAadhaarVerification', onboardingCors, onboardingController.connectAadhaarVerification);

//step 4
router.post('/:token/connectPanVerification', onboardingCors, onboardingController.connectPanVerification);
router.post('/:token/getDigilockerDocuments', onboardingCors, onboardingController.getDigilockerDocuments);

router.post('/:token/uploadAadharDocuments', onboardingCors, uploadFields([
  { name: 'front_photo', maxCount: 1 },
  { name: 'back_photo', maxCount: 1 }
]), multer, onboardingController.uploadFrontBackAadharDocuments);

router.post('/:token/uploadPanDocuments', onboardingCors, uploadSingle('front_photo'), multer, onboardingController.uploadFrontBackPanDocuments);

//step 5
router.post('/:token/postShopDetails', uploadSingle('shopImage'), multer, onboardingController.postShopDetails);


router.post('/:token/postBankDetails', onboardingCors, onboardingController.postBankDetails);


router.post('/:token/postProfile',
  uploadSingle('photo'),
  multer,
  onboardingCors,
  onboardingController.postProfile
);

router.post('/:token/getPending', onboardingCors, onboardingController.getPending);
router.post('/:token/complete', onboardingCors, onboardingController.completeOnboarding);

module.exports = router;