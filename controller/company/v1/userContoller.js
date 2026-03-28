const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op, Sequelize } = require('sequelize');
const bcrypt = require('bcrypt');
const emailService = require('../../../services/emailService');
const imageService = require('../../../services/imageService');

const findAllUsers = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.read === true
    );

    if (!hasPermission || req.user.userRole !== 2) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const userRole = req.user.userRole;
    const userId = req.user.id;
    const userCompanyId = req.user.companyId;

    if (userRole !== 2) {
      return res.failure({ message: "Only whitelabel users can access this endpoint!" });
    }

    if (!userCompanyId || userCompanyId === null || userCompanyId === undefined) {
      return res.failure({ message: "Company ID is required!" });
    }

    let companyIds = [];
    let companies = [];

    if (userCompanyId === 1) {
      const whitelabelUsers = await dbService.findAll(model.user, {
        userRole: 2,
        companyId: { [Op.not]: null },
        isDeleted: false
      }, {
        attributes: ['companyId'],
        raw: true
      });

      companyIds = [...new Set(whitelabelUsers.map(u => u.companyId).filter(id => id !== null && id !== undefined))];

      if (companyIds.length === 0) {
        return res.success({
          message: 'Users Retrieved Successfully',
          data: [],
          total: 0
        });
      }

      companies = await dbService.findAll(model.company, {
        id: { [Op.in]: companyIds },
        isDeleted: false
      }, {
        attributes: ['id', 'companyName']
      });
    } else {
      const whitelabelUser = await dbService.findOne(model.user, {
        id: userId,
        userRole: 2,
        companyId: userCompanyId,
        isDeleted: false
      });

      if (!whitelabelUser) {
        return res.failure({ message: "Company not found or user doesn't have access!" });
      }

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

    let dataToFind = req.body || {};
    let options = {};
    let query = {
      companyId: { [Op.in]: companyIds },
      userRole: { [Op.in]: [3, 4, 5] },
      isDeleted: false
    };

    if (dataToFind.query) {
      if (dataToFind.query.userRole !== undefined) {
        const requestedRole = dataToFind.query.userRole;

        if (requestedRole === 1 || requestedRole === 2) {
          return res.failure({ message: "Access denied! You cannot filter by this user role." });
        }

        if ([3, 4, 5].includes(requestedRole)) {
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

      Object.keys(dataToFind.query).forEach(key => {
        if (key !== 'userRole' && key !== 'kycStatus') {
          query[key] = dataToFind.query[key];
        }
      });
    }

    if (dataToFind.options !== undefined) {
      options = { ...dataToFind.options };
    }

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

    const roleMap = {
      2: 'WL',
      3: 'MD',
      4: 'DI',
      5: 'RE'
    };

    const transformedUsers = foundUsers.data.map((user) => {
      const userData = user.toJSON ? user.toJSON() : user;
      const companyData = userData.company || {};
      const walletData = userData.wallet || {};
      const onboardingTokens = userData.onboardingTokens || [];

      const kycStatus = userData.kycStatus === 'FULL_KYC' ? 'completed' : 'pending';

      const isLockedByStatus = !!(userData.isLocked && userData.lockUntil && new Date(userData.lockUntil) > new Date());
      const isLockedByAttempts = (userData.loginAttempts || 0) >= 3;
      const isLocked = isLockedByStatus || isLockedByAttempts;

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
    return res.internalServerError({ message: error.message });
  }
};

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

const getUserProfile = async (req, res) => {
  try {
    if (req.user.userRole !== 2) {
      return res.failure({ message: 'You are not authorized to get user details' });
    }
    const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
    if (!existingUser) {
      return res.failure({ message: 'User not found' });
    }

    const companyDetails = existingUser.companyId
      ? await dbService.findOne(model.company, { id: existingUser.companyId })
      : null;

    const [outletDetails, reportingToManager, companyBankDetails] = await Promise.all([
      existingUser.companyId
        ? dbService.findOne(model.outlet, { refId: existingUser.id, companyId: existingUser.companyId })
        : null,
      existingUser.companyId
        ? dbService.findOne(model.user, { id: 1, companyId: 1, userRole: 1 })
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
      kycStatus: existingUser.kycStatus,
      reportingToManager: reportingToManager?.name || null,
      reportingToManagerEmail: reportingToManager?.email || null,
      reportingToManagerMobile: reportingToManager?.mobileNo || null,
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
        beneficiaryName: bank.beneficiaryName,
        accountNumber: bank.accountNumber,
        ifsc: bank.ifsc,
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

const findAllCompanyReportToUser = async (req, res) => {
  try {
    if (req.user.userRole !== 2) {
      return res.failure({ message: 'You are not authorized to access this resource' });
    }

    const companyId = req.user.companyId;

    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    // Get request body for filtering, pagination, and search
    let dataToFind = req.body || {};
    let options = {};
    let query = {
      companyId: companyId,
      userRole: { [Op.in]: [3, 4, 5] },
      [Op.or]: [
        { reportingTo: 1 },
        { reportingTo: null }
      ],
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
        const reportingToCondition = {
          [Op.or]: [
            { reportingTo: 1 },
            { reportingTo: null }
          ]
        };

        query = {
          companyId: query.companyId,
          userRole: query.userRole,
          isDeleted: query.isDeleted,
          [Op.and]: [
            reportingToCondition,
            {
              [Op.or]: orConditions
            }
          ]
        };
      }
    }

    // Merge query options correctly
    const paginateOptions = {
      ...options,
      attributes: ['id', 'name', 'userId', 'userRole', 'mobileNo', 'email', 'isActive', 'createdAt']
    };

    // Use pagination
    let foundUsers = await dbService.paginate(model.user, query, paginateOptions);

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
    if (req.user.userRole !== 2) {
      return res.failure({ message: 'You are not authorized to get user details' });
    }

    const companyId = req.user.companyId;
    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    const existingUser = await dbService.findOne(model.user, {
      id,
      companyId,
      isDeleted: false
    });

    if (!existingUser) {
      return res.failure({ message: 'User not found' });
    }

    const companyDetails = existingUser.companyId
      ? await dbService.findOne(model.company, { id: existingUser.companyId })
      : null;

    const companyAdmin = existingUser.companyId
      ? await dbService.findOne(model.user, {
        companyId: existingUser.companyId,
        userRole: 2,
        isDeleted: false
      })
      : null;

    const [outletDetails, slabDetails, reportingToManager, companyBankDetails] = await Promise.all([
      existingUser.companyId
        ? dbService.findOne(model.outlet, {
          refId: existingUser.id,
          companyId: existingUser.companyId
        })
        : null,
      existingUser.companyId
        ? dbService.findOne(model.slab, {
          id: existingUser.slabId,
          isActive: true
        }, { attributes: ['id', 'slabName'] })
        : null,
      existingUser.companyId
        ? dbService.findOne(model.user, {
          id: existingUser.reportingTo || companyAdmin?.id,
          companyId: existingUser.companyId
        })
        : null,
      existingUser.companyId
        ? dbService.findAll(model.customerBank, {
          refId: existingUser.id,
          companyId: existingUser.companyId
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
      id: existingUser.id,
      name: existingUser.name,
      email: existingUser.email,
      mobileNo: existingUser.mobileNo,
      slabId: existingUser.slabId,
      slabName: slabDetails?.slabName || null,
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
      kycStatus: existingUser.kycStatus,
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
      message: 'User profile fetched successfully',
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

    if (req.user.userRole !== 2) {
      return res.failure({ message: "You are not authorized to get complete KYC data" });
    }

    const { id } = req.params;
    const companyId = req.user.companyId;

    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    // Find user
    let foundUser = await dbService.findOne(model.user, {
      id,
      companyId,
      isDeleted: false
    });

    if (!foundUser) {
      return res.failure({ message: 'User not found in your company' });
    }

    // Get image URLs helper - use CDN URLs for all images
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

    if (req.user.userRole !== 2) {
      return res.failure({ message: "You don't have permission to revert KYC data" });
    }

    const { id } = req.params;
    const companyId = req.user.companyId;

    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    const { pan, aadhar, shopImage, bankVerification } = req.body || {};

    // Find user
    let foundUser = await dbService.findOne(model.user, {
      id,
      companyId,
      isDeleted: false
    });

    if (!foundUser) {
      return res.failure({ message: 'User not found in your company' });
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
      updateData.isPanUploaded = false;
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
        }, { force: true });
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
      updateData.isAadharUploaded = false;
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
        }, { force: true });
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

      if (outlet) {
        if (outlet.shopImage) {
          const shopImageKey = extractS3Key(outlet.shopImage);

          if (shopImageKey) {
            revertOperations.push(
              imageService.deleteImageFromS3(shopImageKey).catch(err =>
                console.error('Error deleting shop image:', err)
              )
            );
          }
        }

        // Destroy outlet record
        await dbService.destroy(
          model.outlet,
          { id: outlet.id }
        );
      }

      updateData.shopDetailsVerify = false;
      revertMessages.push('Shop details have been reverted');
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

const upgradeList = async (req, res) => {
  try {
    if (req.user.userRole !== 2) {
      return res.failure({ message: "Only whitelabel users can access this endpoint!" });
    }

    const companyId = req.user.companyId;
    const userId = req.user.id;

    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    let dataToFind = req.body || {};
    let options = {};
    let query = {
      companyId: companyId,
      userRole: { [Op.in]: [3, 4, 5] },
      [Op.or]: [
        { reportingTo: userId },
        { reportingTo: null }
      ],
      isDeleted: false
    };

    if (dataToFind.query) {
      if (dataToFind.query.userRole !== undefined) {
        const requestedRole = dataToFind.query.userRole;
        if ([3, 4, 5].includes(requestedRole)) {
          query.userRole = requestedRole;
        } else {
          return res.failure({ message: "Access denied! You can only filter by master distributor, distributor or retailer role." });
        }
      }

      Object.keys(dataToFind.query).forEach(key => {
        if (key !== 'userRole' && key !== 'reportingTo') {
          query[key] = dataToFind.query[key];
        }
      });
    }

    if (dataToFind.options !== undefined) {
      options = { ...dataToFind.options };
    }

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
        const reportingToCondition = {
          [Op.or]: [
            { reportingTo: userId },
            { reportingTo: null }
          ]
        };

        query = {
          companyId: query.companyId,
          userRole: query.userRole,
          isDeleted: query.isDeleted,
          [Op.and]: [
            reportingToCondition,
            { [Op.or]: orConditions }
          ]
        };

        Object.keys(dataToFind.query || {}).forEach(key => {
          if (key !== 'userRole' && key !== 'reportingTo') {
            query[Op.and].push({ [key]: dataToFind.query[key] });
          }
        });
      }
    }

    const paginateOptions = {
      ...options,
      attributes: ['id', 'name', 'userId', 'userRole', 'mobileNo', 'email', 'isActive', 'createdAt', 'slabId']
    };

    let foundUsers = await dbService.paginate(model.user, query, paginateOptions);

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

    const roleMap = {
      2: 'WL',
      3: 'MD',
      4: 'DI',
      5: 'RE'
    };

    const transformedUsers = foundUsers.data.map((user) => {
      const userData = user.toJSON ? user.toJSON() : user;
      return {
        id: userData.id,
        name: userData.name || null,
        userId: userData.userId || null,
        mobileNo: userData.mobileNo || null,
        email: userData.email || null,
        userRole: roleMap[userData.userRole] || `Role ${userData.userRole}`,
        status: userData.isActive ? 'Active' : 'Inactive',
        date: userData.createdAt || null,
        slabId: userData.slabId || null
      };
    });

    return res.success({
      message: 'Upgrade Users List Retrieved Successfully',
      data: transformedUsers,
      total: foundUsers.total,
      paginator: foundUsers.paginator
    });
  } catch (error) {
    console.error('Error in upgradeList:', error);
    return res.internalServerError({ message: error.message });
  }
};

module.exports = {
  findAllUsers,
  setMPIN,
  resetMPIN,
  getUserProfile,
  findAllCompanyReportToUser,
  upgradeList,
  getByUserProfile,
  getCompleteKycData,
  revertKycData
};