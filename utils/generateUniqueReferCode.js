/**
 * generateUniqueReferCode.js
 * @description :: Utility function to generate unique refer codes
 * Format: First 2 letters of company name (uppercase) + 7 random alphanumeric characters = 9 total
 */

const model = require('../models');
const dbService = require('./dbService');
const { decrypt } = require('./encryption');

/**
 * Generate a unique refer code based on company name
 * @param {string} companyName - The name of the company
 * @param {number} maxRetries - Maximum number of retry attempts (default: 10)
 * @returns {Promise<string>} - Unique refer code
 */
const generateUniqueReferCode = async (companyName, maxRetries = 10) => {
  if (maxRetries <= 0) {
    throw new Error('Failed to generate unique refer code after multiple attempts');
  }

  // Get first 2 letters of company name, uppercase, remove spaces and special chars
  const cleanName = companyName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  let prefix = '';
  
  if (cleanName.length >= 2) {
    prefix = cleanName.substring(0, 2);
  } else if (cleanName.length === 1) {
    prefix = cleanName + 'X'; // If only 1 char, pad with X
  } else {
    prefix = 'GP'; // Default prefix if no valid chars
  }

  // Generate 7 random alphanumeric characters
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomPart = '';
  for (let i = 0; i < 7; i++) {
    randomPart += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  const referCode = prefix + randomPart;

  // Check if refer code already exists (need to check encrypted values)
  // Since referCode is encrypted in DB, we need to check all users and decrypt
  const allUsers = await dbService.findAll(model.user, {
    isDeleted: false,
    attributes: ['id', 'referCode']
  });

  // Check if any user has this refer code (after decryption)
  for (const user of allUsers) {
    if (user.referCode) {
      try {
        const decryptedCode = decrypt(user.referCode);
        if (decryptedCode === referCode) {
          // Code exists, generate a new one recursively
          return await generateUniqueReferCode(companyName, maxRetries - 1);
        }
      } catch (e) {
        // If decryption fails, skip this user
        continue;
      }
    }
  }

  return referCode;
};

module.exports = {
  generateUniqueReferCode
};

