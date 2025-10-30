const crypto = require('crypto');
const { parseTimeToMilliseconds } = require('./common');
const { doubleEncrypt, decrypt } = require('./doubleCheckUp');
const key = Buffer.from(process.env.AES_KEY, 'hex');

/**
 * Generate encrypted onboarding token
 * @param {Object} userData - User data to encode in token
 * @param {Number} userData.userId - User ID
 * @param {String} userData.name - User name
 * @param {Number} userData.companyId - Company ID
 * @param {String} userData.mobileNo - Mobile number
 * @param {Number} userData.userRole - User role
 * @param {String} expiryString - Expiry string (e.g., "5m", "6d")
 * @returns {Object} - Returns token string and expiry date
 */
const generateOnboardingToken = (userData, expiryString = '6d') => {
  try {
    // Parse expiry time
    const expiryMs = parseTimeToMilliseconds(expiryString);
    const expiresAt = new Date(Date.now() + expiryMs);

    // Create token payload
    const tokenPayload = {
      userId: userData.userId,
      name: userData.name,
      companyId: userData.companyId,
      userRole: userData.userRole,
      timestamp: Date.now(),
      expiresAt: expiresAt.getTime()
    };

    // Encrypt the token payload
    const jsonPayload = JSON.stringify(tokenPayload);
    const encryptedData = doubleEncrypt(jsonPayload, key);

    // Encode to base64 for URL-safe transmission
    const encodedToken = Buffer.from(JSON.stringify(encryptedData)).toString('base64');

    // Replace URL-unsafe characters
    const urlSafeToken = encodedToken
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Format expiry time for display
    const expiryDisplay = formatExpiryTime(expiryString);

    return {
      token: urlSafeToken,
      expiresAt: expiresAt,
      expiryDisplay: expiryDisplay
    };
  } catch (error) {
    console.error('Error generating onboarding token:', error);
    throw new Error(`Failed to generate token: ${error.message}`);
  }
};

/**
 * Decrypt and validate onboarding token
 * @param {String} token - Encoded token string
 * @returns {Object|null} - Decrypted user data or null if invalid
 */
const decryptOnboardingToken = (token) => {
  try {
    // Decode from URL-safe format
    let base64Token = token
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    // Add padding if needed
    const padding = 4 - (base64Token.length % 4);
    if (padding !== 4) {
      base64Token += '='.repeat(padding);
    }

    // Decode from base64
    const decodedToken = Buffer.from(base64Token, 'base64').toString('utf-8');
    const encryptedData = JSON.parse(decodedToken);

    // Decrypt the data
    const decryptedJson = decrypt(encryptedData, key);
    if (!decryptedJson) {
      return null;
    }

    const tokenData = JSON.parse(decryptedJson);

    // Check if token is expired
    if (Date.now() > tokenData.expiresAt) {
      return null; // Token expired
    }

    return {
      userId: tokenData.userId,
      name: tokenData.name,
      companyId: tokenData.companyId,
      userRole: tokenData.userRole,
      expiresAt: tokenData.expiresAt
    };
  } catch (error) {
    console.error('Error decrypting onboarding token:', error);
    return null;
  }
};

/**
 * Format expiry time string for display
 * @param {String} expiryString - Expiry string (e.g., "5m", "6d")
 * @returns {String} - Formatted string (e.g., "5 minutes", "6 days")
 */
const formatExpiryTime = (expiryString) => {
  if (!expiryString || typeof expiryString !== 'string') {
    return '6 days';
  }

  const timeRegex = /^(\d+)([smhd])$/i;
  const match = expiryString.match(timeRegex);
  
  if (!match) {
    return '6 days';
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's':
      return value === 1 ? '1 second' : `${value} seconds`;
    case 'm':
      return value === 1 ? '1 minute' : `${value} minutes`;
    case 'h':
      return value === 1 ? '1 hour' : `${value} hours`;
    case 'd':
      return value === 1 ? '1 day' : `${value} days`;
    default:
      return '6 days';
  }
};

module.exports = {
  generateOnboardingToken,
  decryptOnboardingToken,
  formatExpiryTime
};


