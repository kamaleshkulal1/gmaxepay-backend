const dbService = require('../../../utils/dbService');
const model = require('../../../models/index');
const { generateUniqueReferCode } = require('../../../utils/generateUniqueReferCode');
const { decrypt: decryptReferCode } = require('../../../utils/encryption');
const { Op, Sequelize } = require('sequelize');
const bcrypt = require('bcrypt');
const emailService = require('../../../services/emailService');

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
      reportingToUserRole: reportingToManager?.userRole == 4 ? 'Distributor' : reportingToManager?.userRole == 5 ? 'Retailer' : reportingToManager?.userRole == 3 ? 'Master Distributor' : reportingToManager?.userRole == 2 ? 'Company Admin' : reportingToManager?.userRole == 1 ? 'Super Admin' : '',
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

module.exports = {
  getProfile,
  upgradeUserRole,
  degradeUserRole,
  findAllUsers,
  setMPIN,
  resetMPIN,
  getUserProfile,
  findAllTheirDownlineUsers,
  getByUserProfile
};