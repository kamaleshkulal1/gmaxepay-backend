const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { encrypt, decrypt } = require('../utils/encryption');

// Initialize S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const BUCKET_NAME = process.env.AWS_BUCKET || 'gmaxepaybucket';
const AWS_CDN_URL = process.env.AWS_CDN_URL || 'https://assets.gmaxepay.in';
const BASE_URL = process.env.BASE_URL || 'https://api-dev.gmaxepay.in';

/**
 * Extract S3 key from encrypted or plain image data
 * @param {String|Object} imageData - Encrypted key, plain key, or JSON object
 * @returns {String} - Decrypted S3 key
 */
const extractS3Key = (imageData) => {
  if (!imageData) return null;
  
  // If it's an object, extract key
  if (typeof imageData === 'object') {
    const key = imageData.key || imageData;
    // If key doesn't start with 'images/', try to decrypt it
    if (typeof key === 'string' && !key.startsWith('images/')) {
      try {
        return decrypt(key);
      } catch (e) {
        // If decryption fails, return as is (might be invalid)
        return key;
      }
    }
    return key;
  }
  
  // If it's a string
  if (typeof imageData === 'string') {
    // Check if it's JSON
    try {
      const parsed = JSON.parse(imageData);
      const key = parsed.key || imageData;
      // If key doesn't start with 'images/', try to decrypt it
      if (typeof key === 'string' && !key.startsWith('images/')) {
        try {
          return decrypt(key);
        } catch (e) {
          return key;
        }
      }
      return key;
    } catch {
      // Not JSON, check if it needs decryption
      if (!imageData.startsWith('images/')) {
        try {
          return decrypt(imageData);
        } catch (e) {
          // If decryption fails, return as is (might be already decrypted or invalid)
          return imageData;
        }
      }
      return imageData;
    }
  }
  
  return imageData;
};

/**
 * Get image URL - simple CDN URL for profile images and company images, secure proxy for others
 * @param {String|Object} encryptedKey - Encrypted S3 key from database (or plain key for backward compatibility)
 * @param {Boolean} useSecureProxy - Whether to use secure proxy endpoint (default: true, false for profile images and company images)
 * @returns {String} - CDN URL or secure proxy URL for the image
 */
const getImageUrl = (encryptedKey, useSecureProxy = true) => {
  if (!encryptedKey) return null;
  
  try {
    // Extract S3 key (decrypt if needed)
    const s3Key = extractS3Key(encryptedKey);
    
    if (!s3Key || !s3Key.startsWith('images/')) {
      return null;
    }
    
    // For profile images, always use simple CDN URL (no secure proxy)
    const isProfileImage = s3Key.includes('/profile/');
    // For company images (signature/logo, signature/favicon, loginSlider), use CDN URL
    const isCompanyImage = s3Key.includes('/signature/') || s3Key.includes('/loginSlider/');
    
    if (isProfileImage || isCompanyImage || !useSecureProxy) {
      // Use simple CDN URL for profile images and company images
      const cdnUrl = AWS_CDN_URL || 'https://assets.gmaxepay.in';
      return `${cdnUrl}/${s3Key}`;
    } else {
      // Use secure proxy for other images
      // Encrypt the S3 key for secure URL
      const encrypted = encrypt(s3Key);
      // URL encode the encrypted key
      const encodedKey = encodeURIComponent(encrypted);
      // Return secure proxy URL
      return `${BASE_URL}/api/v1/images/secure/${encodedKey}`;
    }
  } catch (error) {
    console.error('Error generating image URL:', error);
    // Fallback to direct CDN URL
    try {
      const s3Key = extractS3Key(encryptedKey);
      if (s3Key && s3Key.startsWith('images/')) {
        const cdnUrl = AWS_CDN_URL || 'https://assets.gmaxepay.in';
        return `${cdnUrl}/${s3Key}`;
      }
    } catch (e) {
      // Ignore errors
    }
    return null;
  }
};

/**
 * Upload image to S3
 * @param {Buffer} fileBuffer - File buffer
 * @param {String} fileName - File name
 * @param {String} type - Image type (loginSlider, signature)
 * @param {String} companyId - Company ID
 * @param {String} subtype - For signature type (logo, stamp, signature)
 * @param {String} userId - User ID (required for aadhaar and pan types)
 * @returns {Promise<Object>} - Returns S3 URL and key
 */
const uploadImageToS3 = async (fileBuffer, fileName, type, companyId, subtype = null, userId = null) => {
  try {
    // Generate unique file name
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(fileName) || '.jpg';
    const sanitizedFileName = `${timestamp}_${randomString}${ext}`;
    
    // Construct S3 key based on type
    let s3Key;
    if (type === 'loginSlider') {
      s3Key = `images/${companyId||'default'}/loginSlider/${sanitizedFileName}`;
    } else if (type === 'signature' && subtype) {
      s3Key = `images/${companyId||'default'}/signature/${subtype}/${sanitizedFileName}`;
    } else if (type === 'company' && subtype) {
      s3Key = `images/company/${companyId||'default'}/${subtype}/${sanitizedFileName}`;
    } else if (type === 'bank') {
      s3Key = `images/bank/${subtype || 'bankLogo'}/${sanitizedFileName}`;
    } else if (type === 'profile' && userId && companyId) {
      // Simple path pattern: images/{userId}/{companyId}/profile/
      // Include subtype if provided (e.g., liveness)
      if (subtype) {
        s3Key = `images/${userId}/${companyId}/profile/${subtype}/${sanitizedFileName}`;
      } else {
        s3Key = `images/${userId}/${companyId}/profile/${sanitizedFileName}`;
      }
    } else if (type === 'profile' && subtype) {
      s3Key = `images/profile/${subtype}/${sanitizedFileName}`;
    } else if (type === 'shop') {
      if (userId) {
        // New pattern: companyId/userId/shopImage/
        s3Key = `images/${companyId||'default'}/${userId}/shopImage/${sanitizedFileName}`;
      } else {
        // Old pattern for backward compatibility
        s3Key = `images/${companyId||'default'}/shop/${sanitizedFileName}`;
      }
    } else if (type === 'aadhaar' && subtype && userId) {
      s3Key = `images/${companyId||'default'}/aadhaar/${userId}/${subtype}/${sanitizedFileName}`;
    } else if (type === 'pan' && subtype && userId) {
      s3Key = `images/${companyId||'default'}/pan/${userId}/${subtype}/${sanitizedFileName}`;
    } else {
      s3Key = `images/${companyId||'default'}/other/${sanitizedFileName}`;
    }
    
    // Determine content type from file extension
    let contentType = 'image/jpeg';
    const fileExt = ext.toLowerCase();
    if (fileExt === '.png') contentType = 'image/png';
    else if (fileExt === '.gif') contentType = 'image/gif';
    else if (fileExt === '.webp') contentType = 'image/webp';
    
    // Upload to S3
    const params = {
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: contentType
    };
    
    await s3Client.send(new PutObjectCommand(params));
    
    // Return S3 key (will be encrypted before storing in database)
    // Controllers should encrypt this key before storing
    return {
      url: s3Key, // Plain S3 key (for immediate use)
      key: s3Key  // Plain S3 key (will be encrypted in model hooks)
    };
  } catch (error) {
    console.error('Error uploading image to S3:', error);
    throw error;
  }
};

/**
 * Delete image from S3
 * @param {String|Object} encryptedKey - Encrypted S3 key from database (or plain key)
 * @returns {Promise<Boolean>}
 */
const deleteImageFromS3 = async (encryptedKey) => {
  try {
    if (!encryptedKey) return false;
    
    // Extract and decrypt S3 key if needed
    const s3Key = extractS3Key(encryptedKey);
    
    if (!s3Key || !s3Key.startsWith('images/')) {
      console.error('Invalid S3 key for deletion');
      return false;
    }
    
    const params = {
      Bucket: BUCKET_NAME,
      Key: s3Key
    };
    
    await s3Client.send(new DeleteObjectCommand(params));
    return true;
  } catch (error) {
    console.error('Error deleting image from S3:', error);
    throw error;
  }
};

/**
 * Get image from S3
 * @param {String|Object} encryptedKey - Encrypted S3 key from database (or plain key)
 * @returns {Promise<Buffer>}
 */
const getImageFromS3 = async (encryptedKey) => {
  try {
    if (!encryptedKey) {
      throw new Error('S3 key is required');
    }
    
    // Extract and decrypt S3 key if needed
    const s3Key = extractS3Key(encryptedKey);
    
    if (!s3Key || !s3Key.startsWith('images/')) {
      throw new Error('Invalid S3 key');
    }
    
    const params = {
      Bucket: BUCKET_NAME,
      Key: s3Key
    };
    
    const response = await s3Client.send(new GetObjectCommand(params));
    const chunks = [];
    
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  } catch (error) {
    console.error('Error getting image from S3:', error);
    throw error;
  }
};

/**
 * Encrypt S3 key for secure storage in database
 * @param {String} s3Key - Plain S3 key
 * @returns {String} - Encrypted key
 */
const encryptS3Key = (s3Key) => {
  if (!s3Key) return null;
  if (!s3Key.startsWith('images/')) return s3Key; // Don't encrypt if it's not an S3 key
  try {
    return encrypt(s3Key);
  } catch (error) {
    console.error('Error encrypting S3 key:', error);
    return s3Key; // Return original if encryption fails
  }
};

module.exports = {
  uploadImageToS3,
  deleteImageFromS3,
  getImageFromS3,
  getImageUrl,
  extractS3Key,
  encryptS3Key,
  BUCKET_NAME
};

