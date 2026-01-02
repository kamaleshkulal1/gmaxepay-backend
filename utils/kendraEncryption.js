const crypto = require('crypto');

const SECRET = process.env.SECURITY_TOKEN;

if (!SECRET) {
  throw new Error('SECURITY_TOKEN is required in environment variables');
}

/**
 * Base64Url Encode - Optimized for strings
 */
const base64url_encode = (data) => {
  const str = typeof data === 'string' ? data : data.toString('utf8');
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

/**
 * Base64Url Encode Binary - For raw binary buffers (signatures)
 */
const base64url_encode_binary = (buffer) => {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

/**
 * Base64Url Decode - Optimized
 */
const base64url_decode = (data) => {
  let base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const padding = 4 - (base64.length % 4);
  if (padding < 4) {
    base64 += '='.repeat(padding);
  }
  return Buffer.from(base64, 'base64').toString('utf8');
};

/**
 * Base64Url Decode Binary - For raw binary buffers (signatures)
 */
const base64url_decode_binary = (data) => {
  let base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const padding = 4 - (base64.length % 4);
  if (padding < 4) {
    base64 += '='.repeat(padding);
  }
  return Buffer.from(base64, 'base64');
};

/**
 * Create JWT Token - Optimized
 * @param {Object} payload - JWT payload data
 * @param {String} secret - Secret key (defaults to process.env.SECURITY_TOKEN)
 * @param {String} alg - Algorithm (defaults to 'HS256')
 * @returns {String} JWT token
 */
const jwt_encode = (payload, secret = SECRET, alg = 'HS256') => {
  if (alg !== 'HS256') {
    throw new Error('Only HS256 algorithm is supported.');
  }

  const header = { typ: 'JWT', alg };
  const header_encoded = base64url_encode(JSON.stringify(header));
  const payload_encoded = base64url_encode(JSON.stringify(payload));

  // Create signature using HMAC SHA256 (raw binary)
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header_encoded}.${payload_encoded}`)
    .digest(); // Returns raw binary buffer

  // Convert raw binary buffer to base64url (like PHP hash_hmac with raw=true)
  const signature_encoded = base64url_encode_binary(signature);

  return `${header_encoded}.${payload_encoded}.${signature_encoded}`;
};

/**
 * Decode and Verify JWT Token - Optimized
 * @param {String} jwt - JWT token string
 * @param {String} secret - Secret key (defaults to process.env.SECURITY_TOKEN)
 * @param {Boolean} verify_exp - Whether to verify expiration (defaults to true)
 * @returns {Object|Boolean} Decoded payload or false if invalid
 */
const jwt_decode = (jwt, secret = SECRET, verify_exp = true) => {
  const parts = jwt.split('.');
  if (parts.length !== 3) return false;

  const [header_b64, payload_b64, signature_b64] = parts;

  try {
    const header = JSON.parse(base64url_decode(header_b64));
    const payload = JSON.parse(base64url_decode(payload_b64));
    const signature = base64url_decode_binary(signature_b64);

    if (!header || !payload || header.alg !== 'HS256') {
      return false;
    }

    // Verify signature
    const expected_signature = crypto
      .createHmac('sha256', secret)
      .update(`${header_b64}.${payload_b64}`)
      .digest();

    if (!crypto.timingSafeEqual(signature, expected_signature)) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);

    // Check expiration
    if (verify_exp && payload.exp && now >= payload.exp) return false;
    // Check "nbf" (Not Before)
    if (payload.nbf && now < payload.nbf) return false;
    // Check "iat" (Issued At)
    if (payload.iat && now < payload.iat) return false;

    return payload;
  } catch {
    return false;
  }
};

/**
 * Generate JWT token for Kendra API
 * @param {String} merchantLoginId - Unique merchant ID
 * @param {Number} iat - Issued at timestamp (optional, defaults to now)
 * @param {Number} nbf - Not before timestamp (optional, defaults to now)
 * @param {Number} exp - Expiry timestamp (optional, defaults to now + 1 hour)
 * @returns {String} JWT token
 */
const generateKendraToken = (merchantLoginId, iat = null, nbf = null, exp = null) => {
  const now = Math.floor(Date.now() / 1000);
  return jwt_encode({
    merchantLoginId,
    iat: iat || now,
    nbf: nbf || now,
    exp: exp || (now + 3600)
  });
};

module.exports = {
  base64url_encode,
  base64url_decode,
  jwt_encode,
  jwt_decode,
  generateKendraToken
};
