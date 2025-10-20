const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

// General rate limiter
const generalLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many requests from this IP, please try again in a minute.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false // Disable the `X-RateLimit-*` headers
});

// Auth-specific rate limiter (more restrictive for security)
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 auth requests per 15 minutes
  message: {
    status: 429,
    message: 'Too many authentication attempts from this IP, please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests (only count failed attempts)
  skipSuccessfulRequests: true,
  // Custom key generator to include user agent for better tracking with proper IPv6 support
  keyGenerator: (req) => {
    return `${ipKeyGenerator(req)}-${req.get('User-Agent')}`;
  }
});

module.exports = {
  generalLimit,
  authLimit
};
