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
    this.bucket = options.bucket || process.env.AWS_BUCKET || 'gmaxepaybucket';
    this.s3Client = options.s3Client || s3Client;
    this.logBuffer = []; // Buffer to store logs
    this.bufferSize = 100; // Batch logs to reduce S3 requests
    this.uploadInterval = 60000; // Upload every 60 seconds (was 5 seconds)
    this.uploadTimer = null;
    this.isUploading = false; // Prevent concurrent uploads
    this.retryAttempts = 0;
    this.maxRetries = 3;
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

    // Format log entry in terminal style for S3 with prominent IP and API info
    let logLine;
    
    // Check if this is an API log - handle both info.type (direct) and info.meta.type (winston format)
    const logType = info.type || (info.meta && info.meta.type);
    const metaData = info.meta || info; // Use meta if available, otherwise use info directly
    
    if (logType && (logType === 'api_request' || logType === 'api_response' || logType === 'api_error' || logType === 'console_log')) {
      const ip = metaData.ip || 'unknown';
      const method = metaData.method || 'N/A';
      const apiPath = metaData.apiPath || metaData.url || 'N/A';
      const statusCode = metaData.statusCode || 'N/A';
      const responseTime = metaData.responseTime || 'N/A';
      
      // Create a human-readable prefix with IP and API info prominently displayed
      const apiInfo = `[IP:${ip}] ${method} ${apiPath}`;
      const statusInfo = statusCode !== 'N/A' ? ` | Status: ${statusCode}` : '';
      const timeInfo = responseTime !== 'N/A' ? ` | Time: ${responseTime}ms` : '';
      
      const logData = {
        apiPath: apiPath,
        headers: redactSensitiveData(metaData.headers || '{}'),
        ip: ip,
        method: method,
        queryParams: redactSensitiveData(metaData.queryParams || '{}'),
        referrer: metaData.referrer || '',
        requestBody: redactSensitiveData(metaData.requestBody || ''),
        responseBody: redactSensitiveData(metaData.responseBody || ''),
        responseTime: responseTime,
        statusCode: statusCode,
        timestamp: metaData.timestamp || info.timestamp || new Date().toISOString(),
        type: logType,
        url: metaData.url || 'N/A',
        userAgent: metaData.userAgent || ''
      };
      
      // Format: [IP] METHOD API_PATH | Status: XXX | Time: XXXms | Full JSON data
      logLine = `${info.level}: ${apiInfo}${statusInfo}${timeInfo} | ${JSON.stringify(logData)}`;
    } else {
      logLine = `${info.level}: ${redactSensitiveData(info.message)}`;
    }

    // Add to buffer
    this.logBuffer.push(logLine);

    // Upload when buffer reaches size limit (batched for rate limiting)
    if (this.logBuffer.length >= this.bufferSize && !this.isUploading) {
      this.uploadLogs();
    } else if (!this.uploadTimer && !this.isUploading) {
      // Set timer to upload periodically (reduced frequency to avoid rate limits)
      this.uploadTimer = setTimeout(() => {
        this.uploadLogs();
      }, this.uploadInterval);
    }

    callback(null, true);
  }

  async uploadLogs() {
    // Prevent concurrent uploads
    if (this.isUploading) return;
    
    // Check if there are logs to upload
    if (this.logBuffer.length === 0) return;
    
    this.isUploading = true;
    const logsToUpload = [...this.logBuffer]; // Copy buffer
    this.logBuffer = []; // Clear buffer immediately to allow new logs
    
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
      const allLogs = existingLogs + (existingLogs ? '\n' : '') + logsToUpload.join('\n');

      // Upload combined logs as text
      const params = {
        Bucket: this.bucket,
        Key: 'server.logs',
        Body: allLogs,
        ContentType: 'text/plain',
        ServerSideEncryption: 'AES256'
      };

      await this.s3Client.send(new PutObjectCommand(params));
      
      // Reset retry attempts on success
      this.retryAttempts = 0;
      
      // Clear timer
      if (this.uploadTimer) {
        clearTimeout(this.uploadTimer);
        this.uploadTimer = null;
      }
    } catch (err) {
      // Put logs back in buffer if upload failed (unless it's a rate limit and we've retried)
      const isRateLimitError = err.message && err.message.includes('reduce your request rate');
      
      if (isRateLimitError && this.retryAttempts < this.maxRetries) {
        // Exponential backoff for rate limit errors
        this.retryAttempts++;
        const backoffDelay = Math.min(30000 * Math.pow(2, this.retryAttempts), 300000); // Max 5 minutes
        
        // Put logs back in buffer
        this.logBuffer.unshift(...logsToUpload);
        
        console.error(`S3 upload error (rate limit): ${err.message}. Retrying in ${backoffDelay/1000}s (attempt ${this.retryAttempts}/${this.maxRetries})`);
        
        // Retry with exponential backoff
        setTimeout(() => {
          this.isUploading = false;
          this.uploadLogs();
        }, backoffDelay);
        return;
      } else {
        // For non-rate-limit errors or max retries reached, log and continue
        console.error('S3 upload error:', err.message || err);
        // Don't put logs back to avoid infinite retry loop for non-rate-limit errors
        
        // Reset retry attempts after max retries or non-rate-limit errors
        // so next upload cycle can retry if needed
        if (!isRateLimitError || this.retryAttempts >= this.maxRetries) {
          this.retryAttempts = 0;
        }
      }
    } finally {
      this.isUploading = false;
    }
  }
}

// Custom format for terminal-style logging with prominent IP and API path
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, meta }) => {
    // Format for terminal-style output with prominent IP and API information
    if (meta && meta.type) {
      const ip = meta.ip || 'unknown';
      const method = meta.method || 'N/A';
      const apiPath = meta.apiPath || meta.url || 'N/A';
      const statusCode = meta.statusCode || 'N/A';
      const responseTime = meta.responseTime || 'N/A';
      
      // Create a human-readable prefix with IP and API info prominently displayed
      const apiInfo = `[IP:${ip}] ${method} ${apiPath}`;
      const statusInfo = statusCode !== 'N/A' ? ` | Status: ${statusCode}` : '';
      const timeInfo = responseTime !== 'N/A' ? ` | Time: ${responseTime}ms` : '';
      
      const logData = {
        apiPath: apiPath,
        headers: meta.headers || '{}',
        ip: ip,
        method: method,
        queryParams: meta.queryParams || '{}',
        referrer: meta.referrer || '',
        requestBody: meta.requestBody || '',
        responseBody: meta.responseBody || '',
        responseTime: responseTime,
        statusCode: statusCode,
        timestamp: timestamp,
        type: meta.type,
        url: meta.url || 'N/A',
        userAgent: meta.userAgent || ''
      };
      
      // Format: [IP] METHOD API_PATH | Status: XXX | Time: XXXms | Full JSON data
      return `${level}: ${apiInfo}${statusInfo}${timeInfo} | ${JSON.stringify(logData)}`;
    }
    return `${level}: ${message}`;
  })
);

// Create transports array
// NOTE: File-based transports (writing to logs/server.log and logs/error.log)
// have been commented out to temporarily DISABLE appending to log files.
// To re-enable file logging later, uncomment the relevant transports below.
const transports = [
  // Console transport for development with prominent IP and API info
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.printf(({ level, message, timestamp, meta }) => {
        // Format for console with prominent IP and API information
        if (meta && meta.type) {
          const ip = meta.ip || 'unknown';
          const method = meta.method || 'N/A';
          const apiPath = meta.apiPath || meta.url || 'N/A';
          const statusCode = meta.statusCode || 'N/A';
          const responseTime = meta.responseTime || 'N/A';
          
          // Create a human-readable prefix with IP and API info prominently displayed
          const apiInfo = `[IP:${ip}] ${method} ${apiPath}`;
          const statusInfo = statusCode !== 'N/A' ? ` | Status: ${statusCode}` : '';
          const timeInfo = responseTime !== 'N/A' ? ` | Time: ${responseTime}ms` : '';
          
          return `${timestamp} ${level}: ${apiInfo}${statusInfo}${timeInfo} - ${message}`;
        }
        return `${timestamp} ${level}: ${message}`;
      })
    )
  }),
  /*
  // Custom file transport for terminal-style format (DISABLED)
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
  
      // Format log entry in terminal style with prominent IP and API info
      let logLine;
      if (info.meta && info.meta.type) {
        const ip = info.meta.ip || 'unknown';
        const method = info.meta.method || 'N/A';
        const apiPath = info.meta.apiPath || info.meta.url || 'N/A';
        const statusCode = info.meta.statusCode || 'N/A';
        const responseTime = info.meta.responseTime || 'N/A';
        
        // Create a human-readable prefix with IP and API info prominently displayed
        const apiInfo = `[IP:${ip}] ${method} ${apiPath}`;
        const statusInfo = statusCode !== 'N/A' ? ` | Status: ${statusCode}` : '';
        const timeInfo = responseTime !== 'N/A' ? ` | Time: ${responseTime}ms` : '';
        
        const logData = {
          apiPath: apiPath,
          headers: redactSensitiveData(info.meta.headers || '{}'),
          ip: ip,
          method: method,
          queryParams: redactSensitiveData(info.meta.queryParams || '{}'),
          referrer: info.meta.referrer || '',
          requestBody: redactSensitiveData(info.meta.requestBody || ''),
          responseBody: redactSensitiveData(info.meta.responseBody || ''),
          responseTime: responseTime,
          statusCode: statusCode,
          timestamp: info.timestamp,
          type: info.meta.type,
          url: info.meta.url || 'N/A',
          userAgent: info.meta.userAgent || ''
        };
        
        // Format: [IP] METHOD API_PATH | Status: XXX | Time: XXXms | Full JSON data
        logLine = `${info.level}: ${apiInfo}${statusInfo}${timeInfo} | ${JSON.stringify(logData)}`;
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
  // Separate file for errors (DISABLED)
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    tailable: true
  })
  */
];

// Add S3 transport if credentials are available
if (s3Client) {
  const bucketName = process.env.AWS_BUCKET || 'gmaxepaybucket';
  transports.push(new S3Transport({
    bucket: bucketName
  }));
  console.log(`S3 logging enabled: Logs will be uploaded to ${bucketName} bucket as server.logs`);
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
    apiPath: data.apiPath || data.url || 'N/A',
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

logger.logConsole = (level, message, data = {}) => {
  logger.log(level, 'Console Log', {
    type: 'console_log',
    level: level,
    message: redactSensitiveData(message),
    ip: data.ip || 'unknown',
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
