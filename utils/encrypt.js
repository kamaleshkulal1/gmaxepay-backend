const crypto = require('crypto');

function encrypt(data) {
  const workingKey = process.env.BBPS_ENCRYPTION_KEY || 'default_bbps_key';

  const key = crypto.createHash('md5').update(workingKey).digest();
  const initVector = Buffer.from([
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b,
    0x0c, 0x0d, 0x0e, 0x0f
  ]);

  const cipher = crypto.createCipheriv('aes-128-cbc', key, initVector);
  let encrypted = cipher.update(data, 'utf8', 'binary');
  encrypted += cipher.final('binary');

  return Buffer.from(encrypted, 'binary').toString('hex');
}

module.exports = encrypt;
