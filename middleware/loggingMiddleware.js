const morgan = require('morgan');
const logger = require('../config/fileLogger');

// Enhanced IP detection function with IPv4/IPv6 support
function getClientIP(req) {
  // Priority order: forwarded headers first, then direct connection
  const ipSources = [
    // Cloudflare and CDN headers (highest priority)
    req.headers['cf-connecting-ip'],
    req.headers['x-real-ip'],
    req.headers['x-client-ip'],
    
    // Load balancer/proxy headers
    req.headers['x-forwarded-for']?.split(',')[0]?.trim(),
    req.headers['x-cluster-client-ip'],
    req.headers['x-forwarded'],
    req.headers['forwarded-for'],
    req.headers['forwarded'],
    
    // Express.js req.ip (should work with trust proxy)
    req.ip,
    
    // Direct connection (fallback)
    req.connection?.remoteAddress,
    req.socket?.remoteAddress,
    req.connection?.socket?.remoteAddress
  ];
  
  // Filter and validate IPs
  const validIPs = ipSources.filter(ip => {
    if (!ip || ip === '') return false;
    
    // Skip localhost addresses
    if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') return false;
    
    // Skip private network ranges in development
    if (process.env.NODE_ENV === 'development') {
      // IPv4 private ranges
      if (ip.match(/^192\.168\./) || ip.match(/^10\./) || ip.match(/^172\.(1[6-9]|2[0-9]|3[01])\./)) {
        return false;
      }
      // IPv6 private ranges
      if (ip.match(/^fe80:/) || ip.match(/^fc00:/) || ip.match(/^fd00:/)) {
        return false;
      }
    }
    
    // Basic IP validation (IPv4 or IPv6)
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    const ipv6CompressedRegex = /^([0-9a-fA-F]{1,4}:)*::([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip) || ipv6CompressedRegex.test(ip);
  });
  
  // Return first valid IP or fallback to req.ip
  return validIPs[0] || req.ip || 'unknown';
}

// Custom Morgan token for IP address with comprehensive detection
morgan.token('client-ip', (req) => {
  return getClientIP(req);
});

// Function to redact sensitive data from any object
function redactSensitiveData(data) {
  if (typeof data === 'string') {
    // Redact JWT tokens (base64 encoded strings with dots) - improved regex
    return data.replace(/"token"\s*:\s*"[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+"/g, '"token":"[REDACTED]"')
               .replace(/"authorization"\s*:\s*"[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+"/g, '"authorization":"[REDACTED]"')
               .replace(/"accessToken"\s*:\s*"[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+"/g, '"accessToken":"[REDACTED]"')
               .replace(/"refreshToken"\s*:\s*"[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+"/g, '"refreshToken":"[REDACTED]"');
  }
  
  if (typeof data === 'object' && data !== null) {
    const redacted = { ...data };
    
    // Redact common sensitive fields
    if (redacted.password) redacted.password = '[REDACTED]';
    if (redacted.token) redacted.token = '[REDACTED]';
    if (redacted.authorization) redacted.authorization = '[REDACTED]';
    if (redacted.accessToken) redacted.accessToken = '[REDACTED]';
    if (redacted.refreshToken) redacted.refreshToken = '[REDACTED]';
    if (redacted.mobileOtp) redacted.mobileOtp = '[REDACTED]';
    if (redacted.otp) redacted.otp = '[REDACTED]';
    if (redacted.secret) redacted.secret = '[REDACTED]';
    if (redacted.key) redacted.key = '[REDACTED]';
    
    // Recursively redact nested objects
    Object.keys(redacted).forEach(key => {
      if (typeof redacted[key] === 'object' && redacted[key] !== null) {
        redacted[key] = redactSensitiveData(redacted[key]);
      }
    });
    
    return redacted;
  }
  
  return data;
}

// Custom Morgan token for request body (for POST/PUT requests)
morgan.token('req-body', (req) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const redactedBody = redactSensitiveData(req.body);
    return JSON.stringify(redactedBody);
  }
  return '';
});

// Custom Morgan token for response body
morgan.token('res-body', (req, res) => {
  const originalSend = res.send;
  let responseBody = '';
  
  res.send = function(data) {
    responseBody = data;
    return originalSend.call(this, data);
  };
  
  return () => responseBody;
});

// Custom Morgan token for response time
morgan.token('response-time-ms', (req, res) => {
  return res.get('X-Response-Time') || '0';
});

// Create Morgan middleware for basic HTTP logging
const morganMiddleware = morgan('combined', {
  stream: {
    write: (message) => {
      // Just log the basic Morgan message to console/file
      console.log('Morgan:', message.trim());
    }
  }
});

// Helper function to extract clean API path
function extractAPIPath(url) {
  if (!url) return 'N/A';
  // Remove query parameters and hash
  const cleanPath = url.split('?')[0].split('#')[0];
  // Ensure it starts with / if it's a path
  return cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath;
}

// Custom request logging middleware
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Get full URL path (use originalUrl if available, otherwise url)
  const fullUrl = req.originalUrl || req.url || '/';
  const apiPath = extractAPIPath(fullUrl);
  const clientIP = getClientIP(req);
  
  // Log the request with enhanced details including prominent IP
  logger.logAPIRequest({
    ip: clientIP,
    method: req.method,
    url: fullUrl,
    apiPath: apiPath,
    statusCode: 'N/A', // Will be updated in response
    responseTime: 'N/A', // Will be updated in response
    userAgent: req.get('User-Agent') || '',
    referrer: req.get('Referer') || '',
    requestBody: JSON.stringify(redactSensitiveData(req.body || {})),
    queryParams: JSON.stringify(redactSensitiveData(req.query || {})),
    headers: JSON.stringify(redactSensitiveData({
      'content-type': req.get('Content-Type'),
      'authorization': req.get('Authorization') ? '[REDACTED]' : undefined,
      'x-forwarded-for': req.get('X-Forwarded-For'),
      'x-real-ip': req.get('X-Real-IP'),
      'cf-connecting-ip': req.get('CF-Connecting-IP'),
      'x-client-ip': req.get('X-Client-IP')
    }))
  });
  
  // Store start time for response calculation
  req.startTime = startTime;
  
  next();
};

// Function to parse Morgan log message
function parseMorganLog(message) {
  try {
    // Extract IP address (first part before the dash)
    const ipMatch = message.match(/^([^\s-]+)/);
    const ip = ipMatch ? ipMatch[1] : 'unknown';
    
    // Extract method and URL
    const methodMatch = message.match(/"([A-Z]+)\s+([^"]+)"/);
    const method = methodMatch ? methodMatch[1] : 'N/A';
    const url = methodMatch ? methodMatch[2] : 'N/A';
    
    // Extract status code
    const statusMatch = message.match(/\s(\d{3})\s/);
    const statusCode = statusMatch ? parseInt(statusMatch[1]) : 'N/A';
    
    // Extract referrer
    const referrerMatch = message.match(/"([^"]*)"\s+"([^"]*)"\s+(\d+)\s+ms/);
    const referrer = referrerMatch ? referrerMatch[1] : '';
    const userAgent = referrerMatch ? referrerMatch[2] : '';
    const responseTime = referrerMatch ? referrerMatch[3] : '0';
    
    // Extract request body (last part after ms)
    const bodyMatch = message.match(/\d+\s+ms\s+(.*)$/);
    const requestBody = bodyMatch ? bodyMatch[1] : '';
    
    return {
      ip,
      method,
      url,
      statusCode,
      responseTime,
      referrer,
      userAgent,
      requestBody,
      responseBody: ''
    };
  } catch (error) {
    console.warn('Error parsing Morgan log:', error.message);
    return {
      ip: 'unknown',
      method: 'N/A',
      url: 'N/A',
      statusCode: 'N/A',
      responseTime: '0',
      referrer: '',
      userAgent: '',
      requestBody: '',
      responseBody: ''
    };
  }
}

// Response interceptor middleware
const responseInterceptor = (req, res, next) => {
  const originalSend = res.send;
  let responseBody = '';
  
  res.send = function(data) {
    // Limit response body size to prevent memory issues (max 50KB)
    const MAX_RESPONSE_BODY_SIZE = 50 * 1024; // 50KB
    let dataToLog = data;
    
    if (typeof data === 'string' && data.length > MAX_RESPONSE_BODY_SIZE) {
      dataToLog = data.substring(0, MAX_RESPONSE_BODY_SIZE) + '...[TRUNCATED]';
    } else if (typeof data !== 'string') {
      const stringified = JSON.stringify(data);
      if (stringified.length > MAX_RESPONSE_BODY_SIZE) {
        dataToLog = stringified.substring(0, MAX_RESPONSE_BODY_SIZE) + '...[TRUNCATED]';
      } else {
        dataToLog = stringified;
      }
    }
    
    responseBody = dataToLog;
    
    // Calculate response time
    const responseTime = req.startTime ? Date.now() - req.startTime : 0;
    
    // Log response with enhanced IP tracking
    let redactedResponseBody;
    if (typeof dataToLog === 'string') {
      try {
        // Try to parse as JSON and redact, then stringify again
        const parsedData = JSON.parse(dataToLog);
        redactedResponseBody = JSON.stringify(redactSensitiveData(parsedData));
      } catch (e) {
        // If not JSON, just redact the string
        redactedResponseBody = redactSensitiveData(dataToLog);
      }
    } else {
      redactedResponseBody = JSON.stringify(redactSensitiveData(dataToLog));
    }
    
    // Get full URL path (use originalUrl if available, otherwise url)
    const fullUrl = req.originalUrl || req.url || '/';
    const apiPath = extractAPIPath(fullUrl);
    const clientIP = getClientIP(req);
    
    logger.logAPIResponse({
      ip: clientIP,
      method: req.method,
      url: fullUrl,
      apiPath: apiPath,
      statusCode: res.statusCode,
      responseTime: responseTime.toString(),
      responseBody: redactedResponseBody,
      userAgent: req.get('User-Agent') || '',
      referrer: req.get('Referer') || '',
      requestBody: JSON.stringify(redactSensitiveData(req.body || {})),
      queryParams: JSON.stringify(redactSensitiveData(req.query || {})),
      responseHeaders: JSON.stringify(redactSensitiveData({
        'content-type': res.get('Content-Type'),
        'content-length': res.get('Content-Length'),
        'cache-control': res.get('Cache-Control')
      }))
    });
    
    return originalSend.call(this, data);
  };
  
  next();
};

// Error logging middleware
const errorLogger = (err, req, res, next) => {
  const fullUrl = req.originalUrl || req.url || '/';
  const apiPath = extractAPIPath(fullUrl);
  const clientIP = getClientIP(req);
  
  logger.logAPIError({
    ip: clientIP,
    method: req.method,
    url: fullUrl,
    apiPath: apiPath,
    userAgent: req.get('User-Agent'),
    referrer: req.get('Referer'),
    requestBody: JSON.stringify(redactSensitiveData(req.body || {})),
    error: {
      message: err.message,
      stack: err.stack,
      status: err.status || 500
    }
  });
  
  next(err);
};

// Console log interceptor
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = function(...args) {
  const message = args.join(' ');
  
  // Check if this is a Morgan log and extract IP
  let ip = 'unknown';
  if (message.includes('Morgan:')) {
    // Extract IP from Morgan log format: "Morgan: IP - - [date] ..."
    const ipMatch = message.match(/Morgan:\s+([^\s-]+)/);
    if (ipMatch) {
      ip = ipMatch[1];
    }
  }
  
  logger.logConsole('info', message, { ip });
  originalConsoleLog.apply(console, args);
};

console.error = function(...args) {
  logger.logConsole('error', args.join(' '));
  originalConsoleError.apply(console, args);
};

console.warn = function(...args) {
  logger.logConsole('warn', args.join(' '));
  originalConsoleWarn.apply(console, args);
};

module.exports = {
  morganMiddleware,
  requestLogger,
  responseInterceptor,
  errorLogger
};
