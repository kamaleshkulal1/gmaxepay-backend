const express = require('express');
const router = express.Router();
const companyController = require('../../../controller/company/v1/companyController');
const authentication = require('../../../middleware/authentication');
const { upload, multer } = require('../../../middleware/multerConfig');

// Fields for logo, favicon, and multiple slider images
const uploadFields = upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'favicon', maxCount: 1 },
  { name: 'sliders', maxCount: 10 } // Allow up to 10 slider images
]);

router.post('/get', companyController.getCompanyDetails);
router.post('/update', authentication, uploadFields, multer, companyController.updateCompany);
router.post('/images', authentication, companyController.getAllCompanyImages);
router.post('/delete/:id', authentication, companyController.deleteCompany);
router.post('/support-contacts', authentication, companyController.getSupportContacts);
router.post('/support-email', authentication, companyController.updateSupportEmail);
router.post('/support-phone/add', authentication, companyController.addSupportPhone);
router.post('/support-phone/remove', authentication, companyController.removeSupportPhone);

module.exports = router;