const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const crypto = require('crypto');
const { encrypt, decrypt } = require('../utils/encryption');

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

const extractS3Key = (imageData) => {
  if (!imageData) return null;

  if (typeof imageData === 'string' && imageData.startsWith('images/')) {
    return imageData;
  }

  if (typeof imageData === 'object') {
    const key = imageData.key || imageData;
    if (typeof key === 'string' && key.startsWith('images/')) {
      return key;
    }
    if (typeof key === 'string') {
      try {
        const decrypted = decrypt(key);
        return (decrypted && decrypted.startsWith('images/')) ? decrypted : key;
      } catch {
        return key;
      }
    }
    return key;
  }

  if (typeof imageData === 'string') {
    if (imageData.startsWith('images/')) {
      return imageData;
    }

    if (imageData.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(imageData);
        const key = parsed.key || imageData;
        if (typeof key === 'string' && key.startsWith('images/')) {
          return key;
        }
        if (typeof key === 'string') {
          try {
            const decrypted = decrypt(key);
            return (decrypted && decrypted.startsWith('images/')) ? decrypted : key;
          } catch {
            return key;
          }
        }
        return key;
      } catch {
      }
    }

    try {
      const decrypted = decrypt(imageData);
      return (decrypted && decrypted.startsWith('images/')) ? decrypted : imageData;
    } catch {
      return imageData;
    }
  }

  return imageData;
};

const getImageUrl = (encryptedKey, useSecureProxy = true) => {
  if (!encryptedKey) return null;

  try {
    const s3Key = extractS3Key(encryptedKey);
    if (!s3Key || !s3Key.startsWith('images/')) {
      return null;
    }

    const isProfileImage = s3Key.includes('/profile/');
    const isCompanyImage = s3Key.includes('/signature/') || s3Key.includes('/loginSlider/');

    if (isProfileImage || !useSecureProxy) {
      return `${AWS_CDN_URL}/${s3Key}`;
    }

    if (isCompanyImage) {
      return `${AWS_CDN_URL}/${s3Key}`;
    }

    const encrypted = encrypt(s3Key);
    const encodedKey = encodeURIComponent(encrypted);
    return `${BASE_URL}/api/v1/images/secure/${encodedKey}`;
  } catch (error) {
    console.error('Error generating image URL:', error);
    try {
      const s3Key = extractS3Key(encryptedKey);
      if (s3Key && s3Key.startsWith('images/')) {
        const isCompanyImage = s3Key.includes('/signature/') || s3Key.includes('/loginSlider/');
        return isCompanyImage
          ? `${AWS_CDN_URL}/${s3Key}`
          : `${AWS_CDN_URL}/${s3Key}`;
      }
    } catch {
      // Ignore errors
    }
    return null;
  }
};

const generateS3Key = (type, companyId, subtype, userId, fileName) => {
  const defaultCompanyId = companyId || 'default';

  const keyMap = {
    loginSlider: `images/${defaultCompanyId}/loginSlider/${fileName}`,
    signature: subtype ? `images/${defaultCompanyId}/signature/${subtype}/${fileName}` : null,
    company: subtype ? `images/company/${defaultCompanyId}/${subtype}/${fileName}` : null,
    bank: `images/bank/${subtype || 'bankLogo'}/${fileName}`,
    profile: userId && companyId
      ? (subtype ? `images/${userId}/${companyId}/profile/${subtype}/${fileName}` : `images/${userId}/${companyId}/profile/${fileName}`)
      : (subtype ? `images/profile/${subtype}/${fileName}` : null),
    shop: userId
      ? `images/${defaultCompanyId}/${userId}/shopImage/${fileName}`
      : `images/${defaultCompanyId}/shop/${fileName}`,
    aadhaar: subtype && userId ? `images/${defaultCompanyId}/aadhaar/${userId}/${subtype}/${fileName}` : null,
    pan: subtype && userId ? `images/${defaultCompanyId}/pan/${userId}/${subtype}/${fileName}` : null,
    service: subtype
      ? `images/${defaultCompanyId}/service/${subtype}/${fileName}`
      : `images/${defaultCompanyId}/service/${fileName}`,
  };

  return keyMap[type] || `images/${defaultCompanyId}/other/${fileName}`;
};

const getContentType = (fileExt) => {
  const contentTypeMap = {
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  };
  return contentTypeMap[fileExt.toLowerCase()] || 'image/jpeg';
};

const uploadImageToS3 = async (fileBuffer, fileName, type, companyId, subtype = null, userId = null) => {
  try {
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(fileName) || '.jpg';
    const sanitizedFileName = `${timestamp}_${randomString}${ext}`;

    const s3Key = generateS3Key(type, companyId, subtype, userId, sanitizedFileName);
    const contentType = getContentType(ext);

    const params = {
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: contentType
    };

    await s3Client.send(new PutObjectCommand(params));

    return {
      url: s3Key,
      key: s3Key
    };
  } catch (error) {
    console.error('Error uploading image to S3:', error);
    throw error;
  }
};

const deleteImageFromS3 = async (encryptedKey) => {
  try {
    if (!encryptedKey) return false;

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

const getImageStreamFromS3 = async (encryptedKey) => {
  try {
    if (!encryptedKey) {
      throw new Error('S3 key is required');
    }

    const s3Key = extractS3Key(encryptedKey);
    if (!s3Key || !s3Key.startsWith('images/')) {
      throw new Error('Invalid S3 key');
    }

    const params = {
      Bucket: BUCKET_NAME,
      Key: s3Key
    };

    const response = await s3Client.send(new GetObjectCommand(params));

    return {
      stream: response.Body,
      contentType: response.ContentType || 'image/jpeg',
      contentLength: response.ContentLength,
      lastModified: response.LastModified
    };
  } catch (error) {
    console.error('Error getting image stream from S3:', error);
    throw error;
  }
};

const getImageFromS3 = async (encryptedKey) => {
  try {
    if (!encryptedKey) {
      throw new Error('S3 key is required');
    }

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

const encryptS3Key = (s3Key) => {
  if (!s3Key) return null;
  if (!s3Key.startsWith('images/')) return s3Key;

  try {
    return encrypt(s3Key);
  } catch (error) {
    console.error('Error encrypting S3 key:', error);
    return s3Key;
  }
};

module.exports = {
  uploadImageToS3,
  deleteImageFromS3,
  getImageFromS3,
  getImageStreamFromS3,
  getImageUrl,
  extractS3Key,
  encryptS3Key,
  BUCKET_NAME
};
