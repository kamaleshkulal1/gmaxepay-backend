const dbService = require('../../../utils/dbService');
const model = require('../../../models/index');
const { generateUniqueReferCode } = require('../../../utils/generateUniqueReferCode');
const { decrypt: decryptReferCode } = require('../../../utils/encryption');
const { Op } = require('sequelize');

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
    
    // Check if reportingTo is null - only users with null reportingTo can be upgraded
    if (userToUpgrade.reportingTo !== null) {
      return res.failure({ message: 'User has reportingTo assigned. Cannot upgrade.' });
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

module.exports = {
  getProfile,
  upgradeUserRole,
  degradeUserRole
};