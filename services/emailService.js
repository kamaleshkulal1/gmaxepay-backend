const nodemailer = require('nodemailer');
const { transport } = require('../config/nodemailer.config');
const fs = require('fs');
const path = require('path');


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


module.exports.sendMPINSetEmail = async ({ 
  to, 
  userName, 
  userEmail,
  userMobile,
  actionType = 'set',
  logoUrl, 
  illustrationUrl 
}) => {
  try {
    const templatePath = path.join(__dirname, '../mailTemplate/mpinSetEmail.html');
    let htmlTemplate = fs.readFileSync(templatePath, 'utf8');

    const actionText = actionType === 'reset' ? 'reset' : 'set';
    const dateTime = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    htmlTemplate = htmlTemplate.replace(/{{USER_NAME}}/g, userName || 'User');
    htmlTemplate = htmlTemplate.replace(/{{USER_EMAIL}}/g, userEmail || '');
    htmlTemplate = htmlTemplate.replace(/{{USER_MOBILE}}/g, userMobile || '');
    htmlTemplate = htmlTemplate.replace(/{{ACTION_TYPE}}/g, actionText);
    htmlTemplate = htmlTemplate.replace(/{{DATE_TIME}}/g, dateTime);
    htmlTemplate = htmlTemplate.replace(/{{YEAR}}/g, new Date().getFullYear().toString());
    htmlTemplate = htmlTemplate.replace(/{{LOGO_URL}}/g, logoUrl || '');
    htmlTemplate = htmlTemplate.replace(/{{ILLUSTRATION_URL}}/g, illustrationUrl || '');

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USERNAME,
      to,
      subject: `Your MPIN Has Been ${actionText.charAt(0).toUpperCase() + actionText.slice(1)} Successfully - Gmaxepay`,
      html: htmlTemplate,
      text: `Dear ${userName},\n\nYour MPIN has been successfully ${actionText} for your GMAXEPAY account.\n\nAccount Details:\nEmail: ${userEmail}\nMobile: ${userMobile}\nDate & Time: ${dateTime}\n\nSecurity Reminder:\n• Never share your MPIN with anyone\n• Do not use easily guessable PINs\n• If you suspect your MPIN has been compromised, reset it immediately\n\nBest regards,\nGMAXEPAY Team`
    };

    const info = await transport.sendMail(mailOptions);
    return { success: true, messageId: info.messageId, response: info.response };
  } catch (error) {
    console.error('Error sending MPIN set email:', error);
    throw new Error(`Failed to send MPIN set email: ${error.message}`);
  }
};


module.exports.sendFundApprovalEmail = async ({ 
  to, 
  companyName,
  userName, 
  amount, 
  transactionId, 
  approverName,
  logoUrl, 
  illustrationUrl 
}) => {
  try {
    const templatePath = path.join(__dirname, '../mailTemplate/fundApprovalEmail.html');
    let htmlTemplate = fs.readFileSync(templatePath, 'utf8');

    htmlTemplate = htmlTemplate.replace(/{{USER_NAME}}/g, userName || 'User');
    htmlTemplate = htmlTemplate.replace(/{{AMOUNT}}/g, amount || '0.00');
    htmlTemplate = htmlTemplate.replace(/{{TRANSACTION_ID}}/g, transactionId || '');
    htmlTemplate = htmlTemplate.replace(/{{YEAR}}/g, new Date().getFullYear().toString());
    htmlTemplate = htmlTemplate.replace(/{{LOGO_URL}}/g, logoUrl || '');
    htmlTemplate = htmlTemplate.replace(/{{ILLUSTRATION_URL}}/g, illustrationUrl || '');

    const subject = approverName 
      ? `Fund Request Approved by ${approverName} - ${companyName}`
      : 'Fund Request Approved - Gmaxepay';

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USERNAME,
      to,
      subject: subject,
      html: htmlTemplate,
      text: `Dear ${userName},\n\nYour fund request has been approved successfully${approverName ? ` by ${approverName}` : ''}!\n\nAmount: ₹${amount}\nTransaction ID: ${transactionId}\n\nThe amount has been credited to your wallet. You can now use it for your transactions.\n\nBest regards,\nGMAXEPAY Team`
    };

    const info = await transport.sendMail(mailOptions);
    return { success: true, messageId: info.messageId, response: info.response };
  } catch (error) {
    console.error('Error sending fund approval email:', error);
    throw new Error(`Failed to send fund approval email: ${error.message}`);
  }
};

