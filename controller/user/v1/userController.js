const dbService = require('../../../utils/dbService');
const model = require('../../../models/index');
const { generateUniqueReferCode } = require('../../../utils/generateUniqueReferCode');
const { decrypt: decryptReferCode } = require('../../../utils/encryption');
const { Op, Sequelize } = require('sequelize');

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

// Helper function to get role prefix
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

// Helper function to generate new userId when role changes
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

// Master Distributor upgrade user role
// Master Distributor (userRole 3) can upgrade:
// - Retailer (5) to Distributor (4)
// Only if reportingTo is null
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

// Master Distributor degrade user role
// Master Distributor (userRole 3) can degrade:
// - Distributor (4) to Retailer (5)
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
    
    // Only Master Distributor (3) and Distributor (4) can access
    if (userRole !== 3 && userRole !== 4) {
      return res.failure({ message: "Only Master Distributor and Distributor can access this endpoint!" });
    }

    // CompanyId cannot be null
    if (!userCompanyId || userCompanyId === null || userCompanyId === undefined) {
      return res.failure({ message: "Company ID is required!" });
    }

    // Get request body for filtering, pagination, and search
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

      // Apply kycStatus filter
      if (dataToFind.query.kycStatus) {
        const kycStatusValue = dataToFind.query.kycStatus;
        
        // Map "pending" to HALF_KYC and NO_KYC
        if (kycStatusValue === 'pending') {
          query.kycStatus = { [Op.in]: ['HALF_KYC', 'NO_KYC'] };
        }
        // Map "completed" to FULL_KYC
        else if (kycStatusValue === 'completed') {
          query.kycStatus = 'FULL_KYC';
        }
        // Handle string with || separator (e.g., "HALF_KYC || NO_KYC")
        else if (typeof kycStatusValue === 'string' && kycStatusValue.includes('||')) {
          const statuses = kycStatusValue.split('||').map(s => s.trim()).filter(s => s);
          if (statuses.length > 0) {
            query.kycStatus = { [Op.in]: statuses };
          }
        }
        // If it's already an array, use it directly
        else if (Array.isArray(kycStatusValue)) {
          query.kycStatus = { [Op.in]: kycStatusValue };
        }
        // Otherwise, use the value as is (e.g., "FULL_KYC", "HALF_KYC", "NO_KYC", "REJECTED")
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
        attributes: ['id', 'mainWallet', 'apesWallet'],
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
          apesWallet: walletData.apesWallet || 0
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

module.exports = {
  getProfile,
  upgradeUserRole,
  degradeUserRole,
  findAllUsers
};