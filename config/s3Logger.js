const AWS = require('aws-sdk');
const winston = require('winston');
const path = require('path');

// Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

const s3 = new AWS.S3();

// Custom S3 transport for Winston
class S3Transport extends winston.Transport {
  constructor(options) {
    super(options);
    this.bucket = options.bucket || 'gmaxepay';
    this.folder = options.folder || 'development';
    this.s3 = options.s3 || s3;
  }

  log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

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

    this.s3.upload(params, (err, data) => {
      if (err) {
        console.error('S3 upload error:', err);
        callback(err);
      } else {
        callback(null, true);
      }
    });
  }
}

// Create logger instance
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // S3 transport
    new S3Transport({
      bucket: 'gmaxepay',
      folder: 'development'
    })
  ]
});

module.exports = logger;
