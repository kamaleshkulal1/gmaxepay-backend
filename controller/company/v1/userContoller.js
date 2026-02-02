const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op, Sequelize } = require('sequelize');
const bcrypt = require('bcrypt');
const emailService = require('../../../services/emailService');

const findAllUsers = async (req, res) => {
    try {
      // Check if user has permission
      let permissions = req.permission || [];
      let hasPermission = permissions.some(
        (permission) =>
          permission.dataValues.permissionId === 1 &&
          permission.dataValues.read === true
      );
  
      if (!hasPermission) {
        return res.failure({ message: "User doesn't have Permission!" });
      }

      // Only whitelabel users (userRole 2) can access this endpoint
      const userRole = req.user.userRole;
      const userId = req.user.id;
      const userCompanyId = req.user.companyId;
      
      if (userRole !== 2) {
        return res.failure({ message: "Only whitelabel users can access this endpoint!" });
      }

      // CompanyId cannot be null
      if (!userCompanyId || userCompanyId === null || userCompanyId === undefined) {
        return res.failure({ message: "Company ID is required!" });
      }

      let companyIds = [];
      let companies = [];

      // If companyId is 1, get all companies that have whitelabel users
      if (userCompanyId === 1) {
        // Get all companies that have whitelabel users (userRole 2) with companyId (companyId cannot be null)
        const whitelabelUsers = await dbService.findAll(model.user, {
          userRole: 2,
          companyId: { [Op.not]: null },
          isDeleted: false
        }, {
          attributes: ['companyId'],
          raw: true
        });

        // Extract unique company IDs
        companyIds = [...new Set(whitelabelUsers.map(u => u.companyId).filter(id => id !== null && id !== undefined))];

        if (companyIds.length === 0) {
          return res.success({
            message: 'Users Retrieved Successfully',
            data: [],
            total: 0
          });
        }

        // Get companies with their details
        companies = await dbService.findAll(model.company, {
          id: { [Op.in]: companyIds },
          isDeleted: false
        }, {
          attributes: ['id', 'companyName']
        });
      } else {
        // For other companyIds, only get that specific company
        // Verify that the company has a whitelabel user (userRole 2)
        const whitelabelUser = await dbService.findOne(model.user, {
          id: userId,
          userRole: 2,
          companyId: userCompanyId,
          isDeleted: false
        });

        if (!whitelabelUser) {
          return res.failure({ message: "Company not found or user doesn't have access!" });
        }

        // Get the specific company
        const company = await dbService.findOne(model.company, {
          id: userCompanyId,
          isDeleted: false
        }, {
          attributes: ['id', 'companyName']
        });

        if (!company) {
          return res.success({
            message: 'Users Retrieved Successfully',
            data: [],
            total: 0
          });
        }

        companyIds = [userCompanyId];
        companies = [company];
      }

      // Get request body for filtering, pagination, and search
      let dataToFind = req.body || {};
      let options = {};
      let query = {
        companyId: { [Op.in]: companyIds },
        userRole: { [Op.in]: [3, 4, 5] },
        isDeleted: false
      };

      // Build query from request body
      if (dataToFind.query) {
        // Apply userRole filter if provided (3=MD, 4=DI, 5=RE)
        if (dataToFind.query.userRole !== undefined) {
          const requestedRole = dataToFind.query.userRole;
          
          // Access denied for userRole 1 (Admin) and 2 (Whitelabel)
          if (requestedRole === 1 || requestedRole === 2) {
            return res.failure({ message: "Access denied! You cannot filter by this user role." });
          }
          
          // Ensure it's one of the allowed roles (3, 4, 5)
          if ([3, 4, 5].includes(requestedRole)) {
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

      // Transform users data and include companyId for grouping
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

      // Group users by company
      const companiesWithUsers = companies.map((company) => {
        const companyData = company.toJSON ? company.toJSON() : company;
        const companyUsers = transformedUsers.filter(user => user.companyId === companyData.id);
        
        return {
          companyId: companyData.id,
          companyName: companyData.companyName,
          users: companyUsers
        };
      });

      return res.success({
        message: 'Users Retrieved Successfully',
        data: companiesWithUsers,
        total: foundUsers.total,
        paginator: foundUsers.paginator
      });
    } catch (error) {
      console.log(error);
      return res.internalServerError({ message: error.message });
    }
  };

// Set MPIN - Company admin can set their own MPIN (first time only, no old MPIN needed)
const setMPIN = async (req, res) => {
  try {
    const userId = req.user.id;
    const { newMPIN, confirmMPIN } = req.body;

    // Only Company Admin (userRole 2) can set their own MPIN
    if (req.user.userRole !== 2) {
      return res.failure({ message: 'Only company admin can set MPIN' });
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

// Reset MPIN - Company admin can reset MPIN (requires oldMPIN, newMPIN, confirmMPIN)
const resetMPIN = async (req, res) => {
  try {
    const currentUser = req.user;
    const { userId, oldMPIN, newMPIN, confirmMPIN } = req.body;

    // Only Company Admin (userRole 2) can reset MPIN
    if (currentUser.userRole !== 2) {
      return res.failure({ message: 'Only company admin can reset MPIN' });
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
      // If companyId is 1, can reset for any company
      if (currentUser.companyId === 1) {
        userToReset = await dbService.findOne(model.user, {
          id: userId,
          isDeleted: false
        });
      } else {
        // Otherwise, only users in the same company
        userToReset = await dbService.findOne(model.user, {
          id: userId,
          companyId: currentUser.companyId,
          isDeleted: false
        });
      }
    } else {
      // User resetting their own MPIN
      userToReset = await dbService.findOne(model.user, {
        id: targetUserId,
        isDeleted: false
      });
    }

    if (!userToReset) {
      return res.failure({ message: 'User not found' });
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

module.exports = {
  findAllUsers,
  setMPIN,
  resetMPIN
};