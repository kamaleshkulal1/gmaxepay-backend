const nodemailer = require('nodemailer');
const { transport } = require('../config/nodemailer.config');
const fs = require('fs');
const path = require('path');

/**
 * Send welcome email with onboarding link
 * @param {Object} options - Email options
 * @param {String} options.to - Recipient email
 * @param {String} options.userName - User name
 * @param {String} options.onboardingLink - Onboarding link URL
 * @param {String} options.logoUrl - Company logo URL
 * @param {String} options.iconUrl - Mail icons URL
 * @param {String} options.expiryTime - Expiry time string (e.g., "6 days")
 * @returns {Promise<Object>}
 */
const sendWelcomeEmail = async ({
  to,
  userName,
  onboardingLink,
  logoUrl,
  iconUrl,
  expiryTime
}) => {
  try {
    // Read email template
    const templatePath = path.join(__dirname, '../mailTemplate/welcomeEmail.html');
    let htmlTemplate = fs.readFileSync(templatePath, 'utf8');

    // Replace placeholders in template
    htmlTemplate = htmlTemplate.replace(/{{USER_NAME}}/g, userName || 'Valued Customer');
    htmlTemplate = htmlTemplate.replace(/{{ONBOARDING_LINK}}/g, onboardingLink);
    htmlTemplate = htmlTemplate.replace(/{{LOGO_URL}}/g, logoUrl || '');
    htmlTemplate = htmlTemplate.replace(/{{ILLUSTRATION_URL}}/g, iconUrl || '');
    htmlTemplate = htmlTemplate.replace(/{{YEAR}}/g, new Date().getFullYear().toString());
    
    // Email options
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USERNAME,
      to: to,
      subject: 'Welcome to GMAXEPAY - Complete Your Onboarding',
      html: htmlTemplate,
      text: `Dear ${userName},\n\nWelcome to GMAXEPAY! Please complete your onboarding by clicking this link: ${onboardingLink}\n\nThis link will expire in ${expiryTime}.\n\nBest regards,\nGMAXEPAY Team`
    };

    // Send email
    const info = await transport.sendMail(mailOptions);
    
    return {
      success: true,
      messageId: info.messageId,
      response: info.response
    };
  } catch (error) {
    console.error('Error sending welcome email:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to send email';
    
    if (error.code === 'ECONNREFUSED') {
      errorMessage = `Failed to connect to SMTP server. Please check EMAIL_HOST (${process.env.EMAIL_HOST || 'not set'}) and EMAIL_PORT (${process.env.EMAIL_PORT || 'not set'}) in your .env file`;
    } else if (error.code === 'EAUTH') {
      errorMessage = 'SMTP authentication failed. Please check EMAIL_USERNAME and EMAIL_PASSWORD in your .env file';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'SMTP connection timeout. Please check your network connection and EMAIL_HOST setting';
    } else {
      errorMessage = `Failed to send email: ${error.message}`;
    }
    
    throw new Error(errorMessage);
  }
};

module.exports = {
  sendWelcomeEmail
};

/**
 * Send notification email (for account unlock, KYC revert, etc.)
 * @param {Object} options
 * @param {string} options.to
 * @param {string} options.userName
 * @param {string} options.subject
 * @param {string} options.successMessage - Main success message (e.g., "Your account has been unlocked successfully")
 * @param {string} options.message - Additional message text
 * @param {string} options.logoUrl
 * @param {string} options.illustrationUrl
 */
module.exports.sendNotificationEmail = async ({ 
  to, 
  userName, 
  subject, 
  successMessage, 
  message, 
  logoUrl, 
  illustrationUrl 
}) => {
  try {
    const templatePath = path.join(__dirname, '../mailTemplate/notificationEmail.html');
    let htmlTemplate = fs.readFileSync(templatePath, 'utf8');

    htmlTemplate = htmlTemplate.replace(/{{USER_NAME}}/g, userName || 'User');
    htmlTemplate = htmlTemplate.replace(/{{SUCCESS_MESSAGE}}/g, successMessage || '');
    htmlTemplate = htmlTemplate.replace(/{{MESSAGE}}/g, message || '');
    htmlTemplate = htmlTemplate.replace(/{{YEAR}}/g, new Date().getFullYear().toString());
    htmlTemplate = htmlTemplate.replace(/{{LOGO_URL}}/g, logoUrl || '');
    htmlTemplate = htmlTemplate.replace(/{{ILLUSTRATION_URL}}/g, illustrationUrl || '');

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USERNAME,
      to,
      subject: subject || 'Notification from Gmaxepay',
      html: htmlTemplate,
      text: `Dear ${userName},\n\n${successMessage || ''}\n\n${message || ''}\n\nBest regards,\nGMAXEPAY Team`
    };

    const info = await transport.sendMail(mailOptions);
    return { success: true, messageId: info.messageId, response: info.response };
  } catch (error) {
    console.error('Error sending notification email:', error);
    throw new Error(`Failed to send notification email: ${error.message}`);
  }
};

/**
 * Send OTP email for verification
 * @param {Object} options
 * @param {string} options.to
 * @param {string} options.userName
 * @param {string} options.otp
 * @param {number} options.expiryMinutes
 */
module.exports.sendOtpEmail = async ({ to, userName, otp, expiryMinutes = 3, logoUrl, illustrationUrl }) => {
  try {
    const templatePath = path.join(__dirname, '../mailTemplate/emailOtp.html');
    let htmlTemplate = fs.readFileSync(templatePath, 'utf8');

    htmlTemplate = htmlTemplate.replace(/{{USER_NAME}}/g, userName || 'User');
    htmlTemplate = htmlTemplate.replace(/{{OTP_CODE}}/g, otp);
    htmlTemplate = htmlTemplate.replace(/{{EXPIRY_MINUTES}}/g, String(expiryMinutes));
    htmlTemplate = htmlTemplate.replace(/{{YEAR}}/g, new Date().getFullYear().toString());
    htmlTemplate = htmlTemplate.replace(/{{LOGO_URL}}/g, logoUrl || '');
    htmlTemplate = htmlTemplate.replace(/{{ILLUSTRATION_URL}}/g, illustrationUrl || '');

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USERNAME,
      to,
      subject: 'OTP Request from Gmaxepay for Email Verification',
      html: htmlTemplate,
      text: `Request for OTP from Gmaxepay. Your verification code is ${otp}. It expires in ${expiryMinutes} minutes.`
    };

    const info = await transport.sendMail(mailOptions);
    return { success: true, messageId: info.messageId, response: info.response };
  } catch (error) {
    console.error('Error sending OTP email:', error);
    throw new Error(`Failed to send OTP email: ${error.message}`);
  }
};

/**
 * Send temporary password email after onboarding completion
 * @param {Object} options
 * @param {string} options.to
 * @param {string} options.userName
 * @param {string} options.tempPassword
 * @param {string} options.logoUrl
 * @param {string} options.illustrationUrl
 */
module.exports.sendTempPasswordEmail = async ({ to, userName, tempPassword, logoUrl, illustrationUrl }) => {
  try {
    const templatePath = path.join(__dirname, '../mailTemplate/tempPasswordEmail.html');
    let htmlTemplate = fs.readFileSync(templatePath, 'utf8');

    htmlTemplate = htmlTemplate.replace(/{{USER_NAME}}/g, userName || 'User');
    htmlTemplate = htmlTemplate.replace(/{{TEMP_PASSWORD}}/g, tempPassword);
    htmlTemplate = htmlTemplate.replace(/{{YEAR}}/g, new Date().getFullYear().toString());
    htmlTemplate = htmlTemplate.replace(/{{LOGO_URL}}/g, logoUrl || '');
    htmlTemplate = htmlTemplate.replace(/{{ILLUSTRATION_URL}}/g, illustrationUrl || '');

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USERNAME,
      to,
      subject: 'Your Temporary Password - Gmaxepay',
      html: htmlTemplate,
      text: `Dear ${userName},\n\nYour details have already been uploaded. Your temporary password is: ${tempPassword}\n\nPlease use this password to login to your account.\n\nBest regards,\nGMAXEPAY Team`
    };

    const info = await transport.sendMail(mailOptions);
    return { success: true, messageId: info.messageId, response: info.response };
  } catch (error) {
    console.error('Error sending temporary password email:', error);
    throw new Error(`Failed to send temporary password email: ${error.message}`);
  }
};

