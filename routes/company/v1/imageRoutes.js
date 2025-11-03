const express = require('express');
const router = express.Router();
const imageController = require('../../../controller/company/v1/imageController');
const authentication = require('../../../middleware/authentication');
const { upload, multer } = require('../../../middleware/multerConfig');

// Upload image
router.post('/upload', authentication, upload.single('image'), multer, imageController.uploadImage);

// Get all images
router.get('/all', imageController.getAllImages);

// Get images by category
router.get('/category', imageController.getImagesByCategory);

// Get single image by ID
router.get('/:id', imageController.getImageById);

// Update image
router.put('/:id', upload.single('image'), multer, imageController.updateImage);

// Delete image
router.delete('/:id', imageController.deleteImage);

module.exports = router;
