
const express = require('express');
const router = express.Router();
const practomindController = require('../../../controller/admin/v1/practomindController');
const authentication = require('../../../middleware/authentication');
const { upload, multer } = require('../../../middleware/multerConfig');

router.post('/banks/create', authentication, upload.single('bankLogo'), multer, practomindController.createBank);
router.put('/banks/update/:id', authentication, upload.single('bankLogo'), multer, practomindController.updateBank);
router.post('/banks/delete/:id', authentication, practomindController.deleteBank);
router.post('/banks/get/:id', authentication, practomindController.getBankById);
router.post('/banks/get-all', authentication, practomindController.getAllBanks);

router.post('/company-codes/create', authentication, practomindController.createCompanyCode);
router.put('/company-codes/update/:id', authentication, practomindController.updateCompanyCode);
router.post('/company-codes/delete/:id', authentication, practomindController.deleteCompanyCode);
router.post('/company-codes/get/:id', authentication, practomindController.getCompanyCodeById);
router.post('/company-codes/get-all',  practomindController.getAllCompanyCodes);

router.post('/states/create', authentication, practomindController.createState);
router.put('/states/update/:id', authentication, practomindController.updateState);
router.post('/states/delete/:id', authentication, practomindController.deleteState);
router.post('/states/get/:id', authentication, practomindController.getStateById);
router.post('/states/get-all', authentication, practomindController.getAllStates);

module.exports = router;

