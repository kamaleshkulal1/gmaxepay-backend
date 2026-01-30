const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op, Sequelize } = require('sequelize');
const imageService = require('../../../services/imageService');
const emailService = require('../../../services/emailService');
const ekycHub = require('../../../services/eKycHub');
const razorpayApi = require('../../../services/razorpayApi');
const { doubleEncrypt, decrypt } = require('../../../utils/doubleCheckUp');
const key = Buffer.from(process.env.AES_KEY, 'hex');


const createUser = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    let dataToCreate = { ...(req.body || {}) };
    const companyId = req.companyId;
    dataToCreate = {
      ...dataToCreate,
      isActive: true,
      addedBy: req.user.id,
      type: req.user.userType,
      companyId
    };

    let createdUser = await dbService.createOne(model.user, dataToCreate);
    if (!createdUser) {
      return res.failure({ message: 'Failed to create User' });
    }
    let userToReturn = {
      ...createdUser.dataValues
    };
    return res.success({
      message: 'User Created Successfully',
      data: userToReturn
    });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.validationError({ message: error.errors[0].message });
    }
    return res.internalServerError({ message: error.message });
  }
};

const findAllUsers = async (req, res) => {
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

    let dataToFind = req.body || {};
    let options = {};
    let query = {};

    // Build query from request body
    if (dataToFind.query) {
      query = { ...dataToFind.query };
    }

    // Filter by userRole (2=white label, 3=master distributor, 4=distributor, 5=retailer)
    if (!query.userRole) {
      query.userRole = { [Op.in]: [2, 3, 4, 5] };
    }

    // Apply company filter
    const userRole = req.user.userRole;
    const userCompanyId = req.user.companyId;
    if (!(userRole === 1 && userCompanyId === 1)) {
      const companyId = req.companyId || userCompanyId;
      if (companyId !== undefined && companyId !== null) {
        query.companyId = companyId;
      }
    }

    // Handle kycStatus filter
    if (query.kycStatus) {
      const kycStatusValue = query.kycStatus;

      if (kycStatusValue === 'pending') {
        query.kycStatus = { [Op.in]: ['HALF_KYC', 'NO_KYC'] };
      } else if (kycStatusValue === 'completed') {
        query.kycStatus = 'FULL_KYC';
      } else if (typeof kycStatusValue === 'string' && kycStatusValue.includes('||')) {
        const statuses = kycStatusValue
          .split('||')
          .map((s) => s.trim())
          .filter((s) => s);
        if (statuses.length > 0) {
          query.kycStatus = { [Op.in]: statuses };
        }
      } else if (Array.isArray(kycStatusValue)) {
        query.kycStatus = { [Op.in]: kycStatusValue };
      }
    }

    // Handle options
    if (dataToFind.options !== undefined) {
      options = { ...dataToFind.options };
    }

    // Handle customSearch
    if (dataToFind.customSearch) {
      const keys = Object.keys(dataToFind.customSearch);
      const orConditions = [];

      keys.forEach((key) => {
        const value = dataToFind.customSearch[key];
        if (typeof value === 'number') {
          orConditions.push(
            Sequelize.where(Sequelize.cast(Sequelize.col(key), 'varchar'), {
              [Op.iLike]: `%${value}%`
            })
          );
        } else {
          orConditions.push({
            [key]: {
              [Op.iLike]: `%${value}%`
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

    // Normalize users and collect slabIds
    const usersArray = foundUsers.data.map((user) =>
      user.toJSON ? user.toJSON() : user
    );

    const slabIds = [
      ...new Set(
        usersArray
          .map((u) => u.slabId)
          .filter((id) => id !== null && id !== undefined)
      )
    ];

    let slabsById = {};
    if (slabIds.length > 0) {
      const slabs = await dbService.findAll(
        model.slab,
        { id: { [Op.in]: slabIds } },
        { attributes: ['id', 'slabName'] }
      );

      if (slabs && slabs.length > 0) {
        slabsById = slabs.reduce((acc, slab) => {
          const slabData = slab.toJSON ? slab.toJSON() : slab;
          acc[slabData.id] = slabData;
          return acc;
        }, {});
      }
    }

    // Transform the response
    const transformedData = usersArray.map((userData) => {
      const companyData = userData.company || {};
      const walletData = userData.wallet || {};
      const onboardingTokens = userData.onboardingTokens || [];

      const kycStatus =
        userData.kycStatus === 'FULL_KYC' ? 'completed' : 'pending';

      const isLockedByStatus =
        !!userData.isLocked &&
        !!userData.lockUntil &&
        new Date(userData.lockUntil) > new Date();
      const isLockedByAttempts = (userData.loginAttempts || 0) >= 3;
      const isLocked = isLockedByStatus || isLockedByAttempts;

      const latestOnboardingToken =
        Array.isArray(onboardingTokens) && onboardingTokens.length > 0
          ? onboardingTokens[0]
          : null;
      const onboardingTokenExpiresAt =
        latestOnboardingToken?.expiresAt || null;

      const slab = userData.slabId ? slabsById[userData.slabId] : null;

      return {
        id: userData.id,
        date: userData.createdAt || null,
        userId: userData.userId || null,
        name: userData.name || null,
        userRole: roleMap[userData.userRole] || `Role ${userData.userRole}`,
        mobileNo: userData.mobileNo || null,
        email: userData.email || null,
        parentName: companyData.companyName || null,
        parentRole: 'Whitelabel',
        company: companyData.companyName || null,
        kycStatus,
        kycSteps: userData.kycSteps || 0,
        status: userData.isActive ? 'Active' : 'Inactive',
        lock: isLocked,
        onboardingTokenExpiresAt,
        wallet: {
          mainWallet: walletData.mainWallet || 0,
          apesWallet: walletData.apesWallet || 0
        },
        slab: slab ? slab.slabName : null
      };
    });

    return res.success({
      message: 'Users Retrieved Successfully',
      data: transformedData,
      total: foundUsers.total,
      paginator: foundUsers.paginator
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

const getUser = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const { id } = req.params;
    // Get companyId from req.companyId (set by hostCheck) or req.user.companyId (set by authentication)
    let companyId = req.companyId || req.user?.companyId;

    // If companyId is still not available, get it from the user record
    if (!companyId) {
      const tempUser = await dbService.findOne(model.user, {
        id,
        isDeleted: false
      }, {
        attributes: ['companyId']
      });
      
      if (tempUser) {
        companyId = tempUser.companyId;
      } else {
        return res.failure({ message: 'User not found' });
      }
    }

    // Build query - only include companyId if user is not super admin
    const userRole = req.user.userRole;
    const query = { id };
    if (!(userRole === 1 && companyId === 1)) {
      query.companyId = companyId;
    }

    let foundUser = await dbService.findOne(model.user, query);
    if (!foundUser) {
      return res.failure({ message: 'User not found' });
    }
    return res.success({
      message: 'User Retrieved Successfully',
      data: foundUser
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const { id } = req.params;
    let companyId = req.companyId || req.user?.companyId;

    // If companyId is still not available, get it from the user record
    if (!companyId) {
      const tempUser = await dbService.findOne(model.user, {
        id,
        isDeleted: false
      }, {
        attributes: ['companyId']
      });
      
      if (tempUser) {
        companyId = tempUser.companyId;
      } else {
        return res.failure({ message: 'User not found' });
      }
    }

    const company = await dbService.findOne(model.company, { id: companyId });
    if (!company) {
      return res.failure({ message: 'Company not found' });
    }
    let dataToUpdate = { ...(req.body || {}) };
    dataToUpdate = {
      ...dataToUpdate,
      updatedBy: req.user.id,
      type: req.user.userType
    };

    // Build query - only include companyId if user is not super admin
    const userRole = req.user.userRole;
    const query = { id };
    if (!(userRole === 1 && companyId === 1)) {
      query.companyId = companyId;
    }

    let updatedUser = await dbService.update(
      model.user,
      query,
      dataToUpdate
    );
    if (!updatedUser) {
      return res.failure({ message: 'Update User failed' });
    }
    const finalData = {
      ...dataToUpdate,
    };

    return res.success({
      message: 'User Updated Successfully',
      data: finalData
    });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.validationError({ message: error.errors[0].message });
    }
    return res.internalServerError({ message: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const { id } = req.params;
    // Get companyId from req.companyId (set by hostCheck) or req.user.companyId (set by authentication)
    let companyId = req.companyId || req.user?.companyId;

    // If companyId is still not available, get it from the user record
    if (!companyId) {
      const tempUser = await dbService.findOne(model.user, {
        id,
        isDeleted: false
      }, {
        attributes: ['companyId']
      });
      
      if (tempUser) {
        companyId = tempUser.companyId;
      } else {
        return res.failure({ message: 'User not found' });
      }
    }

    // Build query - only include companyId if user is not super admin
    const userRole = req.user.userRole;
    const query = { id };
    if (!(userRole === 1 && companyId === 1)) {
      query.companyId = companyId;
    }

    let deletedUser = await dbService.destroy(model.user, query);
    if (!deletedUser) {
      return res.failure({ message: 'Delete User failed' });
    }
    return res.success({
      message: 'User Deleted Successfully'
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

// Helper function to extract S3 key from image data
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

// Helper function to calculate KYC status
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

const unlockAccount = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const { id } = req.params;
    const currentUser = req.user;
    const currentUserRole = currentUser?.userRole;

    // Build query based on user role
    let query = { id, isActive: true };
    let companyId = null;

    // If superadmin (userRole 1), no companyId needed - can unlock any user
    if (currentUserRole === 1) {
      // No companyId filter needed for superadmin
      companyId = null;
    } 
    // If whitelabel/company admin (userRole 2), require companyId
    else if (currentUserRole === 2) {
      // Get companyId from req.user.companyId
      companyId = currentUser?.companyId;
      
      if (!companyId) {
        return res.failure({ message: 'Company ID is required for whitelabel users!' });
      }
      
      // Add companyId to query
      query.companyId = companyId;
    } 
    // For other roles, require companyId
    else {
      companyId = currentUser?.companyId || req.companyId;
      
      if (!companyId) {
        // Try to get it from the user record being unlocked
        const tempUser = await dbService.findOne(model.user, {
          id,
          isActive: true
        }, {
          attributes: ['companyId']
        });
        
        if (tempUser) {
          companyId = tempUser.companyId;
        } else {
          return res.failure({ message: 'User not found or Company ID is required!' });
        }
      }
      
      query.companyId = companyId;
    }

    // Find user
    let foundUser = await dbService.findOne(model.user, query);

    if (!foundUser) {
      return res.failure({ message: 'User not found' });
    }

    // Get Sequelize instance to check lock status
    const userInstance = await dbService.findOne(model.user, query);

    if (!userInstance) {
      return res.failure({ message: 'User not found' });
    }

    // Check if account is locked
    if (!userInstance.isAccountLocked || !userInstance.isAccountLocked()) {
      return res.failure({ message: 'Account is not locked. Unlock operation is only allowed for locked accounts.' });
    }

    // Unlock the account
    await userInstance.resetAllLockAttempts();

    // Reload user to get updated status
    const reloadQuery = { id };
    if (companyId) {
      reloadQuery.companyId = companyId;
    }
    const updatedUser = await dbService.findOne(model.user, reloadQuery);

    // Get company for logo (only if companyId exists)
    let company = null;
    if (companyId) {
      company = await dbService.findOne(model.company, {
        id: companyId,
        isDeleted: false
      });
    } else if (updatedUser?.companyId) {
      // If no companyId in query but user has companyId, use it for logo
      company = await dbService.findOne(model.company, {
        id: updatedUser.companyId,
        isDeleted: false
      });
    }

    // Send unlock email if user has email
    if (updatedUser.email) {
      try {
        const backendUrl = process.env.BASE_URL|| 'https://api-dev.gmaxepay.in';
        const logoUrl = company?.logo ? imageService.getImageUrl(company.logo) : `${backendUrl}/gmaxepay.png`;
        const unlockIllustrationUrl = `${backendUrl}/unlockuser.png`;

        // Send notification email for account unlock
        await emailService.sendNotificationEmail({
          to: updatedUser.email,
          userName: updatedUser.name || 'User',
          subject: 'Your Account Has Been Unlocked - Gmaxepay',
          successMessage: 'Your account has been unlocked successfully',
          message: 'You can now login to your account. If you did not request this action, please contact our support team immediately.',
          logoUrl: logoUrl,
          illustrationUrl: unlockIllustrationUrl
        });
      } catch (emailError) {
        console.error('Error sending unlock email:', emailError);
        // Continue even if email fails
      }
    }

    return res.success({
      message: 'Account unlocked successfully',
      data: {
        id: updatedUser.id,
        userId: updatedUser.userId,
        isLocked: updatedUser.isLocked || false,
        loginAttempts: updatedUser.loginAttempts || 0,
        lockUntil: updatedUser.lockUntil || null
      }
    });
  } catch (error) {
    console.error('Error unlocking account:', error);
    return res.internalServerError({ message: error.message });
  }
};

const getKycVerificationStatus = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const { id } = req.params;
    // Get companyId from req.companyId (set by hostCheck) or req.user.companyId (set by authentication)
    let companyId = req.companyId || req.user?.companyId;

    // If companyId is still not available, get it from the user record
    if (!companyId) {
      const tempUser = await dbService.findOne(model.user, {
        id,
        isDeleted: false
      }, {
        attributes: ['companyId']
      });
      
      if (tempUser) {
        companyId = tempUser.companyId;
      } else {
        return res.failure({ message: 'User not found' });
      }
    }


    // Find user
    let foundUser = await dbService.findOne(model.user, {
      id,
      companyId,
      isDeleted: false
    });

    if (!foundUser) {
      return res.failure({ message: 'User not found' });
    }

    // Get outlet for shop image
    const outlet = await dbService.findOne(model.outlet, {
      refId: id,
      companyId: companyId
    });

    // Get image URLs helper - use CDN URLs for all images (not secure proxy)
    // Pass useSecureProxy = false to get CDN URLs like: https://assets.gmaxepay.in/images/...
    const getImageUrl = (imageData) => {
      if (!imageData) return null;
      const plainKey = extractS3Key(imageData);
      if (!plainKey) return null;
      // Use useSecureProxy = false to get CDN URLs instead of secure proxy URLs
      return imageService.getImageUrl(plainKey, false);
    };

    // Get shop image URL helper
    const getShopImageUrl = (shopImage) => {
      if (!shopImage) return null;
      const plainKey = extractS3Key(shopImage);
      if (!plainKey) return null;
      // Use CDN URL for shop images
      return imageService.getImageUrl(plainKey, false);
    };

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

    const verificationStatus = {
      mobileVerify: !!foundUser.mobileVerify,
      emailVerify: !!foundUser.emailVerify,
      aadharVerify: !!foundUser.aadharVerify,
      panVerify: !!foundUser.panVerify,
      shopDetailsVerify: !!foundUser.shopDetailsVerify,
      bankDetailsVerify: !!foundUser.bankDetailsVerify,
      imageVerify: !!foundUser.imageVerify,
      profileImageWithShopVerify: !!foundUser.profileImageWithShopVerify,
      aadharFrontImage: getImageUrl(foundUser.aadharFrontImage),
      aadharBackImage: getImageUrl(foundUser.aadharBackImage),
      panCardFrontImage: getImageUrl(foundUser.panCardFrontImage),
      panCardBackImage: getImageUrl(foundUser.panCardBackImage),
      profileImage: getImageUrl(foundUser.profileImage),
      shopImage: outlet ? getShopImageUrl(outlet.shopImage) : null
    };

    return res.success({
      message: 'KYC Verification Status Retrieved Successfully',
      data: verificationStatus
    });
  } catch (error) {
    console.error('Error getting KYC verification status:', error);
    return res.internalServerError({ message: error.message });
  }
};

const getCompleteKycData = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const { id } = req.params;
    // Get companyId from req.companyId (set by hostCheck) or req.user.companyId (set by authentication)
    let companyId = req.companyId || req.user?.companyId;

    if(req.user.userRole !== 1){
      return res.failure({message:"don't have permission to get complete KYC data"})
    }
    // If companyId is still not available, get it from the user record
    const tempUser = await dbService.findOne(model.user, {
        id,
        isDeleted: false
    });
   
    if (tempUser) {
        companyId = tempUser.companyId;
      } else {
        return res.failure({ message: 'User not found' });
    }
    // Find user
    let foundUser = await dbService.findOne(model.user, {
      id,
      isDeleted: false
    });

    if (!foundUser) {
      return res.failure({ message: 'User not found' });
    }

    // Get image URLs helper - use CDN URLs for all images (not secure proxy)
    // Pass useSecureProxy = false to get CDN URLs like: https://assets.gmaxepay.in/images/...
    const getImageUrl = (imageData) => {
      if (!imageData) return null;
      const plainKey = extractS3Key(imageData);
      if (!plainKey) return null;
      // Use useSecureProxy = false to get CDN URLs instead of secure proxy URLs
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

    // Get shop image URL - use CDN URL
    const getShopImageUrl = (shopImage) => {
      if (!shopImage) return null;
      const plainKey = extractS3Key(shopImage);
      if (!plainKey) return null;
      // Use CDN URL for shop images
      return imageService.getImageUrl(plainKey, false);
    };

    const shopCategory = await dbService.findOne(model.practomindCompanyCode, {
      id: outlet.shopCategoryId,
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
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const { id } = req.params;
    // Get companyId from req.companyId (set by hostCheck) or req.user.companyId (set by authentication)
    let companyId = req.companyId || req.user?.companyId;
    const { pan, aadhar, shopImage, bankVerification } = req.body || {};

    if(req.user.userRole !== 1){
      return res.failure({message:"don't have permission to get complete KYC data"})
    }
    // If companyId is still not available, get it from the user record
    const tempUser = await dbService.findOne(model.user, {
        id,
        isDeleted: false
    });
   
    if (tempUser) {
        companyId = tempUser.companyId;
      } else {
        return res.failure({ message: 'User not found' });
    }

    // Find user
    let foundUser = await dbService.findOne(model.user, {
      id,
      companyId,
      isDeleted: false
    });

    if (!foundUser) {
      return res.failure({ message: 'User not found' });
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

    // Helper to check if value is true (handles boolean true or string 'true')
    const isTrue = (value) => {
      return value === true || value === 'true';
    };

    // Check if any revert operation was requested
    if (!isTrue(pan) && !isTrue(aadhar) && !isTrue(shopImage) && !isTrue(bankVerification)) {
      return res.failure({ 
        message: 'No KYC data specified to revert. Please provide at least one of: pan, aadhar, shopImage, bankVerification with value true or "true"' 
      });
    }

    // Revert PAN verification
    if (isTrue(pan)) {
      revertedItems.pan = true;
      // Delete PAN images from S3
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

      // Update user fields
      updateData.panVerify = false;
      updateData.panCardFrontImage = null;
      updateData.panCardBackImage = null;
      updateData.panDetails = null;

      // Delete PAN document from digilocker using destroy
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
      // Delete Aadhaar images from S3
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

      // Update user fields
      updateData.aadharVerify = false;
      updateData.aadharFrontImage = null;
      updateData.aadharBackImage = null;
      updateData.aadharDetails = null;

      // Delete Aadhaar document from digilocker using destroy
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
      // Get outlet
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

        // Update outlet
        await dbService.update(
          model.outlet,
          { id: outlet.id },
          { shopImage: null, shopImageVerify: false }
        );
      }

      // Update user fields
      updateData.shopDetailsVerify = false;
      
      revertMessages.push('Shop image has been reverted');
    }

    // Revert bank verification
    if (isTrue(bankVerification)) {
      revertedItems.bankVerification = true;
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

      if (customerBank) {
        // Delete customerBank record
        await dbService.destroy(model.customerBank, {
          id: customerBank.id,
          companyId: companyId
        });
      }

      // Update user fields
      updateData.bankDetailsVerify = false;
      updateData.nameSimilarity = null;
      
      revertMessages.push('Bank verification has been reverted');
    }

    // Wait for all image deletions to complete
    await Promise.all(revertOperations);

    // Update user if any fields need to be reverted
    if (Object.keys(updateData).length > 0) {
      updateData.updatedBy = req.user.id;
      
      await dbService.update(
        model.user,
        { id, companyId },
        updateData
      );

      // Recalculate KYC status
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

      // Reload user to get updated data
      const updatedUser = await dbService.findOne(model.user, {
        id,
        companyId
      });

      const kycInfo = calculateKycStatus(updatedUser, outlet, customerBank, aadhaarDoc, panDoc);

      // Update KYC status
      await dbService.update(
        model.user,
        { id, companyId },
        {
          kycStatus: kycInfo.kycStatus,
          kycSteps: kycInfo.kycSteps
        }
      );

      // Get company for logo
      const company = await dbService.findOne(model.company, {
        id: companyId,
        isDeleted: false
      });

      // Reload user to get latest email
      const userForEmail = await dbService.findOne(model.user, {
        id,
        companyId
      });

      // Send email notifications if user has email
      if (userForEmail && userForEmail.email) {
        const backendUrl = process.env.BASE_URL || 'https://api-dev.gmaxepay.in';
        const logoUrl = company?.logo ? imageService.getImageUrl(company.logo) : `${backendUrl}/gmaxepay.png`;
        
        try {
          // Send email for PAN revert
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

          // Send email for Aadhaar revert
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

          // Send email for shop image revert
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

          // Send email for bank verification revert
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
          // Continue even if email fails
        }
      }
    }

    // Build success message
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

const uploadBankDetailsForUser = async (req, res) => {
  try {
    // Check if user is super admin
    const userRole = req.user.userRole;
    const userCompanyId = req.user.companyId;
    const userId = req.user.id;
    if (!(userRole === 1 && userCompanyId === 1)) {
      return res.failure({ message: 'Only super admin can upload bank details for users' });
    }

    const {  account_number, ifsc } = req.body || {};

    if (!userId) {
      return res.failure({ message: 'User ID is required' });
    }
    if (!account_number) {
      return res.failure({ message: 'Account number is required' });
    }
    if (!ifsc) {
      return res.failure({ message: 'IFSC is required' });
    }

    // Find the target user
    const targetUser = await dbService.findOne(model.user, {
      id: userId,
      isDeleted: false
    });

    if (!targetUser) {
      return res.failure({ message: 'User not found' });
    }

    const companyId = targetUser.companyId;

    // Encrypt the request data
    const encryptionKey = Buffer.from(key, 'hex');
    const requestData = { account_number, ifsc };
    const encryptedRequest = doubleEncrypt(JSON.stringify(requestData), encryptionKey);

    // Check if bank details already exist in our database
    const existingBank = await dbService.findOne(model.ekycHub, {
      identityNumber1: account_number,
      identityNumber2: ifsc,
      identityType: 'BANK'
    });

    let bankVerification;

    if (existingBank) {
      try {
        const encryptedData = JSON.parse(existingBank.response);

        if (encryptedData && encryptedData.encrypted) {
          const decryptedResponse = decrypt(encryptedData, Buffer.from(key, 'hex'));
          bankVerification = decryptedResponse ? JSON.parse(decryptedResponse) : encryptedData;
        } else {
          bankVerification = JSON.parse(existingBank.response);
        }
      } catch (e) {
        console.error('Error parsing cached bank verification:', e.message);
        bankVerification = existingBank.response;
      }
    } else {
      bankVerification = await ekycHub.bankVerification(account_number, ifsc);

      if (bankVerification && bankVerification.status === 'Success') {
        const encryptedResponse = doubleEncrypt(JSON.stringify(bankVerification), encryptionKey);

        await dbService.createOne(model.ekycHub, {
          identityNumber1: account_number,
          identityNumber2: ifsc,
          request: JSON.stringify(encryptedRequest),
          response: JSON.stringify(encryptedResponse),
          identityType: 'BANK',
          companyId: companyId || null,
          addedBy: req.user.id
        });
      }
    }

    if (!bankVerification || bankVerification.status !== 'Success') {
      console.error('Bank verification failed - Status:', bankVerification?.status);
      return res.failure({ message: 'Bank verification failed' });
    }

    let razorpayBankData = null;
    try {
      razorpayBankData = await razorpayApi.bankDetails(ifsc);
    } catch (error) {
      console.error('Error fetching bank details from Razorpay:', error);
    }

    const bankName = (razorpayBankData && razorpayBankData.BANK)
      ? razorpayBankData.BANK
      : (bankVerification.bank_name || bankVerification.bankName || null);

    const beneficiaryName = bankVerification.nameAtBank
      || bankVerification.beneficiary_name
      || bankVerification.beneficiaryName
      || bankVerification['nameAtBank']
      || null;

    const accountNumber = bankVerification.account_number || bankVerification['Account Number'] || account_number;

    const city = (razorpayBankData && razorpayBankData.CITY)
      ? razorpayBankData.CITY
      : (bankVerification.city || null);
    const branch = (razorpayBankData && razorpayBankData.BRANCH)
      ? razorpayBankData.BRANCH
      : (bankVerification.branch || null);


    // Check if bank details already exist for this user
    const existingCustomerBank = await dbService.findOne(model.customerBank, {
      refId: userId,
      companyId: companyId
    });

    const payload = {
      refId: userId,
      companyId: companyId,
      bankName,
      beneficiaryName: beneficiaryName || targetUser.name,
      accountNumber,
      ifsc,
      city: city || null,
      branch: branch || null,
      isActive: true,
      isPrimary: true
    };

    let customerBank;
    if (existingCustomerBank) {
      customerBank = await dbService.update(model.customerBank, {
        id: existingCustomerBank.id
      }, payload);
    } else {
      customerBank = await dbService.createOne(model.customerBank, payload);
    }

    // Update user's bank verification status
    await dbService.update(model.user, {
      id: userId,
      companyId: companyId,
      isDeleted: false
    }, {
      bankDetailsVerify: true
    });

    return res.success({
      message: 'Bank details uploaded successfully',
      data: {
        customerBank: customerBank,
        bankVerification: {
          status: bankVerification.status,
          bankName: bankName,
          beneficiaryName: beneficiaryName
        }
      }
    });
  } catch (error) {
    console.error('Error uploading bank details:', error);
    return res.internalServerError({ message: error.message });
  }
};

const getCompanyAdminById = async (req, res) => {
  try {
    const { id } = req.params;
    if(req.user.userRole !== 1 && req.user.companyId !== 1){
      return res.failure({ message: 'Access Denied due to insufficient permissions' });
    }
    const existingUser = await dbService.findOne(model.user, { id,  userRole: 2 });
    if (!existingUser) {
      return res.failure({ message: 'Company admin not found' });
    }
    const companyDetails = await dbService.findOne(model.company, { id: existingUser.companyId });
    if (!companyDetails) {
      return res.failure({ message: 'Company not found' });
    }

    const [outletDetails, companyBankDetails] = await Promise.all([
      dbService.findOne(model.outlet, { refId: existingUser.id, companyId: companyDetails.id }),
      dbService.findAll(model.customerBank, { refId: existingUser.id, companyId: companyDetails.id })
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
    console.log("AadhaarDetails", existingUser?.aadharDetails);
    console.log("PanDetails", existingUser?.panDetails);
    console.log("AadhaarDetails", JSON.stringify(existingUser?.aadharDetail,null,2));
    console.log("PanDetails", JSON.stringify(existingUser?.panDetails,null,2));
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
      companyDetails: companyDetails
        ? {
          companyId: companyDetails.id,
          companyName: companyDetails.companyName,
          compnyPan: companyDetails.companyPan,
          companyDomain: `https://${companyDetails.customDomain}`,
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
        city: bank.city,
        branch: bank.branch
      }))
    }
    return res.success({ message: 'Company admin fetched successfully', data: response });
  } catch (error) {
    console.error('Error fetching company admin:', error);
    return res.internalServerError({ message: error.message });
  }
};

module.exports = {
  createUser,
  findAllUsers,
  getUser,
  updateUser,
  deleteUser,
  unlockAccount,
  getKycVerificationStatus,
  getCompleteKycData,
  revertKycData,
  uploadBankDetailsForUser,
  getCompanyAdminById
};