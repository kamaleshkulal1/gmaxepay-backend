/**
 * index.js
 * @description :: index route of platforms
 */

const express = require('express');
const router = express.Router();
/*
 * const rateLimit = require('express-rate-limit');
 * const rateLimiter = rateLimit({
 *   windowMs: 10 * 60 * 1000,
 *   max: process.env.TOTAL_RATELIMIT,
 *   message: {
 *     status: 429,
 *     message: 'Rate limit exceeded, please try again after 10 minutes'
 *   }
 * });
 */

// router.use(rateLimiter);

// router.use(require('./MainRoute/v1/index'));
// router.use(require('./retailer/v1/index'));

// Image proxy route - accessible at /api/images/* (no v1 prefix)
const imageController = require('../controller/company/v1/imageController');
router.get(/^\/api\/images\/(.+)$/, imageController.serveImage);

// Log routes
router.use('/api/v1', require('./root'));

module.exports = router;