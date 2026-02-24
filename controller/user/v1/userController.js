const dbService = require('../../../utils/dbService');
const model = require('../../../models/index');
const { generateUniqueReferCode } = require('../../../utils/generateUniqueReferCode');
const { decrypt: decryptReferCode } = require('../../../utils/encryption');
const { Op, Sequelize } = require('sequelize');
const bcrypt = require('bcrypt');
const emailService = require('../../../services/emailService');
const imageService = require('../../../services/imageService');
const random = require('random-string-alphanumeric-generator');
const moment = require('moment');
const amezesmsApi = require('../../../services/amezesmsApi');
const jwt = require('jsonwebtoken');
const { JWT } = require('../../../constants/authConstant');

const getProfile = async (req, res) => {
  try {
    const user = await dbService.findOne(model.user, { id: req.user.id });
    if (!user) {
      return res.notFound({ message: 'User not found' });
    }
    const outlet = await dbService.findOne(model.outlet, { refId: user.id });
    const userDetails = {
      userId: user.id,
      mobileNo: user.mobileNo,
      name: user.name,
      profileImage: user.profileImage ? `${process.env.AWS_CDN_URL}/${user.profileImage}` : null,
      referrerCode: user.referCode,
      outlet: outlet ? outlet.shopName : null
    }
    return res.success({ message: 'User profile retrieved successfully', data: userDetails });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
}

const getRolePrefix = (role) => {
  switch (role) {
    case 1: return 'AD'; // Super Admin
    case 2: return 'WU'; // Whitelabel/Company Admin
    case 3: return 'MD'; // Master Distributor
    case 4: return 'DI'; // Distributor
    case 5: return 'RE'; // Retailer
    case 6: return 'EP'; // Employee
    default: return null;
  }
};

const generateNewUserId = async (currentUserId, newRole, companyId) => {
  if (!currentUserId) {
    return null;
  }

  const newRolePrefix = getRolePrefix(newRole);
  if (!newRolePrefix) {
    return null;
  }

  const numberMatch = currentUserId.match(/(\d+)$/);
  if (!numberMatch) {
    return null;
  }

  const numberPart = numberMatch[1];
  const numberLength = numberPart.length;
  const prefixWithoutNumber = currentUserId.slice(0, -numberLength);
  const oldRolePrefix = prefixWithoutNumber.slice(-2);
  const companyPrefix = prefixWithoutNumber.slice(0, -2);

  const newUserId = `${companyPrefix}${newRolePrefix}${numberPart}`;

  const existingUser = await dbService.findOne(model.user, {
    userId: newUserId,
    companyId: companyId,
    isDeleted: false
  });

  if (existingUser) {
    const searchPattern = `${companyPrefix}${newRolePrefix}%`;
    const allUsersWithPattern = await model.user.findAll({
      where: {
        userId: {
          [Op.like]: searchPattern
        },
        companyId: companyId,
        isDeleted: false
      },
      order: [['createdAt', 'DESC']]
    });

    const prefixLength = companyPrefix.length + newRolePrefix.length;
    const existingNumbers = new Set();

    allUsersWithPattern.forEach(user => {
      if (user.userId) {
        const existingNumberPart = user.userId.slice(prefixLength);
        const num = parseInt(existingNumberPart, 10);
        if (!isNaN(num)) {
          existingNumbers.add(num);
        }
      }
    });

    let newIdNumber = parseInt(numberPart, 10);
    while (existingNumbers.has(newIdNumber)) {
      newIdNumber++;
    }

    const formattedNumber = newIdNumber.toString().padStart(numberLength, '0');
    return `${companyPrefix}${newRolePrefix}${formattedNumber}`;
  }

  return newUserId;
};

const upgradeUserRole = async (req, res) => {
  try {
    const currentUser = req.user;
    const { userId, targetRole } = req.body || {};

    if (!userId) {
      return res.failure({ message: 'User ID is required' });
    }

    if (!targetRole) {
      return res.failure({ message: 'Target role is required' });
    }

    // Only Master Distributor (userRole 3) can use this endpoint
    const currentUserRole = currentUser.userRole;
    if (currentUserRole !== 3) {
      return res.failure({ message: 'Not authorized to upgrade users' });
    }

    // Master Distributor can only upgrade to Distributor (4)
    const targetRoleInt = parseInt(targetRole);
    if (targetRoleInt !== 4) {
      return res.failure({ message: 'Master Distributor can only upgrade to Distributor (4)' });
    }

    // Find the user to upgrade
    const userToUpgrade = await dbService.findOne(model.user, {
      id: userId,
      companyId: currentUser.companyId,
      isDeleted: false
    });

    if (!userToUpgrade) {
      return res.failure({ message: 'User not found' });
    }

    const currentRole = userToUpgrade.userRole;

    // Check if user is already at target role or higher
    if (currentRole <= targetRoleInt) {
      if (currentRole === targetRoleInt) {
        return res.failure({ message: 'User already has this role' });
      } else {
        return res.failure({ message: 'User role is already higher than target role' });
      }
    }

    // Master Distributor can upgrade:
    // - Retailer (5) to Distributor (4)
    if (currentRole === 5 && targetRoleInt === 4) {
      // Retailer → Distributor - allowed
    } else {
      return res.failure({ message: 'Invalid upgrade path' });
    }

    // Generate new userId based on new role
    const newUserId = await generateNewUserId(
      userToUpgrade.userId,
      targetRoleInt,
      currentUser.companyId
    );

    if (!newUserId) {
      return res.failure({ message: 'Failed to generate new user ID' });
    }

    // Prepare update data
    const updateData = {
      userRole: targetRoleInt,
      userId: newUserId
    };

    // Update user role and userId
    await dbService.update(model.user, { id: userId }, updateData);

    // Reload updated user
    const updatedUser = await dbService.findOne(model.user, { id: userId, isDeleted: false });

    // Generate referral code for Distributor
    let referCode = null;
    if (targetRoleInt === 4) {
      const company = await dbService.findOne(model.company, { id: currentUser.companyId, isDeleted: false });
      const companyName = company?.companyName || 'USER';

      if (updatedUser.referCode) {
        try {
          referCode = decryptReferCode(updatedUser.referCode);
        } catch (e) {
          referCode = await generateUniqueReferCode(companyName);
          await dbService.update(model.user, { id: userId }, { referCode: referCode });
        }
      } else {
        referCode = await generateUniqueReferCode(companyName);
        await dbService.update(model.user, { id: userId }, { referCode: referCode });
      }
    }

    const responseData = {
      userId: userId,
      previousRole: currentRole,
      newRole: targetRoleInt,
      previousUserId: userToUpgrade.userId,
      newUserId: newUserId,
      ...(referCode ? { referCode } : {})
    };

    return res.success({
      message: 'User role upgraded successfully',
      data: responseData
    });
  } catch (error) {
    console.error('Error upgrading user role:', error);
    return res.internalServerError({ message: error.message });
  }
};

const degradeUserRole = async (req, res) => {
  try {
    const currentUser = req.user;
    const { userId, targetRole } = req.body || {};

    if (!userId) {
      return res.failure({ message: 'User ID is required' });
    }

    if (!targetRole) {
      return res.failure({ message: 'Target role is required' });
    }

    // Only Master Distributor (userRole 3) can use this endpoint
    const currentUserRole = currentUser.userRole;
    if (currentUserRole !== 3) {
      return res.failure({ message: 'Not authorized to degrade users' });
    }

    // Master Distributor can only degrade to Retailer (5)
    const targetRoleInt = parseInt(targetRole);
    if (targetRoleInt !== 5) {
      return res.failure({ message: 'Master Distributor can only degrade to Retailer (5)' });
    }

    // Find the user to degrade
    const userToDegrade = await dbService.findOne(model.user, {
      id: userId,
      companyId: currentUser.companyId,
      isDeleted: false
    });

    if (!userToDegrade) {
      return res.failure({ message: 'User not found' });
    }

    const currentRole = userToDegrade.userRole;

    // Check if it's actually a degradation
    if (targetRoleInt <= currentRole) {
      if (currentRole === targetRoleInt) {
        return res.failure({ message: 'User already has this role' });
      } else {
        return res.failure({ message: 'Target role must be lower than current role' });
      }
    }

    // Check if user has children (users with reportingTo = userId) before allowing downgrade
    const childrenCount = await dbService.count(model.user, {
      reportingTo: userId,
      companyId: currentUser.companyId,
      isDeleted: false
    });

    if (childrenCount > 0) {
      return res.failure({ message: 'You have children so downgrade not possible' });
    }

    // Master Distributor can degrade:
    // - Distributor (4) to Retailer (5)
    if (currentRole === 4 && targetRoleInt === 5) {
      // Distributor → Retailer - allowed
    } else {
      return res.failure({ message: 'Invalid degrade path' });
    }

    // Generate new userId based on new role
    const newUserId = await generateNewUserId(
      userToDegrade.userId,
      targetRoleInt,
      currentUser.companyId
    );

    if (!newUserId) {
      return res.failure({ message: 'Failed to generate new user ID' });
    }

    // Prepare update data
    const updateData = {
      userRole: targetRoleInt,
      userId: newUserId
    };

    // Update user role and userId
    await dbService.update(model.user, { id: userId }, updateData);

    return res.success({
      message: 'User role degraded successfully',
      data: {
        userId: userId,
        previousRole: currentRole,
        newRole: targetRoleInt,
        previousUserId: userToDegrade.userId,
        newUserId: newUserId
      }
    });
  } catch (error) {
    console.error('Error degrading user role:', error);
    return res.internalServerError({ message: error.message });
  }
};


const findAllUsers = async (req, res) => {
  try {
    // Master Distributor (userRole 3) and Distributor (userRole 4) can access this endpoint
    const userRole = req.user.userRole;
    const userId = req.user.id;
    const userCompanyId = req.user.companyId;

    if (![3, 4].includes(userRole)) {
      return res.failure({ message: 'You are not authorized to access this resource' });
    }
    if (!userCompanyId) {
      return res.failure({ message: "Company ID is required!" });
    }

    let dataToFind = req.body || {};
    let options = {};

    // Determine allowed user roles based on current user's role
    let allowedRoles = [];
    if (userRole === 3) {
      // Master Distributor can see Distributors (4) and Retailers (5) that report to them
      allowedRoles = [4, 5];
    } else if (userRole === 4) {
      // Distributor can only see Retailers (5) that report to them
      allowedRoles = [5];
    }

    let query = {
      reportingTo: userId, // Only users that report to the current user
      companyId: userCompanyId,
      userRole: { [Op.in]: allowedRoles },
      isDeleted: false
    };

    // Build query from request body
    if (dataToFind.query) {
      // Apply userRole filter if provided
      if (dataToFind.query.userRole !== undefined) {
        const requestedRole = dataToFind.query.userRole;

        // Access denied for userRole 1 (Admin), 2 (Whitelabel), and 3 (Master Distributor)
        if (requestedRole === 1 || requestedRole === 2 || requestedRole === 3) {
          return res.failure({ message: "Access denied! You cannot filter by this user role." });
        }

        // For Distributor (4), they can only filter by Retailer (5)
        if (userRole === 4 && requestedRole !== 5) {
          return res.failure({ message: "Access denied! Distributor can only view Retailers." });
        }

        // For Master Distributor (3), they can filter by Distributor (4) or Retailer (5)
        if (userRole === 3 && ![4, 5].includes(requestedRole)) {
          return res.failure({ message: "Access denied! Master Distributor can only view Distributors and Retailers." });
        }

        // Ensure it's one of the allowed roles for the current user
        if (allowedRoles.includes(requestedRole)) {
          query.userRole = requestedRole;
        }
      }

      if (dataToFind.query.kycStatus) {
        const kycStatusValue = dataToFind.query.kycStatus;

        if (kycStatusValue === 'pending') {
          query.kycStatus = { [Op.in]: ['HALF_KYC', 'NO_KYC'] };
        }
        else if (kycStatusValue === 'completed') {
          query.kycStatus = 'FULL_KYC';
        }
        else if (typeof kycStatusValue === 'string' && kycStatusValue.includes('||')) {
          const statuses = kycStatusValue.split('||').map(s => s.trim()).filter(s => s);
          if (statuses.length > 0) {
            query.kycStatus = { [Op.in]: statuses };
          }
        }
        else if (Array.isArray(kycStatusValue)) {
          query.kycStatus = { [Op.in]: kycStatusValue };
        }
        else {
          query.kycStatus = kycStatusValue;
        }
      }

      // Apply other query filters
      Object.keys(dataToFind.query).forEach(key => {
        if (key !== 'userRole' && key !== 'kycStatus') {
          query[key] = dataToFind.query[key];
        }
      });
    }

    // Handle options (pagination, sorting)
    if (dataToFind.options !== undefined) {
      options = { ...dataToFind.options };
    }

    // Handle customSearch
    if (dataToFind.customSearch) {
      const keys = Object.keys(dataToFind.customSearch);
      const orConditions = [];

      keys.forEach((key) => {
        if (typeof dataToFind.customSearch[key] === 'number') {
          orConditions.push(
            Sequelize.where(Sequelize.cast(Sequelize.col(key), 'varchar'), {
              [Op.iLike]: `%${dataToFind.customSearch[key]}%`
            })
          );
        } else {
          orConditions.push({
            [key]: {
              [Op.iLike]: `%${dataToFind.customSearch[key]}%`
            }
          });
        }
      });

      if (orConditions.length > 0) {
        query = {
          ...query,
          [Op.or]: orConditions
        };
      }
    }

    // Include company, wallet, and onboardingToken information
    options.include = [
      {
        model: model.company,
        as: 'company',
        attributes: ['id', 'companyName'],
        required: false
      },
      {
        model: model.wallet,
        as: 'wallet',
        attributes: ['id', 'mainWallet', 'apes1Wallet', 'apes2Wallet'],
        required: false
      },
      {
        model: model.onboardingToken,
        as: 'onboardingTokens',
        attributes: ['id', 'expiresAt', 'isUsed', 'isDeactivated', 'createdAt'],
        required: false,
        where: {
          isDeactivated: false,
          isUsed: false
        },
        separate: true,
        order: [['createdAt', 'DESC']],
        limit: 1
      }
    ];

    // Use pagination
    let foundUsers = await dbService.paginate(model.user, query, options);

    if (!foundUsers || !foundUsers.data || foundUsers.data.length === 0) {
      return res.success({
        message: 'Users Retrieved Successfully',
        data: [],
        total: 0,
        paginator: {
          itemCount: 0,
          perPage: options.paginate || 25,
          pageCount: 0,
          currentPage: options.page || 1
        }
      });
    }

    // Map userRole to readable names
    const roleMap = {
      2: 'WL',
      3: 'MD',
      4: 'DI',
      5: 'RE'
    };

    // Transform users data
    const transformedUsers = foundUsers.data.map((user) => {
      const userData = user.toJSON ? user.toJSON() : user;
      const companyData = userData.company || {};
      const walletData = userData.wallet || {};
      const onboardingTokens = userData.onboardingTokens || [];

      // Determine KYC Status
      const kycStatus = userData.kycStatus === 'FULL_KYC' ? 'completed' : 'pending';

      // Determine if account is locked
      const isLockedByStatus = !!(userData.isLocked && userData.lockUntil && new Date(userData.lockUntil) > new Date());
      const isLockedByAttempts = (userData.loginAttempts || 0) >= 3;
      const isLocked = isLockedByStatus || isLockedByAttempts;

      // Get the latest active onboarding token's expiresAt
      const latestOnboardingToken = Array.isArray(onboardingTokens) && onboardingTokens.length > 0
        ? onboardingTokens[0]
        : null;
      const onboardingTokenExpiresAt = latestOnboardingToken?.expiresAt || null;

      return {
        id: userData.id,
        date: userData.createdAt || null,
        userId: userData.userId || null,
        name: userData.name || null,
        userRole: roleMap[userData.userRole] || `Role ${userData.userRole}`,
        mobileNo: userData.mobileNo || null,
        email: userData.email || null,
        parentName: companyData.companyName || null,
        parentRole: 'Enterprise',
        company: companyData.companyName || null,
        companyId: userData.companyId || null,
        reportingTo: userData.reportingTo || null,
        kycStatus: kycStatus,
        kycSteps: userData.kycSteps || 0,
        status: userData.isActive ? 'Active' : 'Inactive',
        lock: isLocked,
        onboardingTokenExpiresAt: onboardingTokenExpiresAt,
        wallet: {
          mainWallet: walletData.mainWallet || 0,
          apes1Wallet: walletData.apes1Wallet || 0,
          apes2Wallet: walletData.apes2Wallet || 0
        }
      };
    });

    return res.success({
      message: 'Users Retrieved Successfully',
      data: transformedUsers,
      total: foundUsers.total,
      paginator: foundUsers.paginator
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

const setMPIN = async (req, res) => {
  try {
    const userId = req.user.id;
    const { newMPIN, confirmMPIN } = req.body;

    // Validate new MPIN
    if (!newMPIN) {
      return res.failure({ message: 'New MPIN is required' });
    }

    // Validate confirm MPIN
    if (!confirmMPIN) {
      return res.failure({ message: 'Confirm MPIN is required' });
    }

    // Validate MPIN is 4 digits
    const mpinRegex = /^\d{4}$/;
    if (!mpinRegex.test(newMPIN)) {
      return res.failure({ message: 'New MPIN must be exactly 4 digits' });
    }

    if (!mpinRegex.test(confirmMPIN)) {
      return res.failure({ message: 'Confirm MPIN must be exactly 4 digits' });
    }

    // Check if new MPIN and confirm MPIN match
    if (newMPIN !== confirmMPIN) {
      return res.failure({ message: 'New MPIN and Confirm MPIN do not match' });
    }

    // Find user
    const user = await dbService.findOne(model.user, { id: userId });
    if (!user) {
      return res.failure({ message: 'User not found' });
    }

    // Check if user already has an MPIN
    if (user.secureKey) {
      return res.failure({ message: 'MPIN already set. Please use reset MPIN to change it.' });
    }

    // Check if new MPIN is same as old MPIN (if exists)
    if (user.secureKey) {
      const isSameMPIN = await bcrypt.compare(newMPIN, user.secureKey);
      if (isSameMPIN) {
        return res.failure({ message: 'New MPIN cannot be the same as old MPIN' });
      }
    }

    // Hash new MPIN
    const hashedMPIN = await bcrypt.hash(newMPIN, 8);

    // Update user's secureKey
    await dbService.update(
      model.user,
      { id: userId },
      { secureKey: hashedMPIN }
    );

    // Send email notification
    try {
      const backendUrl = process.env.BASE_URL
      const logoUrl = `${backendUrl}/gmaxepay.png`;
      const illustrationUrl = `${backendUrl}/setmpin.png`;


      await emailService.sendMPINSetEmail({
        to: user.email,
        userName: user.name || 'User',
        userEmail: user.email || '',
        userMobile: user.mobileNo || '',
        actionType: 'set',
        logoUrl,
        illustrationUrl
      });
    } catch (emailError) {
      console.error('Error sending MPIN set email:', emailError);
      // Don't fail the request if email fails
    }

    return res.success({
      message: 'MPIN set successfully',
      data: {
        userId: userId,
        mpinSet: true
      }
    });
  } catch (error) {
    console.error('Error setting MPIN:', error);
    return res.internalServerError({ message: error.message });
  }
};

const resetMPIN = async (req, res) => {
  try {
    const currentUser = req.user;
    const { userId, oldMPIN, newMPIN, confirmMPIN } = req.body;

    // Validate permissions - Only Master Distributor (3), Distributor (4), or Company Admin (2) can reset MPIN
    const allowedRoles = [2, 3, 4];
    if (!allowedRoles.includes(currentUser.userRole)) {
      return res.failure({ message: 'You are not authorized to reset MPIN' });
    }

    // If userId is provided, it's admin resetting another user's MPIN
    // Otherwise, user is resetting their own MPIN
    const targetUserId = userId || currentUser.id;

    // Validate old MPIN (required for reset)
    if (!oldMPIN) {
      return res.failure({ message: 'Old MPIN is required' });
    }

    // Validate new MPIN
    if (!newMPIN) {
      return res.failure({ message: 'New MPIN is required' });
    }

    // Validate confirm MPIN
    if (!confirmMPIN) {
      return res.failure({ message: 'Confirm MPIN is required' });
    }

    // Validate MPIN is 4 digits
    const mpinRegex = /^\d{4}$/;
    if (!mpinRegex.test(oldMPIN)) {
      return res.failure({ message: 'Old MPIN must be exactly 4 digits' });
    }

    if (!mpinRegex.test(newMPIN)) {
      return res.failure({ message: 'New MPIN must be exactly 4 digits' });
    }

    if (!mpinRegex.test(confirmMPIN)) {
      return res.failure({ message: 'Confirm MPIN must be exactly 4 digits' });
    }

    // Check if new MPIN and confirm MPIN match
    if (newMPIN !== confirmMPIN) {
      return res.failure({ message: 'New MPIN and Confirm MPIN do not match' });
    }

    // Find the user whose MPIN needs to be reset
    let userToReset;

    if (userId) {
      // Admin resetting another user's MPIN
      userToReset = await dbService.findOne(model.user, {
        id: userId,
        companyId: currentUser.companyId,
        isDeleted: false
      });

      if (!userToReset) {
        return res.failure({ message: 'User not found' });
      }

      // Check if user is in the same company hierarchy
      if (currentUser.userRole === 3) {
        // Master Distributor can reset MPIN for Distributors and Retailers under them
        if (![4, 5].includes(userToReset.userRole)) {
          return res.failure({ message: 'You can only reset MPIN for Distributors and Retailers' });
        }
      } else if (currentUser.userRole === 4) {
        // Distributor can only reset MPIN for Retailers under them
        if (userToReset.userRole !== 5) {
          return res.failure({ message: 'You can only reset MPIN for Retailers' });
        }
        if (userToReset.reportingTo !== currentUser.id) {
          return res.failure({ message: 'You can only reset MPIN for users under you' });
        }
      }
    } else {
      // User resetting their own MPIN
      userToReset = await dbService.findOne(model.user, {
        id: targetUserId,
        isDeleted: false
      });

      if (!userToReset) {
        return res.failure({ message: 'User not found' });
      }
    }

    // Verify old MPIN
    if (!userToReset.secureKey) {
      return res.failure({ message: 'User does not have an MPIN set. Please use set MPIN instead.' });
    }

    const isOldMPINValid = await bcrypt.compare(oldMPIN, userToReset.secureKey);
    if (!isOldMPINValid) {
      return res.failure({ message: 'Invalid old MPIN' });
    }

    // Check if new MPIN is same as old MPIN
    const isSameMPIN = await bcrypt.compare(newMPIN, userToReset.secureKey);
    if (isSameMPIN) {
      return res.failure({ message: 'New MPIN cannot be the same as old MPIN' });
    }

    // Hash new MPIN
    const hashedMPIN = await bcrypt.hash(newMPIN, 8);

    // Update user's secureKey
    await dbService.update(
      model.user,
      { id: targetUserId },
      { secureKey: hashedMPIN }
    );

    // Send email notification
    try {
      const backendUrl = process.env.BASE_URL || process.env.APP_URL || 'http://localhost:3000';
      const logoUrl = `${backendUrl}/gmaxepay.png`;
      const illustrationUrl = `${backendUrl}/setmpin.png`;

      await emailService.sendMPINSetEmail({
        to: userToReset.email,
        userName: userToReset.name || 'User',
        userEmail: userToReset.email || '',
        userMobile: userToReset.mobileNo || '',
        actionType: 'reset',
        logoUrl,
        illustrationUrl
      });
    } catch (emailError) {
      console.error('Error sending MPIN reset email:', emailError);
      // Don't fail the request if email fails
    }

    return res.success({
      message: 'MPIN reset successfully',
      data: {
        userId: targetUserId,
        mpinReset: true
      }
    });
  } catch (error) {
    console.error('Error resetting MPIN:', error);
    return res.internalServerError({ message: error.message });
  }
};

const getUserProfile = async (req, res) => {
  try {
    if (![3, 4, 5].includes(req.user.userRole)) {
      return res.failure({ message: 'You are not authorized to get user details' });
    }
    const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
    if (!existingUser) {
      return res.failure({ message: 'User not found' });
    }

    const companyDetails = existingUser.companyId
      ? await dbService.findOne(model.company, { id: existingUser.companyId })
      : null;

    const companyAdmin = await dbService.findOne(model.user, { companyId: req.user.companyId, userRole: 2 });
    if (!companyAdmin) {
      return res.failure({ message: 'Company admin not found' });
    }

    const [outletDetails, reportingToManager, companyBankDetails] = await Promise.all([
      existingUser.companyId
        ? dbService.findOne(model.outlet, { refId: existingUser.id, companyId: existingUser.companyId })
        : null,
      existingUser.companyId
        ? dbService.findOne(model.user, { id: existingUser?.reportingTo || companyAdmin?.id, companyId: existingUser.companyId })
        : null,
      existingUser.companyId
        ? dbService.findAll(model.customerBank, { refId: existingUser.id, companyId: existingUser.companyId, isActive: true })
        : []
    ]);

    const getCdnImageUrl = (imageData) => {
      if (!imageData) return null;
      const cdnUrl = process.env.AWS_CDN_URL || 'https://assets.gmaxepay.in';
      if (typeof imageData === 'object' && imageData.key) {
        return `${cdnUrl}/${imageData.key}`;
      }
      if (typeof imageData === 'string' && imageData.startsWith('images/')) {
        return `${cdnUrl}/${imageData}`;
      }
      return imageData;
    };

    const response = {
      id: existingUser.id,
      name: existingUser.name,
      email: existingUser.email,
      mobileNo: existingUser.mobileNo,
      slabId: existingUser.slabId,
      aadhaarNumber: existingUser.aadharDetails?.aadhaarNumber,
      pancardNumber: existingUser.panDetails?.pancardNumber,
      aadhaarFrontImage: getCdnImageUrl(existingUser.aadharFrontImage),
      aadhaarBackImage: getCdnImageUrl(existingUser.aadharBackImage),
      pancardFrontImage: getCdnImageUrl(existingUser.panCardFrontImage),
      pancardBackImage: getCdnImageUrl(existingUser.panCardBackImage),
      profileImage: getCdnImageUrl(existingUser.profileImage),
      agentCode: existingUser.userId,
      status: existingUser.isActive ? 'Active' : 'Inactive',
      createdAt: existingUser.createdAt,
      address: existingUser.fullAddress,
      pinCode: existingUser.zipcode,
      state: existingUser.state,
      district: existingUser.district,
      country: existingUser.country,
      city: existingUser.city,
      longitude: existingUser.longitude,
      latitude: existingUser.latitude,
      userRoleName: existingUser?.userRole == 4 ? 'Distributor' : existingUser?.userRole == 5 ? 'Retailer' : existingUser?.userRole == 3 ? 'Master Distributor' : existingUser?.userRole == 2 ? 'Company Admin' : existingUser?.userRole == 1 ? 'Super Admin' : '',
      kycStatus: existingUser.kycStatus,
      reportingToManager: reportingToManager?.name || null,
      reportingToManagerEmail: reportingToManager?.email || null,
      reportingToManagerMobile: reportingToManager?.mobileNo || null,
      reportingToProfile: getCdnImageUrl(reportingToManager?.profileImage),
      reportingToUserRole: reportingToManager?.userRole == 4 ? 'Distributor' : reportingToManager?.userRole == 5 ? 'Retailer' : reportingToManager?.userRole == 3 ? 'Master Distributor' : reportingToManager?.userRole == 2 ? 'Admin' : reportingToManager?.userRole == 1 ? 'GmaxePay Admin' : '',
      companyDetails: companyDetails
        ? {
          companyId: companyDetails.id,
          companyName: companyDetails.companyName,
          compnyPan: companyDetails.companyPan,
          companyDomain: companyDetails.customDomain ? `https://${companyDetails.customDomain}` : null,
          compnyGst: companyDetails.companyGst,
          compnyLogo: getCdnImageUrl(companyDetails.logo)
        }
        : null,
      outletDetails: outletDetails
        ? {
          shopName: outletDetails.shopName,
          shopImage: getCdnImageUrl(outletDetails.shopImage),
          shopAddress: outletDetails.shopAddress,
          googleMapsLink: outletDetails.outletGoogleMapsLink
        }
        : null,
      bankDetails: (companyBankDetails || []).map(bank => ({
        id: bank.id,
        bankName: bank.bankName,
        accountNumber: bank.accountNumber,
        ifsc: bank.ifsc,
        beneficiaryName: bank.beneficiaryName,
        city: bank.city,
        branch: bank.branch,
        isPrimary: bank.isPrimary,
        isPayout: bank.isPayout,
        isFundTransfer: bank.isFundTransfer
      }))
    };

    return res.success({ message: 'User details retrieved successfully', data: response });
  } catch (error) {
    console.error('Error retrieving user details:', error);
    return res.internalServerError({ message: error.message });
  }
};

const findAllTheirDownlineUsers = async (req, res) => {
  try {
    if (![3, 4].includes(req.user.userRole)) {
      return res.failure({ message: 'You are not authorized to access this resource' });
    }

    const companyId = req.user.companyId;
    const currentUserId = req.user.id;
    const currentUserRole = req.user.userRole;

    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    // Determine allowed user roles based on current user's role
    let allowedRoles = [];
    if (currentUserRole === 3) {
      // Master Distributor (3) can see Distributors (4) and Retailers (5)
      allowedRoles = [4, 5];
    } else if (currentUserRole === 4) {
      // Distributor (4) can only see Retailers (5)
      allowedRoles = [5];
    }

    // Get request body for filtering, pagination, and search
    let dataToFind = req.body || {};
    let options = {};
    let query = {
      companyId: companyId,
      reportingTo: currentUserId, // Only users that report directly to the current user
      userRole: { [Op.in]: allowedRoles }
    };

    // Build query from request body
    if (dataToFind.query) {
      // Apply userRole filter if provided (must be within allowed roles)
      if (dataToFind.query.userRole !== undefined) {
        const requestedRole = dataToFind.query.userRole;

        // Access denied for userRole 1 (Admin) and 2 (Whitelabel)
        if (requestedRole === 1 || requestedRole === 2) {
          return res.failure({ message: "Access denied! You cannot filter by this user role." });
        }

        // Ensure requested role is within allowed roles for current user
        if (allowedRoles.includes(requestedRole)) {
          query.userRole = requestedRole;
        } else {
          return res.failure({
            message: `Access denied! You can only view users with roles: ${allowedRoles.join(', ')}`
          });
        }
      }

      // Apply other query filters
      Object.keys(dataToFind.query).forEach(key => {
        if (key !== 'userRole' && key !== 'reportingTo') {
          query[key] = dataToFind.query[key];
        }
      });
    }

    // Handle options (pagination, sorting)
    if (dataToFind.options !== undefined) {
      options = { ...dataToFind.options };
    }

    // Handle customSearch
    if (dataToFind.customSearch) {
      const keys = Object.keys(dataToFind.customSearch);
      const orConditions = [];

      keys.forEach((key) => {
        if (typeof dataToFind.customSearch[key] === 'number') {
          orConditions.push(
            Sequelize.where(Sequelize.cast(Sequelize.col(key), 'varchar'), {
              [Op.iLike]: `%${dataToFind.customSearch[key]}%`
            })
          );
        } else {
          orConditions.push({
            [key]: {
              [Op.iLike]: `%${dataToFind.customSearch[key]}%`
            }
          });
        }
      });

      if (orConditions.length > 0) {
        // Combine customSearch with existing query conditions
        query = {
          companyId: query.companyId,
          reportingTo: query.reportingTo,
          userRole: query.userRole,
          [Op.and]: [
            {
              [Op.or]: orConditions
            }
          ]
        };
      }
    }

    // Use pagination
    let foundUsers = await dbService.paginate(model.user, query, {
      ...options,
      attributes: ['id', 'name', 'userId', 'userRole', 'mobileNo', 'email', 'isActive', 'createdAt']
    });

    if (!foundUsers || !foundUsers.data || foundUsers.data.length === 0) {
      return res.success({
        message: 'Users Retrieved Successfully',
        data: [],
        total: 0,
        paginator: {
          itemCount: 0,
          perPage: options.paginate || 25,
          pageCount: 0,
          currentPage: options.page || 1
        }
      });
    }

    // Transform users data - only return id, name, userId
    const transformedUsers = foundUsers.data.map((user) => {
      const userData = user.toJSON ? user.toJSON() : user;

      return {
        id: userData.id,
        name: userData.name || null,
        userId: userData.userId || null,
        mobileNo: userData.mobileNo || null,
      };
    });

    return res.success({
      message: 'Users Retrieved Successfully',
      data: transformedUsers,
      total: foundUsers.total,
      paginator: foundUsers.paginator
    });
  } catch (error) {
    console.error('Error retrieving users reporting to company admin:', error);
    return res.internalServerError({ message: error.message });
  }
};

const getByUserProfile = async (req, res) => {
  try {
    const { id } = req.params;

    if (![3, 4].includes(req.user.userRole)) {
      return res.failure({ message: 'You are not authorized to get user details' });
    }

    const companyId = req.user.companyId;
    const currentUserId = req.user.id;
    const currentUserRole = req.user.userRole;

    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    let allowedRoles = [];
    if (currentUserRole === 3) {
      allowedRoles = [4, 5];
    } else if (currentUserRole === 4) {
      allowedRoles = [5];
    }

    const targetUser = await dbService.findOne(model.user, {
      id,
      companyId,
      reportingTo: currentUserId,
      userRole: { [Op.in]: allowedRoles },
      isDeleted: false
    });

    if (!targetUser) {
      return res.failure({
        message: 'User not found or not in your downline'
      });
    }

    const companyDetails = targetUser.companyId
      ? await dbService.findOne(model.company, { id: targetUser.companyId })
      : null;

    const companyAdmin = await dbService.findOne(model.user, {
      companyId,
      userRole: 2
    });

    if (!companyAdmin) {
      return res.failure({ message: 'Company admin not found' });
    }

    const [outletDetails, reportingToManager, companyBankDetails] = await Promise.all([
      targetUser.companyId
        ? dbService.findOne(model.outlet, {
          refId: targetUser.id,
          companyId: targetUser.companyId
        })
        : null,
      targetUser.companyId
        ? dbService.findOne(model.user, {
          id: targetUser.reportingTo || companyAdmin.id,
          companyId: targetUser.companyId
        })
        : null,
      targetUser.companyId
        ? dbService.findAll(model.customerBank, {
          refId: targetUser.id,
          companyId: targetUser.companyId
        })
        : []
    ]);

    const getCdnImageUrl = (imageData) => {
      if (!imageData) return null;
      const cdnUrl = process.env.AWS_CDN_URL || 'https://assets.gmaxepay.in';
      if (typeof imageData === 'object' && imageData.key) {
        return `${cdnUrl}/${imageData.key}`;
      }
      if (typeof imageData === 'string' && imageData.startsWith('images/')) {
        return `${cdnUrl}/${imageData}`;
      }
      return imageData;
    };

    const response = {
      id: targetUser.id,
      name: targetUser.name,
      email: targetUser.email,
      mobileNo: targetUser.mobileNo,
      slabId: targetUser.slabId,
      aadhaarNumber: targetUser.aadharDetails?.aadhaarNumber,
      pancardNumber: targetUser.panDetails?.pancardNumber,
      aadhaarFrontImage: getCdnImageUrl(targetUser.aadharFrontImage),
      aadhaarBackImage: getCdnImageUrl(targetUser.aadharBackImage),
      pancardFrontImage: getCdnImageUrl(targetUser.panCardFrontImage),
      pancardBackImage: getCdnImageUrl(targetUser.panCardBackImage),
      profileImage: getCdnImageUrl(targetUser.profileImage),
      agentCode: targetUser.userId,
      status: targetUser.isActive ? 'Active' : 'Inactive',
      createdAt: targetUser.createdAt,
      address: targetUser.fullAddress,
      pinCode: targetUser.zipcode,
      state: targetUser.state,
      district: targetUser.district,
      country: targetUser.country,
      city: targetUser.city,
      longitude: targetUser.longitude,
      latitude: targetUser.latitude,
      kycStatus: targetUser.kycStatus,
      reportingToManager: reportingToManager?.name || null,
      reportingToManagerEmail: reportingToManager?.email || null,
      reportingToManagerMobile: reportingToManager?.mobileNo || null,
      companyDetails: companyDetails
        ? {
          companyId: companyDetails.id,
          companyName: companyDetails.companyName,
          compnyPan: companyDetails.companyPan,
          companyDomain: companyDetails.customDomain
            ? `https://${companyDetails.customDomain}`
            : null,
          compnyGst: companyDetails.companyGst,
          compnyLogo: getCdnImageUrl(companyDetails.logo)
        }
        : null,
      outletDetails: outletDetails
        ? {
          shopName: outletDetails.shopName,
          shopImage: getCdnImageUrl(outletDetails.shopImage),
          shopAddress: outletDetails.shopAddress,
          googleMapsLink: outletDetails.outletGoogleMapsLink
        }
        : null,
      bankDetails: (companyBankDetails || []).map((bank) => ({
        id: bank.id,
        bankName: bank.bankName,
        accountNumber: bank.accountNumber,
        ifsc: bank.ifsc,
        city: bank.city,
        branch: bank.branch
      }))
    };

    return res.success({
      message: 'User details retrieved successfully',
      data: response
    });
  } catch (error) {
    console.error('Error retrieving user details:', error);
    return res.internalServerError({ message: error.message });
  }
};

const extractS3Key = (imageData) => {
  if (!imageData) return null;
  if (typeof imageData === 'string') {
    try {
      const parsed = JSON.parse(imageData);
      return parsed.key || parsed;
    } catch {
      return imageData;
    }
  } else if (typeof imageData === 'object') {
    return imageData.key || imageData;
  }
  return null;
};

const calculateKycStatus = (user, outlet, customerBank, aadhaarDoc, panDoc) => {
  const steps = [];

  // Mobile verification
  steps.push({ key: 'mobileVerification', done: !!user.mobileVerify });

  // Email verification
  steps.push({ key: 'emailVerification', done: !!user.emailVerify });

  // Aadhaar verification
  const aadhaarDone = !!user.aadharVerify || (aadhaarDoc && aadhaarDoc.verificationId && aadhaarDoc.name);
  steps.push({ key: 'aadharVerification', done: aadhaarDone });

  // PAN verification
  const panDone = !!user.panVerify || (panDoc && panDoc.verificationId && panDoc.panNumber);
  steps.push({ key: 'panVerification', done: panDone });

  // Shop details
  steps.push({ key: 'shopDetails', done: !!user.shopDetailsVerify });

  // Bank verification
  const bankDone = !!user.bankDetailsVerify || !!(customerBank && customerBank.accountNumber && customerBank.ifsc);
  steps.push({ key: 'bankVerification', done: bankDone });

  // Profile
  steps.push({ key: 'profile', done: !!user.profileImageWithShopVerify });

  const completedSteps = steps.filter(s => s.done).length;
  const totalSteps = 7;

  let kycStatus = 'NO_KYC';
  let kycSteps = completedSteps;

  if (completedSteps >= 4 && completedSteps < totalSteps) {
    kycStatus = 'HALF_KYC';
  } else if (completedSteps === totalSteps) {
    kycStatus = 'FULL_KYC';
  }

  return { kycStatus, kycSteps, completedSteps, totalSteps };
};

const getCompleteKycData = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    if (![3, 4].includes(req.user.userRole)) {
      return res.failure({ message: "You are not authorized to get complete KYC data" });
    }

    const { id } = req.params;
    const companyId = req.user.companyId;
    const currentUserId = req.user.id;
    const currentUserRole = req.user.userRole;

    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    let allowedRoles = [];
    if (currentUserRole === 3) {
      allowedRoles = [4, 5];
    } else if (currentUserRole === 4) {
      allowedRoles = [5];
    }

    // Find user
    let foundUser = await dbService.findOne(model.user, {
      id,
      companyId,
      reportingTo: currentUserId,
      userRole: { [Op.in]: allowedRoles },
      isDeleted: false
    });

    if (!foundUser) {
      return res.failure({ message: 'User not found or not in your downline' });
    }

    // Get image URLs helper
    const getImageUrl = (imageData) => {
      if (!imageData) return null;
      const plainKey = extractS3Key(imageData);
      if (!plainKey) return null;
      return imageService.getImageUrl(plainKey, false);
    };

    // Get outlet
    const outlet = await dbService.findOne(model.outlet, {
      refId: id,
      companyId: companyId
    });

    // Get customer and customerBank
    const customer = await dbService.findOne(model.customer, {
      mobile: foundUser.mobileNo
    });

    let customerBank = null;
    if (customer) {
      customerBank = await dbService.findOne(model.customerBank, {
        refId: customer.id,
        companyId: companyId
      });
    }
    if (!customerBank) {
      customerBank = await dbService.findOne(model.customerBank, {
        refId: id,
        companyId: companyId
      });
    }

    // Get Aadhaar and PAN documents
    const [aadhaarDoc, panDoc] = await Promise.all([
      dbService.findOne(model.digilockerDocument, {
        refId: id,
        companyId: companyId,
        documentType: 'AADHAAR',
        isDeleted: false
      }),
      dbService.findOne(model.digilockerDocument, {
        refId: id,
        companyId: companyId,
        documentType: 'PAN',
        isDeleted: false
      })
    ]);

    // Calculate KYC status
    const kycInfo = calculateKycStatus(foundUser, outlet, customerBank, aadhaarDoc, panDoc);

    // Get shop image URL
    const getShopImageUrl = (shopImage) => {
      if (!shopImage) return null;
      const plainKey = extractS3Key(shopImage);
      if (!plainKey) return null;
      return imageService.getImageUrl(plainKey, false);
    };

    const shopCategory = await dbService.findOne(model.practomindCompanyCode, {
      id: outlet?.shopCategoryId || 1,
      isDeleted: false
    });

    const kycData = {
      userId: foundUser.id,
      userDetails: {
        userId: foundUser.userId,
        name: foundUser.name,
        mobileNo: foundUser.mobileNo,
        email: foundUser.email,
        mobileVerify: !!foundUser.mobileVerify,
        emailVerify: !!foundUser.emailVerify,
        aadharVerify: !!foundUser.aadharVerify,
        panVerify: !!foundUser.panVerify,
        shopDetailsVerify: !!foundUser.shopDetailsVerify,
        bankDetailsVerify: !!foundUser.bankDetailsVerify,
        imageVerify: !!foundUser.imageVerify,
        profileImageWithShopVerify: !!foundUser.profileImageWithShopVerify,
        profileImage: getImageUrl(foundUser.profileImage),
        aadharFrontImage: getImageUrl(foundUser.aadharFrontImage),
        aadharBackImage: getImageUrl(foundUser.aadharBackImage),
        panCardFrontImage: getImageUrl(foundUser.panCardFrontImage),
        panCardBackImage: getImageUrl(foundUser.panCardBackImage)
      },
      outletDetails: outlet ? {
        outletId: outlet.id,
        shopName: outlet.shopName,
        shopAddress: outlet.shopAddress,
        gstNo: outlet.gstNo,
        mobileNo: outlet.mobileNo,
        zipCode: outlet.zipCode,
        shopImage: getShopImageUrl(outlet.shopImage),
        shopCategory: shopCategory ? shopCategory.description : null
      } : null,
      customerBankDetails: customerBank ? {
        customerBankId: customerBank.id,
        accountNumber: customerBank.accountNumber,
        ifsc: customerBank.ifsc,
        bankName: customerBank.bankName,
        beneficiaryName: customerBank.beneficiaryName,
        branch: customerBank.branch || null
      } : null,
      aadhaarDoc: aadhaarDoc ? {
        id: aadhaarDoc.id,
        verificationId: aadhaarDoc.verificationId,
        referenceId: aadhaarDoc.referenceId,
        status: aadhaarDoc.status,
        name: aadhaarDoc.name,
        uid: aadhaarDoc.uid,
        dob: aadhaarDoc.dob
      } : null,
      panDoc: panDoc ? {
        id: panDoc.id,
        verificationId: panDoc.verificationId,
        referenceId: panDoc.referenceId,
        status: panDoc.status,
        panNumber: panDoc.panNumber,
        panName: panDoc.panName,
        panDob: panDoc.panDob
      } : null,
      kycStatus: kycInfo.kycStatus,
      kycSteps: kycInfo.kycSteps,
      completedSteps: kycInfo.completedSteps,
      totalSteps: kycInfo.totalSteps
    };

    return res.success({
      message: 'Complete KYC Data Retrieved Successfully',
      data: kycData
    });
  } catch (error) {
    console.error('Error getting complete KYC data:', error);
    return res.internalServerError({ message: error.message });
  }
};

const revertKycData = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    if (![3, 4].includes(req.user.userRole)) {
      return res.failure({ message: "You don't have permission to revert KYC data" });
    }

    const { id } = req.params;
    const companyId = req.user.companyId;
    const currentUserId = req.user.id;
    const currentUserRole = req.user.userRole;

    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    let allowedRoles = [];
    if (currentUserRole === 3) {
      allowedRoles = [4, 5];
    } else if (currentUserRole === 4) {
      allowedRoles = [5];
    }

    const { pan, aadhar, shopImage, bankVerification } = req.body || {};

    // Find user
    let foundUser = await dbService.findOne(model.user, {
      id,
      companyId,
      reportingTo: currentUserId,
      userRole: { [Op.in]: allowedRoles },
      isDeleted: false
    });

    if (!foundUser) {
      return res.failure({ message: 'User not found or not in your downline' });
    }

    const revertOperations = [];
    const updateData = {};
    const revertMessages = [];
    const revertedItems = {
      pan: false,
      aadhar: false,
      shopImage: false,
      bankVerification: false
    };

    const isTrue = (value) => {
      return value === true || value === 'true';
    };

    if (!isTrue(pan) && !isTrue(aadhar) && !isTrue(shopImage) && !isTrue(bankVerification)) {
      return res.failure({
        message: 'No KYC data specified to revert. Please provide at least one of: pan, aadhar, shopImage, bankVerification with value true'
      });
    }

    // Revert PAN verification
    if (isTrue(pan)) {
      revertedItems.pan = true;
      const panFrontKey = extractS3Key(foundUser.panCardFrontImage);
      const panBackKey = extractS3Key(foundUser.panCardBackImage);

      if (panFrontKey) {
        revertOperations.push(
          imageService.deleteImageFromS3(panFrontKey).catch(err =>
            console.error('Error deleting PAN front image:', err)
          )
        );
      }
      if (panBackKey) {
        revertOperations.push(
          imageService.deleteImageFromS3(panBackKey).catch(err =>
            console.error('Error deleting PAN back image:', err)
          )
        );
      }

      updateData.panVerify = false;
      updateData.panCardFrontImage = null;
      updateData.panCardBackImage = null;
      updateData.panDetails = null;

      const panDoc = await dbService.findOne(model.digilockerDocument, {
        refId: id,
        companyId: companyId,
        documentType: 'PAN',
        isDeleted: false
      });

      if (panDoc) {
        await dbService.destroy(model.digilockerDocument, {
          id: panDoc.id,
          companyId: companyId
        });
      }

      revertMessages.push('PAN verification has been reverted');
    }

    // Revert Aadhaar verification
    if (isTrue(aadhar)) {
      revertedItems.aadhar = true;
      const aadharFrontKey = extractS3Key(foundUser.aadharFrontImage);
      const aadharBackKey = extractS3Key(foundUser.aadharBackImage);

      if (aadharFrontKey) {
        revertOperations.push(
          imageService.deleteImageFromS3(aadharFrontKey).catch(err =>
            console.error('Error deleting Aadhaar front image:', err)
          )
        );
      }
      if (aadharBackKey) {
        revertOperations.push(
          imageService.deleteImageFromS3(aadharBackKey).catch(err =>
            console.error('Error deleting Aadhaar back image:', err)
          )
        );
      }

      updateData.aadharVerify = false;
      updateData.aadharFrontImage = null;
      updateData.aadharBackImage = null;
      updateData.aadharDetails = null;

      const aadhaarDoc = await dbService.findOne(model.digilockerDocument, {
        refId: id,
        companyId: companyId,
        documentType: 'AADHAAR',
        isDeleted: false
      });

      if (aadhaarDoc) {
        await dbService.destroy(model.digilockerDocument, {
          id: aadhaarDoc.id,
          companyId: companyId
        });
      }

      revertMessages.push('Aadhaar verification has been reverted');
    }

    // Revert shop image
    if (isTrue(shopImage)) {
      revertedItems.shopImage = true;
      const outlet = await dbService.findOne(model.outlet, {
        refId: id,
        companyId: companyId
      });

      if (outlet && outlet.shopImage) {
        const shopImageKey = extractS3Key(outlet.shopImage);

        if (shopImageKey) {
          revertOperations.push(
            imageService.deleteImageFromS3(shopImageKey).catch(err =>
              console.error('Error deleting shop image:', err)
            )
          );
        }

        await dbService.update(
          model.outlet,
          { id: outlet.id },
          { shopImage: null, shopImageVerify: false }
        );
      }

      updateData.shopDetailsVerify = false;
      revertMessages.push('Shop image has been reverted');
    }

    // Revert bank verification
    if (isTrue(bankVerification)) {
      revertedItems.bankVerification = true;
      const customer = await dbService.findOne(model.customer, {
        mobile: foundUser.mobileNo
      });

      let customerBank = null;
      if (customer) {
        customerBank = await dbService.findOne(model.customerBank, {
          refId: customer.id,
          companyId: companyId
        });
      }
      if (!customerBank) {
        customerBank = await dbService.findOne(model.customerBank, {
          refId: id,
          companyId: companyId
        });
      }

      if (customerBank) {
        await dbService.destroy(model.customerBank, {
          id: customerBank.id,
          companyId: companyId
        });
      }

      updateData.bankDetailsVerify = false;
      updateData.nameSimilarity = null;

      revertMessages.push('Bank verification has been reverted');
    }

    await Promise.all(revertOperations);

    if (Object.keys(updateData).length > 0) {
      updateData.updatedBy = req.user.id;

      await dbService.update(
        model.user,
        { id, companyId },
        updateData
      );

      const outlet = await dbService.findOne(model.outlet, {
        refId: id,
        companyId: companyId
      });

      const customer = await dbService.findOne(model.customer, {
        mobile: foundUser.mobileNo
      });

      let customerBank = null;
      if (customer) {
        customerBank = await dbService.findOne(model.customerBank, {
          refId: customer.id,
          companyId: companyId
        });
      }
      if (!customerBank) {
        customerBank = await dbService.findOne(model.customerBank, {
          refId: id,
          companyId: companyId
        });
      }

      const [aadhaarDoc, panDoc] = await Promise.all([
        dbService.findOne(model.digilockerDocument, {
          refId: id,
          companyId: companyId,
          documentType: 'AADHAAR',
          isDeleted: false
        }),
        dbService.findOne(model.digilockerDocument, {
          refId: id,
          companyId: companyId,
          documentType: 'PAN',
          isDeleted: false
        })
      ]);

      const updatedUser = await dbService.findOne(model.user, {
        id,
        companyId
      });

      const kycInfo = calculateKycStatus(updatedUser, outlet, customerBank, aadhaarDoc, panDoc);

      await dbService.update(
        model.user,
        { id, companyId },
        {
          kycStatus: kycInfo.kycStatus,
          kycSteps: kycInfo.kycSteps
        }
      );

      const company = await dbService.findOne(model.company, {
        id: companyId,
        isDeleted: false
      });

      const userForEmail = await dbService.findOne(model.user, {
        id,
        companyId
      });

      if (userForEmail && userForEmail.email) {
        const backendUrl = process.env.BASE_URL || 'https://api-dev.gmaxepay.in';
        const logoUrl = company?.logo ? imageService.getImageUrl(company.logo) : `${backendUrl}/gmaxepay.png`;

        try {
          if (isTrue(pan)) {
            const resetPanIllustrationUrl = `${backendUrl}/resetPan.png`;
            await emailService.sendNotificationEmail({
              to: userForEmail.email,
              userName: userForEmail.name || 'User',
              subject: 'PAN Verification Reverted - Gmaxepay',
              successMessage: 'Your PAN verification has been reverted',
              message: 'Please connect your PAN to digilocker, upload and download your PAN document to complete the verification process.',
              logoUrl: logoUrl,
              illustrationUrl: resetPanIllustrationUrl
            });
          }

          if (isTrue(aadhar)) {
            const resetAadhaarIllustrationUrl = `${backendUrl}/resetAadhaar.png`;
            await emailService.sendNotificationEmail({
              to: userForEmail.email,
              userName: userForEmail.name || 'User',
              subject: 'Aadhaar Verification Reverted - Gmaxepay',
              successMessage: 'Your Aadhaar verification has been reverted',
              message: 'Please connect your Aadhaar to digilocker, upload and download your Aadhaar document to complete the verification process.',
              logoUrl: logoUrl,
              illustrationUrl: resetAadhaarIllustrationUrl
            });
          }

          if (isTrue(shopImage)) {
            const resetShopImageIllustrationUrl = `${backendUrl}/resetShopImage.png`;
            await emailService.sendNotificationEmail({
              to: userForEmail.email,
              userName: userForEmail.name || 'User',
              subject: 'Shop Image Reverted - Gmaxepay',
              successMessage: 'Your shop image has been reverted',
              message: 'Please upload your shop image again to complete the shop details verification process.',
              logoUrl: logoUrl,
              illustrationUrl: resetShopImageIllustrationUrl
            });
          }

          if (isTrue(bankVerification)) {
            const resetBankIllustrationUrl = `${backendUrl}/resetBank.png`;
            await emailService.sendNotificationEmail({
              to: userForEmail.email,
              userName: userForEmail.name || 'User',
              subject: 'Bank Verification Reverted - Gmaxepay',
              successMessage: 'Your bank verification has been reverted',
              message: 'Please provide your bank account details again to complete the bank verification process.',
              logoUrl: logoUrl,
              illustrationUrl: resetBankIllustrationUrl
            });
          }
        } catch (emailError) {
          console.error('Error sending KYC revert email:', emailError);
        }
      }
    }

    let successMessage = 'KYC data reverted successfully';
    if (revertMessages.length > 0) {
      successMessage = revertMessages.join('. ');
    }

    return res.success({
      message: successMessage,
      data: null
    });
  } catch (error) {
    console.error('Error reverting KYC data:', error);
    return res.internalServerError({ message: error.message });
  }
};

const sendOldChangeMobileNoOtp = async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const id = req.user.id;
    const user = await dbService.findOne(model.user, { id, companyId, isDeleted: false });
    if (!user) {
      return res.failure({ message: 'User not found' });
    }

    const code = random.randomNumber(6);
    const hashedCode = await bcrypt.hash(code, 10);
    const expireOTP = moment().add(3, 'minutes').toISOString();

    await dbService.update(
      model.user,
      { id: user.id },
      { otpMobile: hashedCode + '~' + expireOTP }
    );

    let msg = `Dear user, your OTP for changing your mobile number is ${code}. Team Gmaxepay`;
    await amezesmsApi.sendSmsOtp(user.mobileNo, msg);

    return res.success({ message: 'OTP sent to your current mobile number' });
  } catch (error) {
    console.error('Error in sendOldChangeMobileNoOtp:', error);
    return res.failure({ message: error.message });
  }
};

const verifyOldChangeMobileNoOtp = async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const id = req.user.id;
    const { otp } = req.body;

    if (!otp) {
      return res.failure({ message: 'OTP is required' });
    }

    const user = await dbService.findOne(model.user, { id, companyId, isDeleted: false });
    if (!user) {
      return res.failure({ message: 'User not found' });
    }

    if (!user.otpMobile) {
      return res.failure({ message: 'OTP is not set. Please request a new OTP.' });
    }

    const [storedHash, expireOTP] = user.otpMobile.split('~');
    const currentTime = moment().toISOString();

    if (moment(currentTime).isAfter(expireOTP)) {
      return res.failure({ message: 'OTP has expired. Please request a new OTP.' });
    }

    const isOtpValid = await bcrypt.compare(otp, storedHash);
    if (!isOtpValid) {
      return res.failure({ message: 'Invalid OTP' });
    }

    // Generate a temporary token valid for 10 minutes to allow setting a new number
    const token = jwt.sign(
      { id: user.id, companyId: user.companyId, action: 'change_mobile_new' },
      JWT.SECRET,
      { expiresIn: '10m', algorithm: JWT.ALGORITHM || 'HS256' }
    );

    await dbService.update(model.user, { id: user.id }, { otpMobile: null });

    return res.success({
      message: 'OTP verified successfully. Please proceed to enter new mobile number.',
      data: { changeMobileToken: token }
    });
  } catch (error) {
    console.error('Error in verifyOldChangeMobileNoOtp:', error);
    return res.failure({ message: error.message });
  }
};

const sendNewChangeMobileNoOtp = async (req, res) => {
  try {
    const { newMobileNo, changeMobileToken } = req.body;

    if (!newMobileNo) {
      return res.failure({ message: 'New mobile number is required' });
    }
    if (!changeMobileToken) {
      return res.failure({ message: 'Change mobile token is required' });
    }
    try {
      const decoded = jwt.verify(changeMobileToken, JWT.SECRET);
      if (decoded.id !== req.user.id || decoded.action !== 'change_mobile_new') {
        return res.failure({ message: 'Invalid token' });
      }
    } catch (err) {
      return res.failure({ message: 'Token is invalid or has expired. Please restart the process.' });
    }

    const companyId = req.user.companyId;
    const id = req.user.id;

    // Check if new mobile number is already in use
    const existingUserWithMobile = await dbService.findOne(model.user, {
      mobileNo: newMobileNo,
      companyId,
      isDeleted: false
    });

    if (existingUserWithMobile) {
      return res.failure({ message: 'Mobile number is already registered' });
    }

    const user = await dbService.findOne(model.user, { id, companyId, isDeleted: false });
    if (!user) {
      return res.failure({ message: 'User not found' });
    }

    const code = random.randomNumber(6);
    const hashedCode = await bcrypt.hash(code, 10);
    const expireOTP = moment().add(3, 'minutes').toISOString();

    await dbService.update(
      model.user,
      { id: user.id },
      { otpMobile: hashedCode + '~' + expireOTP + '~' + newMobileNo }
    );

    let msg = `Dear user, your OTP for setting your new mobile number is ${code}. Team Gmaxepay`;
    await amezesmsApi.sendSmsOtp(newMobileNo, msg);

    return res.success({ message: 'OTP sent to your new mobile number' });
  } catch (error) {
    console.error('Error in sendNewChangeMobileNoOtp:', error);
    return res.failure({ message: error.message });
  }
};

const verifyNewChangeMobileNoOtp = async (req, res) => {
  try {
    const { otp, changeMobileToken } = req.body;
    const companyId = req.user.companyId;
    const id = req.user.id;

    if (!otp) {
      return res.failure({ message: 'OTP is required' });
    }
    if (!changeMobileToken) {
      return res.failure({ message: 'Change mobile token is required' });
    }

    try {
      const decoded = jwt.verify(changeMobileToken, JWT.SECRET);
      if (decoded.id !== id || decoded.action !== 'change_mobile_new') {
        return res.failure({ message: 'Invalid token' });
      }
    } catch (err) {
      return res.failure({ message: 'Token is invalid or has expired. Please restart the process.' });
    }

    const user = await dbService.findOne(model.user, { id, companyId, isDeleted: false });
    if (!user) {
      return res.failure({ message: 'User not found' });
    }

    if (!user.otpMobile) {
      return res.failure({ message: 'OTP is not set. Please request a new OTP.' });
    }

    const parts = user.otpMobile.split('~');
    if (parts.length < 3) {
      return res.failure({ message: 'Invalid OTP state. Please request a new OTP for the new mobile number.' });
    }

    const [storedHash, expireOTP, newMobileNo] = parts;
    const currentTime = moment().toISOString();

    if (moment(currentTime).isAfter(expireOTP)) {
      return res.failure({ message: 'OTP has expired. Please request a new OTP.' });
    }

    const isOtpValid = await bcrypt.compare(otp, storedHash);
    if (!isOtpValid) {
      return res.failure({ message: 'Invalid OTP' });
    }

    await dbService.update(
      model.user,
      { id: user.id },
      {
        mobileNo: newMobileNo,
        otpMobile: null
      }
    );

    return res.success({ message: 'Mobile number updated successfully' });
  } catch (error) {
    console.error('Error in verifyNewChangeMobileNoOtp:', error);
    return res.failure({ message: error.message });
  }
};


module.exports = {
  getProfile,
  upgradeUserRole,
  degradeUserRole,
  findAllUsers,
  setMPIN,
  resetMPIN,
  getUserProfile,
  findAllTheirDownlineUsers,
  getByUserProfile,
  getCompleteKycData,
  revertKycData,
  sendOldChangeMobileNoOtp,
  verifyOldChangeMobileNoOtp,
  sendNewChangeMobileNoOtp,
  verifyNewChangeMobileNoOtp
};