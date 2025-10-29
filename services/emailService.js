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

    console.log("logoUrl", logoUrl);
    console.log("iconUrl", iconUrl);
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

