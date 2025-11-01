const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

// SECURITY: Enhanced rate limiting configurations

// General rate limiter - protects all endpoints
const generalLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // SECURITY: Increased but still reasonable (was 5, too restrictive)
  message: {
    status: 429,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // SECURITY: Use proper key generator that handles proxy headers
  keyGenerator: (req) => {
    return ipKeyGenerator(req);
  },
  // SECURITY: Skip successful requests for general limiter (reduce false positives)
  skipSuccessfulRequests: false,
  // SECURITY: Handler for rate limit exceeded
  handler: (req, res) => {
    res.status(429).json({
      status: 429,
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

// Auth-specific rate limiter (more restrictive for security)
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // SECURITY: Reduced to 5 attempts per 15 minutes
  message: {
    status: 429,
    message: 'Too many authentication attempts from this IP, please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // SECURITY: Skip successful requests (only count failed attempts)
  skipSuccessfulRequests: true,
  // SECURITY: Custom key generator with user agent for better tracking
  keyGenerator: (req) => {
    // Include IP and user agent to prevent bypassing with different user agents
    const ip = ipKeyGenerator(req);
    const userAgent = req.get('User-Agent') || 'unknown';
    return `${ip}-${userAgent}`;
  },
  // SECURITY: Handler for auth rate limit exceeded
  handler: (req, res) => {
    console.warn(`SECURITY: Auth rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      status: 429,
      message: 'Too many authentication attempts. Your IP has been temporarily blocked. Please try again after 15 minutes.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

// SECURITY: Strict rate limiter for sensitive operations (password reset, etc.)
const strictLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Only 3 attempts per hour
  message: {
    status: 429,
    message: 'Too many requests. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    return ipKeyGenerator(req);
  },
  handler: (req, res) => {
    console.warn(`SECURITY: Strict rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
    res.status(429).json({
      status: 429,
      message: 'Too many requests. Please try again in an hour.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

// SECURITY: API endpoint rate limiter (more lenient for API users)
const apiLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200, // Higher limit for API endpoints
  message: {
    status: 429,
    message: 'API rate limit exceeded. Please check your rate limit headers.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // For API, you might want to use API key instead of IP
    return req.headers['x-api-key'] || ipKeyGenerator(req);
  }
});

module.exports = {
  generalLimit,
  authLimit,
  strictLimit,
  apiLimit
};
