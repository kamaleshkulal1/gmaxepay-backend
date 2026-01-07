const crypto = require('crypto');

const generateTransactionID = (companyName) => {
  // Process company name to get 4-character prefix
  let companyPrefix = '';
  
  if (companyName) {
    // Remove spaces and convert to uppercase
    let processedName = companyName.replace(/\s+/g, '').toUpperCase();
    
    if (processedName.length === 3) {
      // If exactly 3 characters, add a random letter to make it 4
      const randomLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
      companyPrefix = processedName + randomLetter;
    } else if (processedName.length >= 4) {
      // If 4 or more characters, take first 4
      companyPrefix = processedName.substring(0, 4);
    } else {
      // If less than 3 characters, pad with random letters to make it 4
      const needed = 4 - processedName.length;
      const randomLetters = Array.from({ length: needed }, () => 
        String.fromCharCode(65 + Math.floor(Math.random() * 26))
      ).join('');
      companyPrefix = processedName + randomLetters;
    }
  } else {
    // Default to 'GP' if no company name provided
    companyPrefix = 'GP';
  }

  const randomID = crypto.randomBytes(3).toString('hex').toUpperCase();

  const now = new Date();
  const formattedDate =
    now.toISOString().slice(2, 10).replace(/-/g, '') + // YYMMDD
    now.toISOString().slice(11, 13) + // HH
    now.toISOString().slice(14, 16); // MM

  const transactionID = companyPrefix + formattedDate + randomID;

  return transactionID;
};

const generateMerchantLoginId = (companyName, existingCount = 0) => {
  // Process company name to get 4-character prefix
  let companyPrefix = '';
  
  if (companyName) {
    // Remove spaces, special characters and convert to uppercase
    let processedName = companyName.replace(/[^a-zA-Z]/g, '').toUpperCase();
    
    if (processedName.length >= 4) {
      // If 4 or more characters, take first 4
      companyPrefix = processedName.substring(0, 4);
    } else if (processedName.length > 0) {
      // If less than 4 characters, pad with 'X' to make it 4
      companyPrefix = processedName.padEnd(4, 'X');
    } else {
      // Default to 'MERC' if no valid characters
      companyPrefix = 'MERC';
    }
  } else {
    // Default to 'MERC' if no company name provided
    companyPrefix = 'MERC';
  }

  // Generate 6-digit sequential number
  // Start from existingCount + 1 to ensure uniqueness
  const sequentialNumber = (existingCount + 1).toString().padStart(6, '0');

  const merchantLoginId = companyPrefix + sequentialNumber;

  return merchantLoginId;
};

module.exports = {
  generateTransactionID,
  generateMerchantLoginId
};
