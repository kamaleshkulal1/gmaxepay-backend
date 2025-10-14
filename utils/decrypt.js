const crypto = require('crypto');

function decrypt(encryptedText) {
  const workingKey = process.env.BBPS_ENCRYPTION_KEY || 'default_bbps_key';
  const key = crypto.createHash('md5').update(workingKey).digest();
  const initVector = Buffer.from([
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b,
    0x0c, 0x0d, 0x0e, 0x0f
  ]);

  const encryptedBuf = Buffer.from(encryptedText, 'hex');

  const decipher = crypto.createDecipheriv('aes-128-cbc', key, initVector);
  let decrypted = decipher.update(encryptedBuf);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

module.exports = decrypt;
