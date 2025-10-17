const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const winston = require('winston');
const path = require('path');

// Configure AWS SDK v3 - only if credentials are available
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
    this.folder = options.folder || 'development';
    this.s3Client = options.s3Client || s3Client;
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

    // Create log entry
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: info.level,
      message: info.message,
      ...info.meta
    };

    // Generate filename with date and time
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
    const filename = `${dateStr}/${timeStr}-${info.level}.json`;

    // Upload to S3
    const params = {
      Bucket: this.bucket,
      Key: `${this.folder}/logs/${filename}`,
      Body: JSON.stringify(logEntry, null, 2),
      ContentType: 'application/json',
      ServerSideEncryption: 'AES256'
    };

    this.s3Client.send(new PutObjectCommand(params))
      .then(() => {
        callback(null, true);
      })
      .catch((err) => {
        console.error('S3 upload error:', err.message || err);
        // Don't fail the entire logging process if S3 fails
        callback(null, true);
      });
  }
}

// Create logger instance
const transports = [
  // Console transport for development
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  })
];

// Only add S3 transport if credentials are available
if (s3Client) {
  transports.push(new S3Transport({
    bucket: 'gmaxepay',
    folder: 'development'
  }));
} else {
  console.warn('S3 logging disabled: AWS credentials not configured or invalid. Only console logging will be available.');
  console.warn('To enable S3 logging, set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION environment variables.');
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: transports
});

module.exports = logger;
