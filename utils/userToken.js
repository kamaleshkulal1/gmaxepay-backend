const { doubleEncrypt, decrypt } = require('./doubleCheckUp');
const key = Buffer.from(process.env.AES_KEY, 'hex');

/**
 * Generate encrypted user token (contains only userId, no expiry)
 * @param {String|Number} userId - User ID to encode in token
 * @returns {String} - Encrypted token string
 */
const generateUserToken = (userId) => {
  try {
    if (!userId) {
      throw new Error('UserId is required for token generation');
    }

    // Create token payload (only userId, no expiry)
    const tokenPayload = {
      userId: userId.toString(),
      timestamp: Date.now()
    };

    // Encrypt the token payload using double encryption
    const jsonPayload = JSON.stringify(tokenPayload);
    const encryptedData = doubleEncrypt(jsonPayload, key);

    // Encode to base64 for URL-safe transmission
    const encodedToken = Buffer.from(JSON.stringify(encryptedData)).toString('base64');

    // Replace URL-unsafe characters
    const urlSafeToken = encodedToken
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return urlSafeToken;
  } catch (error) {
    console.error('Error generating user token:', error);
    throw new Error(`Failed to generate token: ${error.message}`);
  }
};

/**
 * Decrypt and validate user token
 * @param {String} token - Encoded token string
 * @returns {Object|null} - Decrypted user data with userId or null if invalid
 */
const decryptUserToken = (token) => {
  try {
    if (!token || typeof token !== 'string') {
      return null;
    }

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

    // Decrypt the data using double decryption
    const decryptedJson = decrypt(encryptedData, key);
    if (!decryptedJson) {
      return null;
    }

    const tokenData = JSON.parse(decryptedJson);

    // Validate token has userId
    if (!tokenData.userId) {
      return null;
    }

    return {
      userId: tokenData.userId,
      timestamp: tokenData.timestamp
    };
  } catch (error) {
    console.error('Error decrypting user token:', error);
    return null;
  }
};

module.exports = {
  generateUserToken,
  decryptUserToken
};

