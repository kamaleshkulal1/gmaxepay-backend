const crypto = require('crypto');

// Encryption/Decryption utility functions
const doubleEncrypt = (value, key) => {
    if (!value || !key) {
      throw new Error('Value and key are required for encryption');
    }
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.isBuffer(key) ? key.slice(0, 32) : Buffer.from(key).slice(0, 32), iv);
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
  
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  };
  
  const decrypt = (encryptedData, key) => {
    try {
      if (!encryptedData || !encryptedData.iv || !encryptedData.encrypted || !encryptedData.authTag) {
        console.error('Missing required encryption data:', encryptedData);
        return null;
      }
  
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        Buffer.isBuffer(key) ? key.slice(0, 32) : Buffer.from(key).slice(0, 32),
        Buffer.from(encryptedData.iv, 'hex')
      );
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      return null;
    }
};

  module.exports = {
    doubleEncrypt,
    decrypt
  };