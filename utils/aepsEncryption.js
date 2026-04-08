
const crypto = require('crypto');

const base64urlEncode = (data) => {
  const base64 = Buffer.from(data).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};


const base64urlDecode = (data) => {
  let base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const padding = 4 - (base64.length % 4);
  if (padding < 4) {
    base64 += '='.repeat(padding);
  }
  return Buffer.from(base64, 'base64').toString('utf8');
};


const createJwtToken = (payload, secret, alg = 'HS256') => {
  if (!secret) {
    throw new Error('Secret key is required for JWT signing');
  }

  // Prepare header
  const header = {
    typ: 'JWT',
    alg: alg
  };

  // Encode header and payload
  const headerEncoded = base64urlEncode(JSON.stringify(header));
  const payloadEncoded = base64urlEncode(JSON.stringify(payload));

  // Currently only supporting HS256
  if (alg !== 'HS256') {
    throw new Error('Only HS256 algorithm is supported');
  }

  // Create signature
  const signatureInput = `${headerEncoded}.${payloadEncoded}`;
  const signature = crypto.createHmac('sha256', secret).update(signatureInput).digest();
  const signatureEncoded = base64urlEncode(signature);

  // Return complete JWT
  return `${headerEncoded}.${payloadEncoded}.${signatureEncoded}`;
};


const verifyJwtToken = (jwt, secret, verifyExp = true) => {
  try {
    if (!jwt || !secret) {
      return null;
    }

    const parts = jwt.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode header and payload
    const headerJson = base64urlDecode(headerB64);
    const payloadJson = base64urlDecode(payloadB64);
    const signature = Buffer.from(signatureB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

    const header = JSON.parse(headerJson);
    const payload = JSON.parse(payloadJson);

    if (!header || !payload) {
      return null;
    }

    // Verify algorithm
    if (!header.alg || header.alg !== 'HS256') {
      return null;
    }

    // Verify signature
    const signatureInput = `${headerB64}.${payloadB64}`;
    const expectedSignature = crypto.createHmac('sha256', secret).update(signatureInput).digest();

    if (!crypto.timingSafeEqual(expectedSignature, signature)) {
      return null;
    }

    // Get current time
    const now = Math.floor(Date.now() / 1000);

    // Check "exp" (expiration time)
    if (verifyExp && payload.exp && now >= payload.exp) {
      return null;
    }

    // Check "nbf" (not before)
    if (payload.nbf && now < payload.nbf) {
      return null;
    }

    // Check "iat" (issued at)
    if (payload.iat && now < payload.iat) {
      return null;
    }

    return payload;
  } catch (error) {
    console.error('JWT verification error:', error.message);
    return null;
  }
};


const generatePractomindToken = (data, secret, expiresIn = 3600) => {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    ...data,
    iat: now,
    nbf: now,
    exp: now + expiresIn
  };

  return createJwtToken(payload, secret);
};

module.exports = {
  base64urlEncode,
  base64urlDecode,
  createJwtToken,
  verifyJwtToken,
  generatePractomindToken
};

