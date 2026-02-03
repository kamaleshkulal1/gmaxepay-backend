const { MESSAGE } = require('../constants/msgConstant');
const model = require('../models');
const dbService = require('../utils/dbService');

const hostCheck = async (req, res, next) => {
  const skipPaths = [
    '/retailer/payment/callback',
    '/retailer/payment/bankCallback',
    'retailer/recharge/callback',
    '/retailer/payment/zaakapay/callback'
  ];

  if (skipPaths.includes(req.path)) {
    return next();
  }
  const rawOrigin = req.headers.origin || req.headers.referer || '';
  let hostname = rawOrigin.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  hostname = hostname.split(':')[0];
  
  // This allows localhost to work with the default company domain
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    hostname = 'app.gmaxepay.in';
  }
  
  // Fallback for empty hostname (development)
  if (!hostname || hostname === '') {
    hostname = 'app.gmaxepay.in';
  }

  try {
    const company = await dbService.findOne(
      model.company,
      {
        customDomain: hostname
      },
      {
        attributes: ['id']
      }
    );
    if (!company) {
      return res.status(401).json({
        message: MESSAGE.MIDDLEWARE.TENANT_NOT_FOUND
      });
    }

    req.companyId = company.id;
    next();
  } catch (err) {
    console.error('Host check error:', err);
    return res.failure({ message: MESSAGE.MIDDLEWARE.INVALID_HOST });
  }
};

module.exports = hostCheck;
