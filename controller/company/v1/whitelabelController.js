const dbService = require('../../../utils/dbService');
const model = require('../../../models/index');
const { generateUniqueReferCode } = require('../../../utils/generateUniqueReferCode');
const { decrypt: decryptReferCode } = require('../../../utils/encryption');

// Upgrade user role (for Company Admin / Whitelabel Admin / Master Distributor)
// Company Admin (userRole 2) can upgrade users from Retailer (5) to Master Distributor (3) or Distributor (4)
// Company Admin can also upgrade from Distributor (4) to Master Distributor (3)
// Master Distributor (userRole 3) can upgrade only: Retailer (5) to Distributor (4)
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
    
    // Company Admin (userRole 2) and Master Distributor (userRole 3) can upgrade users
    const currentUserRole = currentUser.userRole;
    if (currentUserRole !== 2 && currentUserRole !== 3) {
      return res.failure({ message: 'Only Company Admin or Master Distributor can upgrade users' });
    }
    
    // Validate targetRole based on who is performing the upgrade
    const targetRoleInt = parseInt(targetRole);
    if (currentUserRole === 2) {
      // Company Admin can upgrade to Master Distributor (3) or Distributor (4)
      const validRoles = [3, 4];
      if (!validRoles.includes(targetRoleInt)) {
        return res.failure({ message: 'Invalid target role. Can only upgrade to Master Distributor (3) or Distributor (4)' });
      }
    } else if (currentUserRole === 3) {
      // Master Distributor can only upgrade to Distributor (4)
      if (targetRoleInt !== 4) {
        return res.failure({ message: 'Master Distributor can only upgrade to Distributor (4)' });
      }
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
    
    if (currentUserRole === 2) {
      // Company Admin can upgrade:
      // - Retailer (5) to Master Distributor (3)
      // - Retailer (5) to Distributor (4)
      // - Distributor (4) to Master Distributor (3)
      // Cannot upgrade to Company Admin (2)
      
      if (targetRoleInt === 2) {
        return res.failure({ message: 'Company Admin cannot upgrade anyone to Company Admin' });
      }

      if (currentRole === 5 && (targetRoleInt === 3 || targetRoleInt === 4)) {
        // Retailer → Master Distributor or Distributor - allowed
      } else if (currentRole === 4 && targetRoleInt === 3) {
        // Distributor → Master Distributor - allowed
      } else {
        return res.failure({ message: 'Invalid upgrade path for Company Admin' });
      }
    } else if (currentUserRole === 3) {
      // Master Distributor can upgrade only:
      // - Retailer (5) to Distributor (4)
      // Cannot upgrade to Master Distributor or higher
      
      if (targetRoleInt === 3 || targetRoleInt === 2) {
        return res.failure({ message: 'Master Distributor cannot upgrade to Master Distributor or Company Admin' });
      }

      if (currentRole === 5 && targetRoleInt === 4) {
        // Retailer → Distributor - allowed
      } else if (currentRole === 4 && targetRoleInt === 3) {
        return res.failure({ message: 'Master Distributor cannot upgrade Distributor to Master Distributor' });
      } else {
        return res.failure({ message: 'Invalid upgrade path for Master Distributor' });
      }
    }
    
    // Update user role
    await dbService.update(model.user, { id: userId }, {
      userRole: targetRoleInt
    });
    
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
    
    // Only Company Admin (userRole 2) can access this
    if (currentUser.userRole !== 2) {
      return res.failure({ message: 'Only Company Admin can degrade users' });
    }
    
    // Validate targetRole
    const validRoles = [4, 5]; // Distributor, Retailer (can degrade to these)
    if (!validRoles.includes(parseInt(targetRole))) {
      return res.failure({ message: 'Invalid target role. Can only degrade to Distributor (4) or Retailer (5)' });
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
    
    // Company Admin can degrade:
    // - Master Distributor (3) to Distributor (4) or Retailer (5)
    // - Distributor (4) to Retailer (5)
    const currentRole = userToDegrade.userRole;
    const targetRoleInt = parseInt(targetRole);
    
    // Check if it's actually a degradation (target role should be higher number)
    if (targetRoleInt <= currentRole) {
      return res.failure({ message: 'Target role must be lower than current role for degradation' });
    }
    
    if (currentRole === 3) {
      // Can degrade Master Distributor to either Distributor or Retailer
      if (targetRoleInt !== 4 && targetRoleInt !== 5) {
        return res.failure({ message: 'Can only degrade Master Distributor to Distributor (4) or Retailer (5)' });
      }
    } else if (currentRole === 4) {
      // Can degrade Distributor to Retailer
      if (targetRoleInt !== 5) {
        return res.failure({ message: 'Can only degrade Distributor to Retailer (5)' });
      }
    } else {
      return res.failure({ message: `Cannot degrade user with role ${currentRole}. Can only degrade Master Distributors or Distributors.` });
    }
    
    // Update user role
    await dbService.update(model.user, { id: userId }, {
      userRole: targetRoleInt
    });
    
    // Note: If degraded to Retailer (5), referCode remains but won't be used for new referrals
    // since only roles 2, 3, and 4 can have referCode
    
    return res.success({
      message: 'User role degraded successfully',
      data: {
        userId: userId,
        previousRole: currentRole,
        newRole: targetRoleInt
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

