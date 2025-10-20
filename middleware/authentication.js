const jwt = require('jsonwebtoken');
const { JWT } = require('../constants/authConstant');
const { MESSAGE } = require('../constants/msgConstant');
const dbService = require('../utils/dbService');
const model = require('../models/index');

const authentication = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.unAuthorized({
        data: null,
        message: 'Token missing or invalid'
      });
    }

    const token = authHeader.split(' ')[1]?.trim();

    const decodedUser = jwt.verify(token, JWT.SECRET, {
      algorithms: [JWT.ALGORITHM],
      issuer: JWT.ISSUER,
      audience: JWT.AUDIENCE
    });

    if (!decodedUser?.id) {
      return res.unAuthorized({
        data: null,
        message: MESSAGE.MIDDLEWARE.UNAUTH_USER
      });
    }

    const user = await dbService.findOne(
      model.user,
      {
        id: decodedUser?.id,
        isActive: true,
        isDeleted: false
      },
      { attributes: ['id', 'mobileNo', 'companyId', 'userRole', 'userType', 'tokenVersion'] }
    );

    if (!user) {
      return res.unAuthorized({
        data: null,
        message: 'User not found or inactive'
      });
    }

    
    if (user.tokenVersion !== decodedUser.tokenVersion) {
      return res.unAuthorized({
        data: null,
        message: 'Token has been invalidated. Please login again.'
      });
    }

    // Attach user to request
    req.user = {
      id: user.id,
      mobileNo: user.mobileNo,
      companyId: user.companyId,
      userRole: user.userRole,
      userType: user.userType,
      tokenVersion: user.tokenVersion
    };

    next();
  } catch (err) {
    console.error('Authentication Error:', err);
    if (err.name === 'TokenExpiredError') {
      return res.unAuthorized({ message: MESSAGE.MIDDLEWARE.TOKEN_EXPIRE });
    }
    return res.unAuthorized({ message: MESSAGE.MIDDLEWARE.UNAUTH_USER });
  }
};

module.exports = authentication;
