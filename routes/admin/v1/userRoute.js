const express = require('express');
const router = express.Router();
const userController = require('../../../controller/admin/v1/userController');
const authentication = require('../../../middleware/authentication');

router.post('/create', userController.createUser);
router.post('/list', authentication, userController.findAllUsers);
router.post('/:id', authentication, userController.getUser);
router.put('/:id', authentication, userController.updateUser);
router.delete('/:id', authentication, userController.deleteUser);

// Account unlock API
router.post('/:id/unlock', authentication, userController.unlockAccount);

// KYC APIs
router.post('/:id/kyc/status', authentication, userController.getKycVerificationStatus);
router.post('/:id/kyc/complete', authentication, userController.getCompleteKycData);
router.post('/:id/kyc/revert', authentication, userController.revertKycData);



module.exports = router;
