const morgan = require('morgan');
const logger = require('../config/fileLogger');

// Custom Morgan token for IP address with comprehensive detection
morgan.token('client-ip', (req) => {
  // Try multiple methods to get the real client IP
  const ipSources = [
    req.ip,                                    // Express.js req.ip
    req.connection?.remoteAddress,            // Direct connection
    req.socket?.remoteAddress,                 // Socket connection
    req.connection?.socket?.remoteAddress,     // Socket within connection
    req.headers['x-forwarded-for']?.split(',')[0]?.trim(),  // Load balancer/proxy
    req.headers['x-real-ip'],                  // Nginx proxy
    req.headers['x-client-ip'],                // Custom header
    req.headers['cf-connecting-ip'],           // Cloudflare
    req.headers['x-cluster-client-ip'],        // Cluster
    req.headers['x-forwarded'],                // Forwarded header
    req.headers['forwarded-for'],              // Forwarded for
    req.headers['forwarded']                   // Forwarded
  ];
  
  // Find the first valid IP address
  for (const ip of ipSources) {
    if (ip && ip !== '::1' && ip !== '127.0.0.1' && ip !== '::ffff:127.0.0.1') {
      return ip;
    }
  }
  
  return 'unknown';
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

// Custom request logging middleware
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log the request with enhanced details
  logger.logAPIRequest({
    ip: getClientIP(req),
    method: req.method,
    url: req.url,
    apiPath: req.url.includes('/api/') ? req.url.split('?')[0] : req.url, // Clean API path
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
      'x-real-ip': req.get('X-Real-IP')
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

// Enhanced IP detection function
function getClientIP(req) {
  const ipSources = [
    req.ip,
    req.connection?.remoteAddress,
    req.socket?.remoteAddress,
    req.connection?.socket?.remoteAddress,
    req.headers['x-forwarded-for']?.split(',')[0]?.trim(),
    req.headers['x-real-ip'],
    req.headers['x-client-ip'],
    req.headers['cf-connecting-ip'],
    req.headers['x-cluster-client-ip'],
    req.headers['x-forwarded'],
    req.headers['forwarded-for'],
    req.headers['forwarded']
  ];
  
  for (const ip of ipSources) {
    if (ip && ip !== '') {
      return ip;
    }
  }
  
  return 'unknown';
}

// Response interceptor middleware
const responseInterceptor = (req, res, next) => {
  const originalSend = res.send;
  let responseBody = '';
  
  res.send = function(data) {
    responseBody = data;
    
    // Calculate response time
    const responseTime = req.startTime ? Date.now() - req.startTime : 0;
    
    // Log response with enhanced IP tracking
    let redactedResponseBody;
    if (typeof data === 'string') {
      try {
        // Try to parse as JSON and redact, then stringify again
        const parsedData = JSON.parse(data);
        redactedResponseBody = JSON.stringify(redactSensitiveData(parsedData));
      } catch (e) {
        // If not JSON, just redact the string
        redactedResponseBody = redactSensitiveData(data);
      }
    } else {
      redactedResponseBody = JSON.stringify(redactSensitiveData(data));
    }
    
    logger.logAPIResponse({
      ip: getClientIP(req),
      method: req.method,
      url: req.url,
      apiPath: req.url.includes('/api/') ? req.url.split('?')[0] : req.url, // Clean API path
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
  logger.logAPIError({
    ip: getClientIP(req),
    method: req.method,
    url: req.url,
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
  logger.logConsole('info', args.join(' '));
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
