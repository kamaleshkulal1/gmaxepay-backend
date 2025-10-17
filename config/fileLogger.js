const winston = require('winston');
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

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

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Configure AWS SDK v3 for S3 logging
let s3Client = null;
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && 
    process.env.AWS_ACCESS_KEY_ID !== 'your_aws_access_key_here') {
  try {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    });
  } catch (error) {
    console.warn('Failed to initialize S3 client:', error.message);
    s3Client = null;
  }
}

// Custom S3 transport for Winston
class S3Transport extends winston.Transport {
  constructor(options) {
    super(options);
    this.bucket = options.bucket || 'gmaxepay';
    this.s3Client = options.s3Client || s3Client;
    this.logBuffer = []; // Buffer to store logs
    this.bufferSize = 1; // Upload every log for live debugging
    this.uploadTimer = null;
  }

  log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // If S3 client is not available, skip S3 upload
    if (!this.s3Client) {
      console.warn('S3 logging disabled: AWS credentials not configured');
      callback(null, true);
      return;
    }

    // Format log entry in terminal style for S3
    let logLine;
    
    // Check if this is an API log (data is directly in info, not info.meta)
    if (info.type && (info.type === 'api_request' || info.type === 'api_response' || info.type === 'console_log')) {
      const logData = {
        apiPath: info.apiPath || 'N/A',
        headers: redactSensitiveData(info.headers || '{}'),
        ip: info.ip || 'unknown',
        method: info.method || 'N/A',
        queryParams: redactSensitiveData(info.queryParams || '{}'),
        referrer: info.referrer || '',
        requestBody: redactSensitiveData(info.requestBody || ''),
        responseBody: redactSensitiveData(info.responseBody || ''),
        responseTime: info.responseTime || 'N/A',
        statusCode: info.statusCode || 'N/A',
        timestamp: info.timestamp,
        type: info.type,
        url: info.url || 'N/A',
        userAgent: info.userAgent || ''
      };
      logLine = `${info.level}: ${redactSensitiveData(info.message)} ${JSON.stringify(logData)}`;
    } else {
      logLine = `${info.level}: ${redactSensitiveData(info.message)}`;
    }

    // Add to buffer
    this.logBuffer.push(logLine);

    // Upload immediately for live debugging
    if (this.logBuffer.length >= this.bufferSize) {
      this.uploadLogs();
    } else if (!this.uploadTimer) {
      // Set timer to upload after 5 seconds for live debugging
      this.uploadTimer = setTimeout(() => {
        this.uploadLogs();
      }, 5000);
    }

    callback(null, true);
  }

  async uploadLogs() {
    if (this.logBuffer.length === 0) return;

    try {
      // Get existing logs from S3
      let existingLogs = '';
      try {
        const getParams = {
          Bucket: this.bucket,
          Key: 'server.logs'
        };
        const response = await this.s3Client.send(new GetObjectCommand(getParams));
        existingLogs = await response.Body.transformToString();
      } catch (error) {
        // File doesn't exist or is empty, start with empty string
        existingLogs = '';
      }

      // Append new logs to existing logs (terminal format)
      const allLogs = existingLogs + (existingLogs ? '\n' : '') + this.logBuffer.join('\n');

      // Upload combined logs as text
      const params = {
        Bucket: this.bucket,
        Key: 'server.logs',
        Body: allLogs,
        ContentType: 'text/plain',
        ServerSideEncryption: 'AES256'
      };

      await this.s3Client.send(new PutObjectCommand(params));
      
      // Clear buffer and timer
      this.logBuffer = [];
      if (this.uploadTimer) {
        clearTimeout(this.uploadTimer);
        this.uploadTimer = null;
      }
    } catch (err) {
      console.error('S3 upload error:', err.message || err);
    }
  }
}

// Custom format for terminal-style logging
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, meta }) => {
    // Format for terminal-style output
    if (meta && meta.type) {
      const logData = {
        apiPath: meta.apiPath || 'N/A',
        headers: meta.headers || '{}',
        ip: meta.ip || 'unknown',
        method: meta.method || 'N/A',
        queryParams: meta.queryParams || '{}',
        referrer: meta.referrer || '',
        requestBody: meta.requestBody || '',
        responseBody: meta.responseBody || '',
        responseTime: meta.responseTime || 'N/A',
        statusCode: meta.statusCode || 'N/A',
        timestamp: timestamp,
        type: meta.type,
        url: meta.url || 'N/A',
        userAgent: meta.userAgent || ''
      };
      return `${level}: ${message} ${JSON.stringify(logData)}`;
    }
    return `${level}: ${message}`;
  })
);

// Create transports array
const transports = [
  // Console transport for development
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }),
  // Custom file transport for terminal-style format
  new (class extends winston.Transport {
    constructor(options) {
      super(options);
      this.filename = options.filename;
      this.logBuffer = [];
      this.bufferSize = 1; // Write every log immediately for live debugging
      this.writeTimer = null;
    }

    log(info, callback) {
      setImmediate(() => {
        this.emit('logged', info);
      });

      // Format log entry in terminal style
      let logLine;
      if (info.meta && info.meta.type) {
        const logData = {
          apiPath: info.meta.apiPath || 'N/A',
          headers: redactSensitiveData(info.meta.headers || '{}'),
          ip: info.meta.ip || 'unknown',
          method: info.meta.method || 'N/A',
          queryParams: redactSensitiveData(info.meta.queryParams || '{}'),
          referrer: info.meta.referrer || '',
          requestBody: redactSensitiveData(info.meta.requestBody || ''),
          responseBody: redactSensitiveData(info.meta.responseBody || ''),
          responseTime: info.meta.responseTime || 'N/A',
          statusCode: info.meta.statusCode || 'N/A',
          timestamp: info.timestamp,
          type: info.meta.type,
          url: info.meta.url || 'N/A',
          userAgent: info.meta.userAgent || ''
        };
        logLine = `${info.level}: ${redactSensitiveData(info.message)} ${JSON.stringify(logData)}`;
      } else {
        logLine = `${info.level}: ${redactSensitiveData(info.message)}`;
      }

      // Add to buffer
      this.logBuffer.push(logLine);

      // Write immediately for live debugging
      if (this.logBuffer.length >= this.bufferSize) {
        this.writeLogs();
      }

      callback(null, true);
    }

    async writeLogs() {
      if (this.logBuffer.length === 0) return;

      try {
        // Append logs to file (one line per log)
        const logContent = this.logBuffer.join('\n') + '\n';
        fs.appendFileSync(this.filename, logContent);
        
        // Clear buffer
        this.logBuffer = [];
        if (this.writeTimer) {
          clearTimeout(this.writeTimer);
          this.writeTimer = null;
        }
      } catch (err) {
        console.error('File write error:', err.message || err);
      }
    }
  })({
    filename: path.join(logsDir, 'server.log')
  }),
  // Separate file for errors
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    tailable: true
  })
];

// Add S3 transport if credentials are available
if (s3Client) {
  transports.push(new S3Transport({
    bucket: 'gmaxepay'
  }));
  console.log('S3 logging enabled: Logs will be uploaded to gmaxepay bucket as server.logs');
} else {
  console.warn('S3 logging disabled: AWS credentials not configured or invalid. Only file logging will be available.');
  console.warn('To enable S3 logging, set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION environment variables.');
}

// Create logger instance
const logger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: transports
});

// Add methods for different log types with enhanced IP tracking
logger.logAPIRequest = (data) => {
  logger.info('API Request', {
    type: 'api_request',
    ip: data.ip || 'unknown',
    method: data.method || 'N/A',
    url: data.url || 'N/A',
    apiPath: data.apiPath || 'N/A',
    statusCode: data.statusCode || 'N/A',
    responseTime: data.responseTime || 'N/A',
    userAgent: data.userAgent || '',
    referrer: data.referrer || '',
    requestBody: redactSensitiveData(data.requestBody || ''),
    queryParams: redactSensitiveData(data.queryParams || ''),
    headers: redactSensitiveData(data.headers || ''),
    responseBody: '',
    timestamp: new Date().toISOString()
  });
};

logger.logAPIResponse = (data) => {
  logger.info('API Response', {
    type: 'api_response',
    ip: data.ip || 'unknown',
    method: data.method || 'N/A',
    url: data.url || 'N/A',
    apiPath: data.apiPath || 'N/A',
    statusCode: data.statusCode || 'N/A',
    responseTime: data.responseTime || 'N/A',
    responseBody: redactSensitiveData(data.responseBody || ''),
    userAgent: data.userAgent || '',
    referrer: data.referrer || '',
    requestBody: redactSensitiveData(data.requestBody || ''),
    queryParams: redactSensitiveData(data.queryParams || ''),
    responseHeaders: redactSensitiveData(data.responseHeaders || ''),
    timestamp: new Date().toISOString()
  });
};

logger.logAPIError = (data) => {
  logger.error('API Error', {
    type: 'api_error',
    ip: data.ip || 'unknown',
    method: data.method || 'N/A',
    url: data.url || 'N/A',
    statusCode: data.error?.status || 500,
    responseTime: 'N/A',
    userAgent: data.userAgent || '',
    referrer: data.referrer || '',
    requestBody: '',
    responseBody: redactSensitiveData(JSON.stringify({
      error: {
        message: data.error?.message,
        stack: data.error?.stack,
        status: data.error?.status || 500
      }
    })),
    timestamp: new Date().toISOString()
  });
};

logger.logConsole = (level, message) => {
  logger.log(level, 'Console Log', {
    type: 'console_log',
    level: level,
    message: redactSensitiveData(message),
    timestamp: new Date().toISOString()
  });
};

// Method to log with IP tracking for any custom log
logger.logWithIP = (level, message, data = {}) => {
  logger.log(level, redactSensitiveData(message), {
    ...redactSensitiveData(data),
    ip: data.ip || 'unknown',
    timestamp: new Date().toISOString()
  });
};

module.exports = logger;
