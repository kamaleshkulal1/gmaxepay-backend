const express = require('express');
const router = express.Router();
const dmtController = require('../../../controller/user/v1/dmtContoller');

// DMT Onboarding Status
router.post('/onboardingStatus', dmtController.getDmtOnboardingStatus);

// DMT Sender Registration
router.post('/senderRegistration', dmtController.createRegistration);

// DMT OTP
router.post('/receiveOtp', dmtController.ReceiveOtp);
router.post('/verifyOtp', dmtController.VerifyOtp);

// DMT Beneficiary
router.post('/addBeneficiary', dmtController.AddBeneficiary);
router.post('/getBeneficiary', dmtController.GetBeneficiary);
router.post('/getBeneficiaryName', dmtController.GetBeneficiaryName);
router.post('/getBeneficiaryDetails', dmtController.GetBeneficiaryDetails);

// DMT Money Transfer
router.post('/moneyTransfer', dmtController.MoneyTransfer);

module.exports = router;