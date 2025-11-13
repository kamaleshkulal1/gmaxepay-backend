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
  // Increased connection timeout and retry options for better reliability
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,   // 10 seconds
  socketTimeout: 10000       // 10 seconds
});

// Optional: Verify connection on startup (non-blocking)
// This will log a warning if configuration is invalid but won't block server startup
if (missingVars.length === 0) {
  // Use setTimeout to defer verification and not block module loading
  setTimeout(() => {
    module.exports.transport.verify(function (error, success) {
      if (error) {
        // Log as warning instead of error - server can still run without email
        console.warn('SMTP verification warning:', error.message);
        console.warn('Email functionality may not work. Please check your EMAIL_HOST, EMAIL_PORT, EMAIL_USERNAME, and EMAIL_PASSWORD in .env file');
        console.warn('Server will continue to run, but email sending may fail.');
      } else {
        console.log('SMTP server is ready to send emails');
      }
    });
  }, 1000); // Wait 1 second after module load to verify
} else {
  console.warn('SMTP configuration incomplete. Email functionality will not work.');
}
