const express = require('express');
const router = express.Router();
const onboardingController = require('../../../controller/auth/v1/onboardingController');
// step 1
router.post('/:token', onboardingController.verifyOnboardingLink);
router.post('/:token/sendSmsOtp', onboardingController.sendSmsMobile);
router.post('/:token/verifySmsOtp', onboardingController.verifySmsOtp);
router.post('/:token/resetSmsOtp', onboardingController.resetSmsOtp);

//step 2
router.post('/:token/sendEmailOtp', onboardingController.sendEmailOtp);
router.post('/:token/verifyEmailOtp', onboardingController.verifyEmailOtp);
router.post('/:token/resetEmailOtp', onboardingController.resetEmailOtp);

//step 3
router.post('/:token/connectAadhaarVerification', onboardingController.connectAadhaarVerification);
router.post('/:token/connectPanVerification', onboardingController.connectPanVerification);
router.post('/:token/getDigilockerDocuments', onboardingController.getDigilockerDocuments);

//step 4
router.post('/:token/postShopDetails', onboardingController.postShopDetails);

module.exports = router;