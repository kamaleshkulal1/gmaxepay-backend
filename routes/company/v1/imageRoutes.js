const express = require('express');
const router = express.Router();
const path = require('path');
const imageController = require('../../../controller/company/v1/imageController');
const multer = require('multer');

// Apply authentication middleware to all routes
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, callback) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return callback(null, true);
    } else {
      callback(new Error('Only image files are allowed!'));
    }
  }
});

// Upload image
router.post('/upload', upload.single('image'), imageController.uploadImage);

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

