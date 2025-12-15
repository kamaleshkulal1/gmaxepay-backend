const dbService = require('../../../utils/dbService');
const model = require('../../../models/index');
const { generateUniqueReferCode } = require('../../../utils/generateUniqueReferCode');
const { decrypt: decryptReferCode } = require('../../../utils/encryption');
const { Op } = require('sequelize');

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
// Pattern: {COMPANY_PREFIX}{ROLE_PREFIX}{NUMBER}
// Example: GMAXERE01 -> GMAXEMD01 (Retailer to Master Distributor)
const generateNewUserId = async (currentUserId, newRole, companyId) => {
  if (!currentUserId) {
    return null;
  }

  const newRolePrefix = getRolePrefix(newRole);
  if (!newRolePrefix) {
    return null;
  }

  // Extract company prefix and number from current userId
  // Pattern: {COMPANY_PREFIX}{OLD_ROLE_PREFIX}{NUMBER}
  // We need to find where the role prefix ends and number starts
  
  // Try to match pattern: extract number from end (last 2+ digits)
  const numberMatch = currentUserId.match(/(\d+)$/);
  if (!numberMatch) {
    return null;
  }

  const numberPart = numberMatch[1];
  const numberLength = numberPart.length;
  
  // Remove the number and old role prefix to get company prefix
  // Old role prefixes are 2 characters (AD, WU, MD, DI, RE, EP)
  const prefixWithoutNumber = currentUserId.slice(0, -numberLength);
  const oldRolePrefix = prefixWithoutNumber.slice(-2);
  const companyPrefix = prefixWithoutNumber.slice(0, -2);

  // Build new userId: {COMPANY_PREFIX}{NEW_ROLE_PREFIX}{NUMBER}
  const newUserId = `${companyPrefix}${newRolePrefix}${numberPart}`;

  // Check if this userId already exists
  const existingUser = await dbService.findOne(model.user, {
    userId: newUserId,
    companyId: companyId,
    isDeleted: false
  });

  if (existingUser) {
    // If userId exists, find next available number
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

    // Extract all existing numbers for this pattern
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

    // Find next available number starting from the original number
    let newIdNumber = parseInt(numberPart, 10);
    while (existingNumbers.has(newIdNumber)) {
      newIdNumber++;
    }

    const formattedNumber = newIdNumber.toString().padStart(numberLength, '0');
    return `${companyPrefix}${newRolePrefix}${formattedNumber}`;
  }

  return newUserId;
};

// Upgrade user role (for Company Admin / Whitelabel Admin)
// Company Admin (userRole 2) can upgrade:
// - Retailer (5) to Master Distributor (3) or Distributor (4)
// - Distributor (4) to Master Distributor (3)
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
    
    // Only Company Admin (userRole 2) can use this endpoint
    const currentUserRole = currentUser.userRole;
    if (currentUserRole !== 2) {
      return res.failure({ message: 'Not authorized to upgrade users' });
    }
    
    // Company Admin can upgrade to Master Distributor (3) or Distributor (4)
    const targetRoleInt = parseInt(targetRole);
    const validRoles = [3, 4];
    if (!validRoles.includes(targetRoleInt)) {
      return res.failure({ message: 'Invalid target role' });
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
    
    // Validate upgrade permissions based on current user role
    const currentRole = userToUpgrade.userRole;
    
    // Check if user is already at target role or higher (cannot upgrade further)
    if (currentRole <= targetRoleInt) {
      if (currentRole === targetRoleInt) {
        return res.failure({ message: 'User already has this role' });
      } else {
        return res.failure({ message: 'User role is already higher than target role' });
      }
    }
    
    // Company Admin can upgrade:
    // - Retailer (5) to Master Distributor (3) or Distributor (4)
    // - Distributor (4) to Master Distributor (3)
    if (currentRole === 5 && (targetRoleInt === 3 || targetRoleInt === 4)) {
      // Retailer → Master Distributor or Distributor - allowed
    } else if (currentRole === 4 && targetRoleInt === 3) {
      // Distributor → Master Distributor - allowed
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
    
    // If upgrading to Master Distributor or Distributor, ensure referral code is generated
    let referCode = null;
    if ((targetRoleInt === 3 || targetRoleInt === 4)) {
      // Get company for referral code generation
      const company = await dbService.findOne(model.company, { id: currentUser.companyId, isDeleted: false });
      const companyName = company?.companyName || 'USER';
      
      // Check if user already has a referral code
      if (updatedUser.referCode) {
        try {
          referCode = decryptReferCode(updatedUser.referCode);
        } catch (e) {
          // If decryption fails, generate new one
          referCode = await generateUniqueReferCode(companyName);
          await dbService.update(model.user, { id: userId }, { referCode: referCode });
        }
      } else {
        // Generate new referral code
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

 // Degrade user role (for Company Admin / Whitelabel Admin)
// Company Admin (userRole 2) can degrade:
// - Master Distributor (3) to Distributor (4) or Retailer (5)
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
    
    // Only Company Admin (userRole 2) can use this endpoint
    const currentUserRole = currentUser.userRole;
    if (currentUserRole !== 2) {
      return res.failure({ message: 'Not authorized to degrade users' });
    }
    
    // Company Admin can degrade to Distributor (4) or Retailer (5)
    const targetRoleInt = parseInt(targetRole);
    const validRoles = [4, 5];
    if (!validRoles.includes(targetRoleInt)) {
      return res.failure({ message: 'Invalid target role' });
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
    
    // Check if it's actually a degradation (target role should be higher number)
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
    
    // Company Admin can degrade:
    // - Master Distributor (3) to Distributor (4) or Retailer (5)
    // - Distributor (4) to Retailer (5)
    if (currentRole === 3) {
      // Can degrade Master Distributor to either Distributor or Retailer
      if (targetRoleInt !== 4 && targetRoleInt !== 5) {
        return res.failure({ message: 'Invalid degrade path' });
      }
    } else if (currentRole === 4) {
      // Can degrade Distributor to Retailer
      if (targetRoleInt !== 5) {
        return res.failure({ message: 'Invalid degrade path' });
      }
    } else {
      return res.failure({ message: 'Cannot degrade this user role' });
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
    
    // Note: If degraded to Retailer (5), referCode remains but won't be used for new referrals
    // since only roles 2, 3, and 4 can have referCode
    
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
  upgradeUserRole,
  degradeUserRole
};

