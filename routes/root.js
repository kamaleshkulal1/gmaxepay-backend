/**
 * index.js
 * @description :: index route of platforms
 */

const express = require('express');
const router = express.Router();
const { authLimit } = require('../middleware/ratelimiter');
const imageController = require('../controller/company/v1/imageController');

// Image proxy route (no authentication required) - MUST be first to avoid conflicts
// Mounted at /api/v1, so this matches /api/v1/images/*
router.get(/^\/images\/(.+)$/, imageController.serveImage);

// Log routes (no rate limiting)
router.use('/apilogger', require('./logRoutes'));

// Auth routes with rate limiting
router.use('/auth', authLimit, require('./auth/index'));

// Admin routes (protected with authentication middleware)
router.use('/admin', require('./admin/index'));

router.use('/company', require('./company/index'));

module.exports = router;