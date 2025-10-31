const cors = require('cors');

const isAllowedOrigin = (origin) => {
  if (!origin) return false;
  
  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    const protocol = url.protocol.toLowerCase();
    
    // Allow localhost with any port (http://localhost:*, http://127.0.0.1:*, http://::1:*)
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return protocol === 'http:' || protocol === 'https:';
    }
    
    // Allow https://app.gmaxepay.in
    if (hostname === 'app.gmaxepay.in') {
      return protocol === 'https:';
    }
    
    // Allow subdomains of app.gmaxepay.in (e.g., www.app.gmaxepay.in)
    if (hostname.endsWith('.app.gmaxepay.in')) {
      return protocol === 'https:';
    }
    
    return false;
  } catch (error) {
    // If origin is not a valid URL, deny access
    return false;
  }
};

const onboardingCorsOptions = {
  origin: function (origin, callback) {
    // Handle preflight requests (OPTIONS) - origin might be undefined for same-origin requests
    // Same-origin requests don't send Origin header, but those are not CORS requests
    // For CORS requests, browsers always send Origin header
    if (!origin) {
      // For requests without origin (same-origin or API testing tools)
      // In development, allow for API testing. In production, reject for security
      const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';
      if (!isProduction) {
        callback(null, true);
        return;
      }
      // In production, reject requests without origin (they shouldn't happen for CORS)
      callback(new Error('Not allowed by CORS'));
      return;
    }
    
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-company-domain'],
  exposedHeaders: [],
  maxAge: 86400 // 24 hours
};

// Create a wrapper middleware that handles CORS errors gracefully
const corsMiddleware = cors(onboardingCorsOptions);

module.exports = (req, res, next) => {
  corsMiddleware(req, res, (err) => {
    if (err) {
      // Return custom JSON error response instead of default HTML error page
      return res.status(403).json({
        status: 'FAILURE',
        message: 'Sorry, you don\'t have access. We are recording your activity.',
        data: null
      });
    }
    next();
  });
};

