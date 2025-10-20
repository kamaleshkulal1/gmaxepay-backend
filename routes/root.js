/**
 * index.js
 * @description :: index route of platforms
 */

const express = require('express');
const router = express.Router();
const { authLimit } = require('../middleware/ratelimiter');

// Log routes (no rate limiting)
router.use('/apilogger', require('./logRoutes'));

// Auth routes with rate limiting
router.use('/auth', authLimit, require('./auth/index'));

// Admin routes (protected with authentication middleware)
router.use('/admin', require('./admin/index'));

module.exports = router;