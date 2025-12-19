/**
 * index.js
 * @description :: index route of platforms
 */

const express = require('express');
const router = express.Router();
const { generalLimit } = require('../middleware/ratelimiter');

// SECURITY: Apply general rate limiting to all routes
router.use(generalLimit);

// Image proxy routes - accessible at /api/images/* (no v1 prefix)
const imageController = require('../controller/company/v1/imageController');
// Secure image route (with encrypted key)
router.get('/api/images/secure/:encryptedKey', imageController.serveSecureImage);
// Direct image route (for backward compatibility)
router.get(/^\/api\/images\/(.+)$/, imageController.serveImage);

// Log routes
router.use('/api/v1', require('./root'));

module.exports = router;