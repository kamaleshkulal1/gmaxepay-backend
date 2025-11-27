const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op, Sequelize } = require('sequelize');
const imageService = require('../../../services/imageService');
const emailService = require('../../../services/emailService');

/**
 * @description : create record of User in SQL table.
 * @param {Object} req : request including body for creating record.
 * @param {Object} res : response of created record.
 * @return {Object} : created User. {status, message, data}
 */

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
    // Only filter if userRole is explicitly provided in query
    if (query.userRole) {
      // userRole is already in query from dataToFind.query
    } else {
      // If no userRole specified, filter by allowed roles
      query.userRole = { [Op.in]: [2, 3, 4, 5] };
    }

    // Apply company filter
    const userRole = req.user.userRole;
    const userCompanyId = req.user.companyId;
    if (userRole === 1 && userCompanyId === 1) {
      // Don't filter by companyId - show all users
    } else {
      // Filter by companyId for userRole = 2 or other cases
      const companyId = req.companyId || userCompanyId;
      query.companyId = companyId;
    }

    // Handle kycStatus filter - map "pending" and "completed" to actual status values
    if (query.kycStatus) {
      const kycStatusValue = query.kycStatus;
      
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

    // Include company and wallet information
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

    // Transform the response
    const transformedData = foundUsers.data.map((user, index) => {
      const userData = user.toJSON ? user.toJSON() : user;
      const companyData = userData.company || {};
      const walletData = userData.wallet || {};

      // Determine KYC Status
      const kycStatus = userData.kycStatus === 'FULL_KYC' ? 'completed' : 'pending';

      // Get KYC Details
      const kycDetails = {
        kycStatus: userData.kycStatus || 'NO_KYC',
        kycSteps: userData.kycSteps || 0,
        mobileVerify: userData.mobileVerify || false,
        emailVerify: userData.emailVerify || false,
        aadharVerify: userData.aadharVerify || false,
        panVerify: userData.panVerify || false,
        shopDetailsVerify: userData.shopDetailsVerify || false,
        imageVerify: userData.imageVerify || false,
        profileImageWithShopVerify: userData.profileImageWithShopVerify || false,
        bankDetailsVerify: userData.bankDetailsVerify || false
      };

      // Format userAgentCode with correct prefix based on role
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
        kycStatus: kycStatus,
        kycSteps: userData.kycSteps || 0,
        status: userData.isActive ? 'Active' : 'Inactive',
        kycDetails: kycDetails,
        wallet: {
          mainWallet: walletData.mainWallet || 0,
          apesWallet: walletData.apesWallet || 0
        }
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
    const companyId = req.companyId;

    let foundUser = await dbService.findOne(model.user, {
      id,
      companyId
    });
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
    const companyId = req.companyId;
    let dataToUpdate = { ...(req.body || {}) };
    dataToUpdate = {
      ...dataToUpdate,
      updatedBy: req.user.id,
      type: req.user.userType
    };

    let updatedUser = await dbService.update(
      model.user,
      { id, companyId },
      dataToUpdate
    );
    if (!updatedUser) {
      return res.failure({ message: 'Update User failed' });
    }
    return res.success({
      message: 'User Updated Successfully',
      data: updatedUser
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
    const companyId = req.companyId;

    let deletedUser = await dbService.destroy(model.user, { id, companyId });
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

/**
 * @description : Unlock user account if it's locked
 * @param {Object} req : request including user id
 * @param {Object} res : response
 * @return {Object} : {status, message, data}
 */
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

    // Get Sequelize instance to check lock status
    const userInstance = await dbService.findOne(model.user, { 
      id, 
      companyId,
      isActive: true 
    });

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
    const updatedUser = await dbService.findOne(model.user, {
      id,
      companyId
    });

    // Get company for logo
    const company = await dbService.findOne(model.company, {
      id: companyId,
      isDeleted: false
    });

    // Send unlock email if user has email
    if (updatedUser.email) {
      try {
        const backendUrl = process.env.AWS_CDN_URL || 'https://assets.gmaxepay.in';
        const logoUrl = company?.logo ? imageService.getImageUrl(company.logo) : `${backendUrl}/gmaxepay.png`;
        const unlockIllustrationUrl = `${backendUrl}/unlockuser.png`;

        // Send email using tempPasswordEmail template (which supports illustration)
        await emailService.sendTempPasswordEmail({
          to: updatedUser.email,
          userName: updatedUser.name || 'User',
          tempPassword: '', // Not needed for unlock email, template will handle it
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

/**
 * @description : Get KYC verification status for a specific user
 * @param {Object} req : request including user id
 * @param {Object} res : response
 * @return {Object} : {status, message, data}
 */
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

    // Get image URLs helper
    const getImageUrl = (imageData, isProfileImage = false) => {
      if (!imageData) return null;
      const plainKey = extractS3Key(imageData);
      if (!plainKey) return null;
      return imageService.getImageUrl(plainKey, !isProfileImage);
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
      aadharFrontImage: getImageUrl(foundUser.aadharFrontImage, false),
      aadharBackImage: getImageUrl(foundUser.aadharBackImage, false),
      panCardFrontImage: getImageUrl(foundUser.panCardFrontImage, false),
      panCardBackImage: getImageUrl(foundUser.panCardBackImage, false),
      profileImage: getImageUrl(foundUser.profileImage, true)
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

/**
 * @description : Get complete KYC data for a user
 * @param {Object} req : request including user id
 * @param {Object} res : response
 * @return {Object} : {status, message, data}
 */
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

    // Get image URLs helper
    const getImageUrl = (imageData, isProfileImage = false) => {
      if (!imageData) return null;
      const plainKey = extractS3Key(imageData);
      if (!plainKey) return null;
      return imageService.getImageUrl(plainKey, !isProfileImage);
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
      return imageService.getImageUrl(plainKey, true);
    };

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
        profileImage: getImageUrl(foundUser.profileImage, true),
        aadharFrontImage: getImageUrl(foundUser.aadharFrontImage, false),
        aadharBackImage: getImageUrl(foundUser.aadharBackImage, false),
        panCardFrontImage: getImageUrl(foundUser.panCardFrontImage, false),
        panCardBackImage: getImageUrl(foundUser.panCardBackImage, false)
      },
      outletDetails: outlet ? {
        outletId: outlet.id,
        shopName: outlet.shopName,
        shopAddress: outlet.shopAddress,
        gstNo: outlet.gstNo,
        mobileNo: outlet.mobileNo,
        zipCode: outlet.zipCode,
        shopImage: getShopImageUrl(outlet.shopImage)
      } : null,
      customerBankDetails: customerBank ? {
        customerBankId: customerBank.id,
        accountNumber: customerBank.accountNumber,
        ifsc: customerBank.ifsc,
        bankName: customerBank.bankName,
        beneficiaryName: customerBank.beneficiaryName
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

/**
 * @description : Revert/Delete KYC data for a user
 * @param {Object} req : request including user id and KYC types to revert
 * @param {Object} res : response
 * @return {Object} : {status, message, data}
 */
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

    const revertOperations = [];
    const updateData = {};

    // Revert PAN verification
    if (pan === true || pan === 'true') {
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
    }

    // Revert Aadhaar verification
    if (aadhar === true || aadhar === 'true') {
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
    }

    // Revert shop image
    if (shopImage === true || shopImage === 'true') {
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
    }

    // Revert bank verification
    if (bankVerification === true || bankVerification === 'true') {
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
        const backendUrl = process.env.AWS_CDN_URL || 'https://assets.gmaxepay.in';
        const logoUrl = company?.logo ? imageService.getImageUrl(company.logo) : `${backendUrl}/gmaxepay.png`;
        
        try {
          // Send email for PAN revert
          if (pan === true || pan === 'true') {
            const resetPanIllustrationUrl = `${backendUrl}/resetPan.png`;
            await emailService.sendTempPasswordEmail({
              to: userForEmail.email,
              userName: userForEmail.name || 'User',
              tempPassword: '', // Not needed for revert notification
              logoUrl: logoUrl,
              illustrationUrl: resetPanIllustrationUrl
            });
          }

          // Send email for Aadhaar revert
          if (aadhar === true || aadhar === 'true') {
            const resetAadhaarIllustrationUrl = `${backendUrl}/resetAadhaar.png`;
            await emailService.sendTempPasswordEmail({
              to: userForEmail.email,
              userName: userForEmail.name || 'User',
              tempPassword: '', // Not needed for revert notification
              logoUrl: logoUrl,
              illustrationUrl: resetAadhaarIllustrationUrl
            });
          }
        } catch (emailError) {
          console.error('Error sending KYC revert email:', emailError);
          // Continue even if email fails
        }
      }
    }

    return res.success({
      message: 'KYC data reverted successfully',
      data: {
        reverted: {
          pan: pan === true || pan === 'true',
          aadhar: aadhar === true || aadhar === 'true',
          shopImage: shopImage === true || shopImage === 'true',
          bankVerification: bankVerification === true || bankVerification === 'true'
        }
      }
    });
  } catch (error) {
    console.error('Error reverting KYC data:', error);
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
  revertKycData
};