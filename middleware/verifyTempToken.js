const jwt = require('jsonwebtoken');
const { JWT } = require('../constants/authConstant');
const { MESSAGE } = require('../constants/msgConstant');
const dbService = require('../utils/dbService');
const model = require('../model/index');

const verifyTempToken = async (req, res, next) => {
  try {
    const mobileNo = req.body.mobileNo;

    if (!mobileNo) {
      return res.badRequest({ message: 'Mobile number is required' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.unAuthorized({
        data: null,
        message: 'Token missing or invalid'
      });
    }

    const token = authHeader.split(' ')[1]?.trim();

    const decodedUser = jwt.verify(token, JWT.JWT_TEMP_SECRET, {
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

    if (decodedUser.userMobile !== mobileNo) {
      return res.unAuthorized({
        data: null,
        message: 'Token is invalid for this mobile number'
      });
    }

    const user = await dbService.findOne(
      model.user,
      {
        id: decodedUser?.id,
        isActive: true,
        isDeleted: false
      },
      { attributes: ['id', 'mobileNo', 'companyId', 'userRole'] }
    );

    if (user.mobileNo !== decodedUser.userMobile) {
      return res.unAuthorized({
        data: null,
        message: 'Token is invalid for this mobile number'
      });
    }

    if (
      user.companyId !== req.companyId ||
      user.companyId !== decodedUser.companyId
    ) {
      return res.unAuthorized({
        data: null,
        message: MESSAGE.MIDDLEWARE.UNAUTH_HOST
      });
    }

    req.tempUser = decodedUser;
    req.tempToken = token;

    next();
  } catch (err) {
    console.error('Temp Token Error:', err);
    if (err.name === 'TokenExpiredError') {
      return res.failure({ message: MESSAGE.MIDDLEWARE.TOKEN_EXPIRE });
    }
    return res.failure({ message: MESSAGE.MIDDLEWARE.UNAUTH_USER });
  }
};

module.exports = verifyTempToken;
