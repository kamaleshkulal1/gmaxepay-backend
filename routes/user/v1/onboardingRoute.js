const express = require('express');
const router = express.Router();
const onboardingController = require('../../../controller/user/v1/onboarding');

// Step 1: Mobile verification
router.post('/onboarding/sendSmsOtp', onboardingController.sendSmsMobile);
router.post('/onboarding/verifySmsOtp', onboardingController.verifySmsOtp);
router.post('/onboarding/resetSmsOtp', onboardingController.resetSmsOtp);

// Step 2: Email verification
router.post('/onboarding/sendEmailOtp', onboardingController.sendEmailOtp);
router.post('/onboarding/verifyEmailOtp', onboardingController.verifyEmailOtp);
router.post('/onboarding/resetEmailOtp', onboardingController.resetEmailOtp);

// Step 3: Aadhaar verification
router.post('/onboarding/connectAadhaarVerification', onboardingController.connectAadhaarVerification);

// Step 4: PAN verification
router.post('/onboarding/connectPanVerification', onboardingController.connectPanVerification);
router.post('/onboarding/getDigilockerDocuments', onboardingController.getDigilockerDocuments);

// Step 5: Shop details
router.post('/onboarding/postShopDetails', onboardingController.postShopDetails);

// Step 6: Bank details
router.post('/onboarding/postBankDetails', onboardingController.postBankDetails);

// Step 7: Profile
router.post('/onboarding/postProfile', onboardingController.postProfile);

// Utility: Get pending steps
router.post('/onboarding/getPending', onboardingController.getPending);

module.exports = router;