const jwt = require('jsonwebtoken');
const { JWT } = require('../constants/authConstant');
const { MESSAGE } = require('../constants/msgConstant');
const dbService = require('../utils/dbService');
const model = require('../models/index');

const authentication = async (req, res, next) => {
  try {
    // SECURITY: Validate JWT secret exists
    if (!JWT.SECRET || JWT.SECRET.length < 32) {
      console.error('SECURITY ERROR: JWT_SECRET is missing or too weak!');
      return res.internalServerError({
        data: null,
        message: 'Authentication service unavailable'
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.unAuthorized({
        data: null,
        message: 'Token missing or invalid'
      });
    }

    const token = authHeader.split(' ')[1]?.trim();
    
    // SECURITY: Validate token format (basic check)
    if (!token || token.length < 50) {
      return res.unAuthorized({
        data: null,
        message: 'Invalid token format'
      });
    }

    // SECURITY: Verify token with strict options
    const decodedUser = jwt.verify(token, JWT.SECRET, {
      algorithms: [JWT.ALGORITHM], 
      issuer: JWT.ISSUER,
      audience: JWT.AUDIENCE,
      clockTolerance: 5, 
      maxAge: JWT.EXPIRES_IN ? `${JWT.EXPIRES_IN * 60}s` : undefined
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

    // Load user permissions based on role
    let permissions = [];
    if (user.userRole) {
      const rolePermissions = await dbService.findAll(
        model.rolePermission,
        { roleId: user.userRole },
        {
          include: [
            {
              model: model.permission,
              attributes: ['id', 'moduleName', 'isParent', 'parentId']
            }
          ]
        }
      );
      
      permissions = rolePermissions.map(rp => ({
        permissionId: rp.permissionId,
        read: rp.read,
        write: rp.write,
        dataValues: {
          permissionId: rp.permissionId,
          read: rp.read,
          write: rp.write
        }
      }));
    }

    // Attach user and permissions to request
    req.user = {
      id: user.id,
      mobileNo: user.mobileNo,
      companyId: user.companyId,
      userRole: user.userRole,
      userType: user.userType,
      tokenVersion: user.tokenVersion
    };
    
    req.permission = permissions;

    next();
  } catch (err) {
    // SECURITY: Don't log full token in error logs
    console.error('Authentication Error:', {
      name: err.name,
      message: err.message,
      path: req.path,
      ip: req.ip
    });
    
    if (err.name === 'TokenExpiredError') {
      return res.unAuthorized({ message: MESSAGE.MIDDLEWARE.TOKEN_EXPIRE });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.unAuthorized({ message: 'Invalid token. Please login again.' });
    }
    if (err.name === 'NotBeforeError') {
      return res.unAuthorized({ message: 'Token not yet valid.' });
    }
    
    // Generic error for other JWT errors
    return res.unAuthorized({ message: MESSAGE.MIDDLEWARE.UNAUTH_USER });
  }
};

module.exports = authentication;
