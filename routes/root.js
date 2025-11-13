/**
 * index.js
 * @description :: index route of platforms
 */

const express = require('express');
const router = express.Router();
const { authLimit } = require('../middleware/ratelimiter');
const imageController = require('../controller/company/v1/imageController');

// Image proxy routes (no authentication required) - MUST be first to avoid conflicts
// Mounted at /api/v1, so these match /api/v1/images/*
// Secure image route (with encrypted key)
router.get('/images/secure/:encryptedKey', imageController.serveSecureImage);
// Direct image route (for backward compatibility)
router.get(/^\/images\/(.+)$/, imageController.serveImage);

// Log routes (no rate limiting)
router.use('/apilogger', require('./logRoutes'));

// Auth routes with rate limiting
router.use('/auth', authLimit, require('./auth/index'));

// Admin routes (protected with authentication middleware)
router.use('/admin', require('./admin/index'));

router.use('/company', require('./company/index'));

router.use('/user', require('./user/index'));


module.exports = router;