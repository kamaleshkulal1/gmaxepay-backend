const morgan = require('morgan');
const logger = require('../config/s3Logger');

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

// Custom Morgan token for request body (for POST/PUT requests)
morgan.token('req-body', (req) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    // Don't log sensitive data
    const body = { ...req.body };
    if (body.password) body.password = '[REDACTED]';
    if (body.token) body.token = '[REDACTED]';
    if (body.authorization) body.authorization = '[REDACTED]';
    return JSON.stringify(body);
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

// Custom format for comprehensive logging
const logFormat = ':client-ip - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time-ms ms :req-body :res-body';

// Create Morgan middleware
const morganMiddleware = morgan(logFormat, {
  stream: {
    write: (message) => {
      // Parse the log message to extract structured data
      const logData = parseMorganLog(message);
      
      // Log to S3 with structured data
      logger.info('API Request', {
        type: 'api_request',
        ...logData,
        timestamp: new Date().toISOString()
      });
    }
  }
});

// Function to parse Morgan log message
function parseMorganLog(message) {
  const parts = message.trim().split(' ');
  
  return {
    ip: parts[0],
    method: parts[5]?.replace('"', ''),
    url: parts[6],
    httpVersion: parts[7]?.replace('HTTP/', '').replace('"', ''),
    statusCode: parseInt(parts[8]),
    contentLength: parts[9],
    referrer: parts[10]?.replace('"', ''),
    userAgent: parts.slice(11, -3).join(' ').replace('"', ''),
    responseTime: parts[parts.length - 2],
    requestBody: parts[parts.length - 1] || '',
    responseBody: '' // Will be populated by response interceptor
  };
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
    if (ip && ip !== '::1' && ip !== '127.0.0.1' && ip !== '::ffff:127.0.0.1') {
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
    
    // Log response
    logger.info('API Response', {
      type: 'api_response',
      ip: getClientIP(req),
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: res.get('X-Response-Time') || '0',
      responseBody: typeof data === 'string' ? data : JSON.stringify(data),
      timestamp: new Date().toISOString()
    });
    
    return originalSend.call(this, data);
  };
  
  next();
};

// Error logging middleware
const errorLogger = (err, req, res, next) => {
  logger.error('API Error', {
    type: 'api_error',
    ip: getClientIP(req),
    method: req.method,
    url: req.url,
    error: {
      message: err.message,
      stack: err.stack,
      status: err.status || 500
    },
    timestamp: new Date().toISOString()
  });
  
  next(err);
};

// Console log interceptor
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = function(...args) {
  logger.info('Console Log', {
    type: 'console_log',
    level: 'info',
    message: args.join(' '),
    timestamp: new Date().toISOString()
  });
  originalConsoleLog.apply(console, args);
};

console.error = function(...args) {
  logger.error('Console Error', {
    type: 'console_error',
    level: 'error',
    message: args.join(' '),
    timestamp: new Date().toISOString()
  });
  originalConsoleError.apply(console, args);
};

console.warn = function(...args) {
  logger.warn('Console Warning', {
    type: 'console_warn',
    level: 'warn',
    message: args.join(' '),
    timestamp: new Date().toISOString()
  });
  originalConsoleWarn.apply(console, args);
};

module.exports = {
  morganMiddleware,
  responseInterceptor,
  errorLogger
};
