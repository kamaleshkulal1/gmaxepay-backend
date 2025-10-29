const nodemailer = require('nodemailer');

// Validate required environment variables
const requiredEnvVars = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USERNAME', 'EMAIL_PASSWORD'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Missing required email configuration environment variables:', missingVars.join(', '));
  console.error('Please set the following in your .env file:');
  missingVars.forEach(varName => {
    console.error(`  - ${varName}`);
  });
}

// Parse port as integer
const emailPort = process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : null;

// Determine if connection should be secure (true for port 465, false for 587, 25)
const isSecure = emailPort === 465;

module.exports.transport = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'localhost',
  port: emailPort || 587,
  secure: isSecure,
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD
  },
  // Add connection timeout and retry options
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 5000
});

// Optional: Verify connection on startup (comment out if not needed)
// This will throw an error if configuration is invalid
if (missingVars.length === 0) {
  module.exports.transport.verify(function (error, success) {
    if (error) {
      console.error('SMTP configuration error:', error.message);
      console.error('Please check your EMAIL_HOST, EMAIL_PORT, EMAIL_USERNAME, and EMAIL_PASSWORD in .env file');
    } else {
      console.log('SMTP server is ready to send emails');
    }
  });
}
