const express = require('express');
const router = express.Router();
const path = require('path');
const companyController = require('../../../controller/company/v1/companyController');
const authentication = require('../../../middleware/authentication');
const multer = require('multer');

// Configure multer for memory storage (similar to imageRoutes)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: function (req, file, callback) {
    const allowedTypes = /jpeg|jpg|png|gif|webp|ico/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    
    // Check MIME type, including special handling for .ico files
    const allowedMimeTypes = /image\/(jpeg|jpg|png|gif|webp|x-icon|vnd\.microsoft\.icon)/;
    const mimetype = allowedMimeTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return callback(null, true);
    } else {
      callback(new Error('Only image files are allowed!'));
    }
  }
});

// Fields for logo, favicon, and multiple slider images
const uploadFields = upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'favicon', maxCount: 1 },
  { name: 'sliders', maxCount: 10 } // Allow up to 10 slider images
]);

router.post('/get', companyController.getCompanyDettails);
router.post('/update', authentication, uploadFields, companyController.updateCompany);

module.exports = router;