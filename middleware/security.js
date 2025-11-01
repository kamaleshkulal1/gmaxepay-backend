/**
 * security.js
 * @description: Security middleware for input sanitization, XSS protection, and more
 */

const { MESSAGE } = require('../constants/msgConstant');

/**
 * SECURITY: Input sanitization middleware
 * Removes potentially dangerous characters and patterns
 */
const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      // Remove potential XSS patterns
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') 
        .trim();
    } else if (Array.isArray(obj)) {
      return obj.map(sanitize);
    } else if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          sanitized[key] = sanitize(obj[key]);
        }
      }
      return sanitized;
    }
    return obj;
  };

  // Sanitize body, query, and params
  if (req.body) {
    req.body = sanitize(req.body);
  }
  if (req.query) {
    req.query = sanitize(req.query);
  }
  if (req.params) {
    req.params = sanitize(req.params);
  }

  next();
};

/**
 * SECURITY: Prevent NoSQL injection attempts
 */
const preventNoSqlInjection = (req, res, next) => {
  const sendFailureResponse = (message) => {
    if (typeof res.failure === 'function') {
      return res.failure({ message });
    }
    // Fallback to standard Express response if responseHandler hasn't run
    if (!res.headersSent) {
      return res.status(200).json({
        status: 'FAILURE',
        message: message,
        data: null
      });
    }
  };

  const checkForNoSqlInjection = (obj, path = '') => {
    if (typeof obj === 'string') {
      // Check for MongoDB injection patterns
      const dangerousPatterns = [
        /\$where/i,
        /\$ne/i,
        /\$gt/i,
        /\$gte/i,
        /\$lt/i,
        /\$lte/i,
        /\$in/i,
        /\$nin/i,
        /\$regex/i,
        /\$exists/i,
        /\$type/i,
        /\$mod/i,
        /\$text/i,
        /\$search/i,
        /\$geoWithin/i,
        /\$geoIntersects/i,
        /\$near/i,
        /\$nearSphere/i,
        /javascript:/i,
        /\.exec/i,
        /\.find/i,
        /\.eval/i
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(obj)) {
          console.warn(`SECURITY: Blocked potential NoSQL injection at ${path}`);
          return sendFailureResponse('Invalid input detected. Please check your input and try again.');
        }
      }
    } else if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const result = checkForNoSqlInjection(obj[i], `${path}[${i}]`);
        if (result) return result;
      }
    } else if (obj && typeof obj === 'object') {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          // Check if key itself is dangerous
          if (key.startsWith('$') && key !== '$or' && key !== '$and') {
            console.warn(`SECURITY: Blocked dangerous key: ${key} at ${path}`);
            return sendFailureResponse('Invalid input detected. Please check your input and try again.');
          }
          const result = checkForNoSqlInjection(obj[key], path ? `${path}.${key}` : key);
          if (result) return result;
        }
      }
    }
    return null;
  };

  const result = 
    checkForNoSqlInjection(req.body, 'body') ||
    checkForNoSqlInjection(req.query, 'query') ||
    checkForNoSqlInjection(req.params, 'params');

  if (!result) {
    next();
  }
};

/**
 * SECURITY: Request ID generator for tracking
 */
const requestId = (req, res, next) => {
  req.id = req.headers['x-request-id'] || 
           `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('x-request-id', req.id);
  next();
};

/**
 * SECURITY: Error handler that doesn't leak sensitive information
 */
const secureErrorHandler = (err, req, res, next) => {
  // Log full error for internal debugging
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    requestId: req.id,
    path: req.path,
    method: req.method
  });

  // Check if response handler methods are available, otherwise use standard Express responses
  const sendResponse = (statusCode, message, data = null) => {
    if (res.headersSent) return;
    res.status(statusCode).json({
      status: statusCode >= 500 ? 'SERVER_ERROR' : statusCode >= 400 ? 'FAILURE' : 'SUCCESS',
      message: message,
      data: data
    });
  };

  // Don't expose sensitive error details to client
  if (process.env.NODE_ENV === 'production') {
    // In production, send generic error messages
    if (err.name === 'SequelizeValidationError' || err.name === 'ValidationError') {
      if (typeof res.validationError === 'function') {
        return res.validationError({ 
          message: 'Validation failed. Please check your input.' 
        });
      }
      return sendResponse(422, 'Validation failed. Please check your input.');
    }
    
    if (err.name === 'SequelizeDatabaseError') {
      if (typeof res.internalServerError === 'function') {
        return res.internalServerError({ 
          message: 'Database error occurred. Please try again later.' 
        });
      }
      return sendResponse(500, 'Database error occurred. Please try again later.');
    }

    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      if (typeof res.unAuthorized === 'function') {
        return res.unAuthorized({ 
          message: 'Invalid or expired token. Please login again.' 
        });
      }
      return sendResponse(401, 'Invalid or expired token. Please login again.');
    }

    // Generic error response
    if (typeof res.internalServerError === 'function') {
      return res.internalServerError({ 
        message: 'An error occurred. Please try again later.' 
      });
    }
    return sendResponse(500, 'An error occurred. Please try again later.');
  } else {
    // In development, show more details
    if (typeof res.internalServerError === 'function') {
      return res.internalServerError({ 
        message: err.message,
        error: err 
      });
    }
    return sendResponse(500, err.message, { error: err });
  }
};

/**
 * SECURITY: Validate Content-Type header
 */
const validateContentType = (req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const contentType = req.headers['content-type'];
    
    // For JSON endpoints, require JSON content type
    if (req.path.includes('/api/') && !contentType?.includes('application/json')) {
      if (typeof res.failure === 'function') {
        return res.failure({ 
          message: 'Content-Type must be application/json' 
        });
      }
      // Fallback to standard Express response if responseHandler hasn't run
      if (!res.headersSent) {
        return res.status(200).json({
          status: 'FAILURE',
          message: 'Content-Type must be application/json',
          data: null
        });
      }
    }
  }
  next();
};

module.exports = {
  sanitizeInput,
  preventNoSqlInjection,
  requestId,
  secureErrorHandler,
  validateContentType
};

