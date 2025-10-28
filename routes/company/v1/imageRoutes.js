const express = require('express');
const router = express.Router();
const path = require('path');
const imageController = require('../../../controller/company/v1/imageController');
const authentication = require('../../../middleware/authentication');
const multer = require('multer');

// Apply authentication middleware to all routes
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

// Upload image
router.post('/upload', authentication, upload.single('image'), imageController.uploadImage);

// Get all images
router.get('/all', imageController.getAllImages);

// Get images by category
router.get('/category', imageController.getImagesByCategory);

// Get single image by ID
router.get('/:id', imageController.getImageById);

// Update image
router.put('/:id', upload.single('image'), imageController.updateImage);

// Delete image
router.delete('/:id', imageController.deleteImage);

module.exports = router;
