const crypto = require('crypto');
const key = Buffer.from(process.env.AES_KEY, 'hex');
const iv = Buffer.from(process.env.AES_IV, 'hex');

const encrypt = (text) => {
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
};

const decrypt = (encryptedText) => {
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

const sha256_encrypt = (text) => {  
  const hash = crypto.createHash('sha256');
  hash.update(text);
  return hash.digest('hex').toLocaleLowerCase();
};

const md5_encrypt = (text) => {
  const hash = crypto.createHash('md5');
  hash.update(text);
  return hash.digest('hex');
};

module.exports = {
  encrypt,
  decrypt,
  sha256_encrypt,
  md5_encrypt
};
