const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const bcrypt = require('bcrypt');
const moment = require('moment');
const random = require('../../../utils/common');
const amezesmsApi = require('../../../services/amezesmsApi');
const { JWT } = require('../../../constants/authConstant');
const emailService = require('../../../services/emailService');
const imageService = require('../../../services/imageService');
const ekycHub = require('../../../services/eKycHub');
const { doubleEncrypt, decrypt: doubleDecrypt } = require('../../../utils/doubleCheckUp');
const { encrypt, decrypt } = require('../../../utils/encryption');
const googleMap = require('../../../services/googleMap');
const llmService = require('../../../services/llmService');
const textractService = require('../../../services/textractService');
const rekognitionService = require('../../../services/rekognitionService');
const razorpayApi = require('../../../services/razorpayApi');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const key = Buffer.from(process.env.AES_KEY, 'hex');
const { generateUniqueReferCode } = require('../../../utils/generateUniqueReferCode');
const { generateUserToken, decryptUserToken } = require('../../../utils/userToken');

const getCompanyFromHeaders = async (req) => {
  const companyId = req.get('x-company-id');
  const domain = req.get('x-company-domain') || '';
  
  if (!companyId) {
    return { error: 'x-company-id header is required' };
  }

  const company = await dbService.findOne(model.company, { 
    id: companyId, 
    isDeleted: false 
  });

  if (!company) {
    return { error: 'Company not found' };
  }
  if(company.customDomain != '' && company.customDomain != domain) {
    return { error: 'Invalid domain' };
  }

  // Validate domain if provided
  if (domain) {
    const companyDomain = (company.customDomain || '').toString().trim().toLowerCase();
    const requestedDomain = domain.toString().trim().toLowerCase();

    if (companyDomain && companyDomain !== requestedDomain) {
      return { error: 'Invalid domain' };
    }
  }
  return { company, companyId };
};

const loadUserContext = async (req, companyId) => {
  const userToken = req.get('token');
  
  if (!userToken) {
    return { error: 'token header is required' };
  }

  const tokenData = decryptUserToken(userToken);
  if (!tokenData || !tokenData.userId) {
    return { error: 'Invalid or expired user token' };
  }

  const userId = parseInt(tokenData.userId, 10);
  
  if (isNaN(userId)) {
    return { error: 'Invalid user ID in token' };
  }

  const existingUser = await dbService.findOne(model.user, { 
    id: userId, 
    companyId: companyId,
    isDeleted: false 
  });

  if (!existingUser) {
    return { error: 'User not found' };
  }

  const user = {
    id: existingUser.id,
    userRole: existingUser.userRole,
    mobileVerify: existingUser.mobileVerify,
    aadharVerify: existingUser.aadharVerify,
    shopDetailsVerify: existingUser.shopDetailsVerify,
    isAadharUploaded: existingUser.isAadharUploaded,
    isPanUploaded: existingUser.isPanUploaded,
    panVerify: existingUser.panVerify,
    imageVerify: existingUser.imageVerify,
    emailVerify: existingUser.emailVerify,
    profileImageWithShopVerify: existingUser.profileImageWithShopVerify,
    bankDetailsVerify: existingUser.bankDetailsVerify,
    aadharDetails: existingUser.aadharDetails,
    mobileNo: existingUser.mobileNo,
    email: existingUser.email,
    name: existingUser.name,
    profileImage: existingUser.profileImage,
    aadharFrontImage: existingUser.aadharFrontImage,
    aadharBackImage: existingUser.aadharBackImage,
    panCardFrontImage: existingUser.panCardFrontImage,
    panCardBackImage: existingUser.panCardBackImage
  };

  const outlet = await dbService.findOne(model.outlet, { 
    refId: user.id, 
    companyId: companyId 
  });

  const customer = await dbService.findOne(model.customer, {
    mobile: user.mobileNo
  });
  
  let customerBank = null;
  if (customer) {
    customerBank = await dbService.findOne(model.customerBank, { refId: customer.id, companyId: companyId });
  }
  // Fallback: try with user.id for backward compatibility with old data
  if (!customerBank) {
    customerBank = await dbService.findOne(model.customerBank, { refId: user.id, companyId: companyId });
  }

  const [aadhaarDoc, panDoc] = await Promise.all([
    dbService.findOne(model.digilockerDocument, {
      refId: user.id,
      companyId: companyId,
      documentType: 'AADHAAR',
      isDeleted: false
    }),
    dbService.findOne(model.digilockerDocument, {
      refId: user.id,
      companyId: companyId,
      documentType: 'PAN',
      isDeleted: false
    })
  ]);

  const getImageUrl = (imageData, isProfileImage = false) => {
    if (!imageData) return null;
    const extractKey = (data) => {
      if (typeof data === 'object' && data?.key) return data.key;
      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          return parsed.key || data;
        } catch {
          return data;
        }
      }
      return data;
    };
    const plainKey = extractKey(imageData);
    if (!plainKey) return null;
    return imageService.getImageUrl(plainKey, !isProfileImage);
  };

  const userDetails = {
    userId: user.id,
    mobileVerify: user.mobileVerify,
    emailVerify: user.emailVerify,
    aadharVerify: user.aadharVerify,
    panVerify: user.panVerify,
    mobileNo: user.mobileNo,
    bankDetailsVerify: user.bankDetailsVerify,
    email: user.email,
    isAadharUploaded: user.isAadharUploaded,
    isPanUploaded: user.isPanUploaded,
    profileImage: getImageUrl(user.profileImage, true), // true = is profile image, use simple CDN
    aadharFrontImage: getImageUrl(user.aadharFrontImage, false),
    aadharBackImage: getImageUrl(user.aadharBackImage, false),
    panCardFrontImage: getImageUrl(user.panCardFrontImage, false),
    panCardBackImage: getImageUrl(user.panCardBackImage, false),
    shopDetailsVerify: user.shopDetailsVerify,
    profileImageWithShopVerify: user.profileImageWithShopVerify
  };

  const getSecureShopImageUrl = (shopImage) => {
    if (!shopImage) return null;
    const extractKey = (data) => {
      if (typeof data === 'object' && data?.key) return data.key;
      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          return parsed.key || data;
        } catch {
          return data;
        }
      }
      return data;
    };
    const plainKey = extractKey(shopImage);
    if (!plainKey) return null;
    return imageService.getImageUrl(plainKey, true); // true = use secure proxy
  };

  const outletDetails = outlet ? {
    outletId: outlet.id || null,
    shopName: outlet.shopName,
    shopAddress: outlet.shopAddress,
    gstNo: outlet.gstNo,
    mobileNo: outlet.mobileNo,
    zipCode: outlet.zipCode,
    shopImage: getSecureShopImageUrl(outlet.shopImage)
  } : null;

  const customerBankDetails = customerBank ? {
    customerBankId: customerBank.id,
    accountNumber: customerBank.accountNumber,
    ifsc: customerBank.ifsc,
    branch: customerBank.branch || null,
  } : null;

  return { user, outlet, customerBank, userDetails, outletDetails, customerBankDetails, aadhaarDoc, panDoc, customer };
};

// Helper function to extract S3 key from JSON field
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

const getPendingSteps = (ctx) => {
  const userDetails = ctx.userDetails || ctx.user || {};
  const user = ctx.user || {};
  const outletDetails = ctx.outletDetails || ctx.outlet || null;
  const customerBankDetails = ctx.customerBankDetails || ctx.customerBank || null;
  const aadhaarDoc = ctx.aadhaarDoc || null;
  const panDoc = ctx.panDoc || null;
  
  // Get image fields from userDetails or user
  const aadharFrontImage = userDetails?.aadharFrontImage || ctx.user?.aadharFrontImage;
  const aadharBackImage = userDetails?.aadharBackImage || ctx.user?.aadharBackImage;
  const panCardFrontImage = userDetails?.panCardFrontImage || ctx.user?.panCardFrontImage;
  const panCardBackImage = userDetails?.panCardBackImage || ctx.user?.panCardBackImage;
  
  // Check Aadhaar sub-steps
  const aadhaarConnect = !!(aadhaarDoc && aadhaarDoc.verificationId);
  const aadhaarDownload = !!(aadhaarDoc && aadhaarDoc.name); // If name exists, document is downloaded
  const aadhaarFrontImageKey = extractS3Key(aadharFrontImage);
  const aadhaarBackImageKey = extractS3Key(aadharBackImage);
  const aadhaarUpload = !!(user.isAadharUploaded);
  
  // Check PAN sub-steps
  const panConnect = !!(panDoc && panDoc.verificationId);
  const panDownload = !!(panDoc && panDoc.panNumber); // If panNumber exists, document is downloaded
  const panFrontImageKey = extractS3Key(panCardFrontImage);
  const panBackImageKey = extractS3Key(panCardBackImage);
  const panUpload = !!(user.isPanUploaded);
  
  // Check if verification is done via user flags (for manual verification)
  const aadharVerifyFlag = !!(user.isAadharUploaded || userDetails.isAadharUploaded);
  const panVerifyFlag = !!(user.isPanUploaded || userDetails.isPanUploaded);
  
  // If verification flag is set, mark all sub-steps as done
  const aadhaarSubSteps = [
    { key: 'connect', label: 'Connect Aadhaar', done: aadharVerifyFlag || aadhaarConnect },
    { key: 'download', label: 'Download Aadhaar', done: aadharVerifyFlag || aadhaarDownload },
    { key: 'upload', label: 'Upload Aadhaar Images', done: aadharVerifyFlag || aadhaarUpload }
  ];
  
  const panSubSteps = [
    { key: 'connect', label: 'Connect PAN', done: panVerifyFlag || panConnect },
    { key: 'download', label: 'Download PAN', done: panVerifyFlag || panDownload },
    { key: 'upload', label: 'Upload PAN Images', done: panVerifyFlag || panUpload }
  ];
  
  // Aadhaar is done if: verification flag is set OR all Digilocker steps are complete
  const aadhaarAllDone = aadharVerifyFlag || (aadhaarConnect && aadhaarDownload && aadhaarUpload);
  // PAN is done if: verification flag is set OR all Digilocker steps are complete
  const panAllDone = panVerifyFlag || (panConnect && panDownload && panUpload);
  
  // Check shop details verification using shopDetailsVerify field from user
  const shopDetailsDone = !!(user.shopDetailsVerify || userDetails?.shopDetailsVerify);
  
  // Check bank verification using bankDetailsVerify field from user AND customerBankDetails
  const bankDetailsDone = !!(user.bankDetailsVerify || userDetails?.bankDetailsVerify) || 
                          !!(customerBankDetails && customerBankDetails.accountNumber && customerBankDetails.ifsc && customerBankDetails.branch);
  
  const profileVerified = !!(user.profileImageWithShopVerify || userDetails?.profileImageWithShopVerify);
  
  const steps = [
    { key: 'mobileVerification', label: 'Mobile verification', done: !!userDetails?.mobileVerify },
    { key: 'emailVerification', label: 'Email verification', done: !!userDetails?.emailVerify },
    { 
      key: 'aadharVerification', 
      label: 'Aadhaar verification', 
      done: aadhaarAllDone,
      subSteps: aadhaarSubSteps
    },
    { 
      key: 'panVerification', 
      label: 'PAN verification', 
      done: panAllDone,
      subSteps: panSubSteps
    },
    { key: 'shopDetails', label: 'Shop/outlet details', done: shopDetailsDone },
    { key: 'bankVerification', label: 'Bank verification', done: bankDetailsDone },
    { key: 'profile', label: 'Profile setup', done: profileVerified }
  ];
  const pending = steps.filter(s => !s.done).map(s => s.key);
  return { steps, pending, allCompleted: pending.length === 0 };
};

// Calculate KYC status and steps based on completed steps
const calculateKycStatus = (ctx) => {
  const pendingInfo = getPendingSteps(ctx);
  const completedSteps = pendingInfo.steps.filter(s => s.done).length;
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

// Generate temporary password (8-digit numeric)
const generateTempPassword = () => {
  const numbers = '0123456789';
  let password = '';
  
  // Generate 8 random digits
  for (let i = 0; i < 8; i++) {
    password += numbers[Math.floor(Math.random() * numbers.length)];
  }
  
  return password;
};

// Helper function to update KYC status after step completion
const updateKycStatus = async (userId, companyId, ctx) => {
  try {
    // Reload user and context to get latest data
    const user = await dbService.findOne(model.user, { id: userId, companyId: companyId, isDeleted: false });
    if (!user) return;
    
    // Get latest context data
    const outlet = await dbService.findOne(model.outlet, { refId: userId, companyId: companyId });
    const customer = await dbService.findOne(model.customer, { mobile: user.mobileNo });
    let customerBank = null;
    if (customer) {
      customerBank = await dbService.findOne(model.customerBank, { refId: customer.id, companyId: companyId });
    }
    if (!customerBank) {
      customerBank = await dbService.findOne(model.customerBank, { refId: userId, companyId: companyId });
    }
    const [aadhaarDoc, panDoc] = await Promise.all([
      dbService.findOne(model.digilockerDocument, {
        refId: userId,
        companyId: companyId,
        documentType: 'AADHAAR',
        isDeleted: false
      }),
      dbService.findOne(model.digilockerDocument, {
        refId: userId,
        companyId: companyId,
        documentType: 'PAN',
        isDeleted: false
      })
    ]);
    
    // Calculate KYC status
    const kycInfo = calculateKycStatus({
      user: user,
      outlet: outlet,
      customerBank: customerBank,
      aadhaarDoc: aadhaarDoc || ctx?.aadhaarDoc,
      panDoc: panDoc || ctx?.panDoc
    });
    
    // Update KYC status and steps
    await dbService.update(model.user, { id: userId }, {
      kycStatus: kycInfo.kycStatus,
      kycSteps: kycInfo.kycSteps
    });
    
    return kycInfo;
  } catch (error) {
    return null;
  }
};

// Helper function to revert KYC verification on failure
const revertKycVerification = async (userId, companyId, kycType) => {
  try {
    const user = await dbService.findOne(model.user, { id: userId, companyId: companyId, isDeleted: false });
    if (!user) return;

    const updateData = {};
    
    if (kycType === 'pan') {
      // Revert PAN verification
      updateData.panVerify = false;
      
      // Delete PAN digilocker document
      const panDoc = await dbService.findOne(model.digilockerDocument, {
        refId: userId,
        companyId: companyId,
        documentType: 'PAN',
        isDeleted: false
      });

      if (panDoc) {
        await dbService.update(
          model.digilockerDocument,
          { id: panDoc.id },
          { isDeleted: true }
        );
      }
    } else if (kycType === 'aadhar' || kycType === 'aadhaar') {
      // Revert Aadhaar verification
      updateData.aadharVerify = false;
      
      // Delete Aadhaar digilocker document
      const aadhaarDoc = await dbService.findOne(model.digilockerDocument, {
        refId: userId,
        companyId: companyId,
        documentType: 'AADHAAR',
        isDeleted: false
      });

      if (aadhaarDoc) {
        await dbService.update(
          model.digilockerDocument,
          { id: aadhaarDoc.id },
          { isDeleted: true }
        );
      }
    }

    // Update user if any fields need to be reverted
    if (Object.keys(updateData).length > 0) {
      await dbService.update(model.user, { id: userId, companyId: companyId }, updateData);
      
      // Recalculate and update KYC status
      await updateKycStatus(userId, companyId, {});
    }
  } catch (error) {
  }
};

// Initial Step ReferCode
const postReferCode = async (req, res) => {
  try {
    const companyCtx = await getCompanyFromHeaders(req);
    if (companyCtx.error) {
      return res.failure({ message: companyCtx.error });
    }
    const { referCode } = req.body || {};
    if (!referCode) {
      return res.failure({ message: 'Refer Code is required' });
    }
    const { companyId } = companyCtx;
    
    // Encrypt referCode before querying (since it's stored encrypted in database)
    let encryptedReferCode;
    try {
      encryptedReferCode = encrypt(referCode);
    } catch (error) {
      return res.failure({ message: 'Invalid Refer Code format' });
    }
    
    const referCodeData = await dbService.findOne(model.user, { 
      referCode: encryptedReferCode, 
      companyId: companyId 
    });
    
    if (!referCodeData) {
      return res.failure({ message: 'Invalid Refer Code' });
    }
    
    // referCode is automatically decrypted by the model's afterFind hook
    return res.success({ message: 'Refer Code is valid', data: referCodeData.referCode });
  }
  catch (error) {
    return res.failure({ message: 'Failed to post Refer Code', error: error.message });
  }
};

const  validateReferralCodeAndDetermineRole = async (referCode, companyId, company) => {
  // If no referral code provided, default to Retailer (userRole = 5)
  if (!referCode || referCode.trim() === '') {
    return {
      userRole: 5, // Retailer
      parentId: null,
      error: null
    };
  }

  const trimmedReferCode = referCode.trim();

  // Encrypt the input referCode to search in database (referCode is stored encrypted)
  let encryptedReferCode;
  try {
    encryptedReferCode = encrypt(trimmedReferCode);
  } catch (error) {
    return {
      userRole: null,
      parentId: null,
      error: 'Invalid referral code format'
    };
  }

  // First, check if it's a company admin referral code
  // Find company admin user (userRole = 2) for this company with matching referCode
  const companyAdmin = await dbService.findOne(model.user, {
    companyId: companyId,
    userRole: 2, 
    isDeleted: false,
    referCode: encryptedReferCode
  });

  if (companyAdmin) {
    // Verify the decrypted referCode matches (model hook should have decrypted it)
    let companyReferCode = companyAdmin.referCode;
    // If model hook didn't decrypt it (shouldn't happen, but handle edge case)
    try {
      if (companyReferCode && (companyReferCode.length > 20 || /^[0-9a-f]{32,}$/i.test(companyReferCode))) {
        companyReferCode = decrypt(companyReferCode);
      }
    } catch (e) {
      // If decryption fails, assume it's already decrypted
      console.error('Error decrypting company admin referCode:', e);
    }
    
    // Double-check the decrypted code matches
    if (companyReferCode === trimmedReferCode) {
      // Company referral code matched
      // Note: reportingTo field references user.id, not company.id
      // For company referral, we'll set reportingTo to companyAdmin.id (the company admin user)
      // This maintains the referral relationship while using the existing field structure
      return {
        userRole: 3, // Master Distributor
        parentId: companyAdmin.id, // Use company admin's user ID as parentId
        isCompanyReferral: true, // Flag to indicate this is a company referral
        error: null
      };
    }
  }

  // Search for user with matching encrypted referral code within the same company
  // The model hook will automatically decrypt referCode when we fetch the user
  const refOwner = await dbService.findOne(
    model.user,
    { 
      companyId: companyId,
      isDeleted: false,
      referCode: encryptedReferCode
    },
    { attributes: ['id', 'referCode', 'userRole', 'companyId'] }
  );

  // Verify the decrypted referCode matches (model hook should have decrypted it)
  if (refOwner && refOwner.referCode) {
    let decryptedReferCode = refOwner.referCode;
    // If model hook didn't decrypt it (shouldn't happen, but handle edge case)
    try {
      if (decryptedReferCode && (decryptedReferCode.length > 20 || /^[0-9a-f]{32,}$/i.test(decryptedReferCode))) {
        decryptedReferCode = decrypt(decryptedReferCode);
      }
    } catch (e) {
      // If decryption fails, assume it's already decrypted
      console.error('Error decrypting user referCode:', e);
    }
    
    // Double-check the decrypted code matches
    if (decryptedReferCode !== trimmedReferCode) {
      return {
        userRole: null,
        parentId: null,
        error: 'Invalid referral code'
      };
    }
  } else {
    return {
      userRole: null,
      parentId: null,
      error: 'Invalid referral code'
    };
  }

  if (!refOwner) {
    return {
      userRole: null,
      parentId: null,
      error: 'Invalid referral code'
    };
  }

  // Determine role based on refOwner's userRole
  // User roles: 1=Super Admin, 2=Company Admin, 3=Master Distributor, 4=Distributor, 5=Retailer
  let newUserRole;
  if (refOwner.userRole === 2) {
    // Company Admin (userRole = 2) → newUser becomes Master Distributor (3)
    newUserRole = 3;
  } else if (refOwner.userRole === 3) {
    // Master Distributor (userRole = 3) → newUser becomes Retailer (5)
    newUserRole = 5;
  } else if (refOwner.userRole === 4) {
    // Distributor (userRole = 4) → newUser becomes Retailer (5)
    newUserRole = 5;
  } else {
    // Invalid referrer role (only Company Admin, Master Distributor, or Distributor can have referral codes)
    return {
      userRole: null,
      parentId: null,
      error: 'Invalid referral code'
    };
  }

  return {
    userRole: newUserRole,
    parentId: refOwner.id, 
    error: null
  };
};

// Step 1: Mobile verification - Send OTP (for new retailer onboarding)
const sendSmsMobile = async (req, res) => {
  try {
    const companyCtx = await getCompanyFromHeaders(req);
    if (companyCtx.error) {
      return res.failure({ message: companyCtx.error });
    }

    const { companyId, company } = companyCtx;
    const { mobileNo, referCode } = req.body || {};

    // Validate mobile number
    if (!mobileNo || typeof mobileNo !== 'string' || mobileNo.trim() === '') {
      return res.failure({ message: 'Mobile number is required' });
    }

    // Basic mobile number validation (10 digits)
    const cleanMobileNo = mobileNo.trim().replace(/[^0-9]/g, '');
    if (cleanMobileNo.length !== 10) {
      return res.failure({ message: 'Invalid mobile number format' });
    }

    // Validate referral code early (before checking user existence)
    // This ensures invalid referral codes are rejected immediately
    if (referCode && referCode.trim() !== '') {
      const referralValidation = await validateReferralCodeAndDetermineRole(referCode, companyId, company);
      if (referralValidation.error) {
        return res.failure({ message: referralValidation.error });
      }
    }

    // Check if user already exists with this mobile number
    const existingUser = await dbService.findOne(model.user, {
      mobileNo: cleanMobileNo,
      isDeleted: false
    });

    // If user exists, enforce company and role constraints only.
    // Status/steps will be returned AFTER OTP verification, not here.
    if (existingUser) {
      const existingUserCompanyId = Number(existingUser.companyId);
      const requestCompanyId = Number(companyId);

      if (existingUserCompanyId !== requestCompanyId) {
        return res.failure({ message: 'Invalid company' });
      }

      if (existingUser.userRole === 1 || existingUser.userRole === 2) {
        return res.failure({
          message: 'Access denied. This mobile number is registered with an admin account.'
        });
      }
    }

    // Generate OTP
    const code = random.randomNumber(6);
    const hashedCode = await bcrypt.hash(code, 10);
    const expireOTP = moment().add(JWT.OTP_EXPIRES_IN || 180, 'seconds').toISOString();

    // Send SMS first
    const msg = `Dear user, your OTP for account login is ${code}. Team Gmaxepay`;
    let smsResult;
    try {
      smsResult = await amezesmsApi.sendSmsLogin(cleanMobileNo, msg);
      // Check if SMS was sent successfully
      // SMS API might return different response formats, so we check for common error indicators
      if (smsResult && typeof smsResult === 'object') {
        // Check for error status or error message
        if (smsResult.error || (smsResult.status && smsResult.status.toLowerCase() === 'error')) {
          return res.failure({ message: 'Failed to send SMS. Please try again.' });
        }
      }
    } catch (smsError) {
      return res.failure({ message: 'Failed to send SMS. Please try again.' });
    }

    // If user exists (any verification state), update OTP only (don't create new user)
    if (existingUser) {
      // Update existing user's OTP
      await dbService.update(
        model.user,
        { id: existingUser.id },
        { otpMobile: `${hashedCode}~${expireOTP}` }
      );

      // Generate userToken for existing user
      const userToken = generateUserToken(existingUser.id);

      return res.success({ 
        message: 'OTP sent to mobile number successfully', 
        data: { 
          userToken: userToken,
          mobileNo: cleanMobileNo,
          userRole: existingUser.userRole
        } 
      });
    }

    // If user doesn't exist, create new user
    // Validate referral code and determine role/parentId
    const referralValidation = await validateReferralCodeAndDetermineRole(referCode, companyId, company);
    if (referralValidation.error) {
      return res.failure({ message: referralValidation.error });
    }

    const { userRole, parentId } = referralValidation;
    
    // Ensure userRole is only 3, 4, or 5 (not 1 or 2)
    if (userRole === 1 || userRole === 2) {
      return res.failure({ 
        message: 'Invalid user role. Only Master Distributor, Distributor, and Retailer can register.' 
      });
    }
    
    // Note: parentId will be:
    // - null if no referral code (Retailer with no parent)
    // - companyAdmin.id if company referral code used
    // - refOwner.id if user referral code used

    // Generate unique referral code for the new user
    const newUserReferCode = await generateUniqueReferCode(company.companyName);

    // Create user record only after SMS is sent successfully
    const userData = {
      mobileNo: cleanMobileNo,
      companyId: companyId,
      userRole: userRole,
      reportingTo: parentId, // Using reportingTo as parentId
      referCode: userRole != 5 ? newUserReferCode : null,
      otpMobile: `${hashedCode}~${expireOTP}`,
      isActive: true,
      userType: 1,
      isDeleted: false,
      kycStatus: 'NO_KYC',
      kycSteps: 0,
      signupStep: 1,
      mobileVerify: false,
      emailVerify: false,
      aadharVerify: false,
      panVerify: false,
      isLoginOtp: true,
      tokenVersion: 0,
      loggedIn: false,
      companyName: company.companyName, // Pass company name for userId generation (temporary field, not saved to DB)
    };

    const newUser = await dbService.createOne(model.user, userData);

    if (!newUser) {
      return res.failure({ message: 'Failed to create user account' });
    }

    // Create wallet for the new user (only if wallet doesn't exist)
    const existingWallet = await dbService.findOne(model.wallet, {
      refId: newUser.id,
      companyId: companyId
    });

    if (!existingWallet) {
      const walletData = {
        refId: newUser.id,
        companyId: companyId,
        roleType: userRole,
        mainWallet: 0,
        apes1Wallet: 0,
        apes2Wallet: 0,
        isActive: true,
        isDelete: false
      };

      await dbService.createOne(model.wallet, walletData);
    }

    // Generate userToken for new user
    const userToken = generateUserToken(newUser.id);

    return res.success({ 
      message: 'OTP sent to mobile number successfully', 
      data: { 
        userToken: userToken,
        mobileNo: cleanMobileNo,
        userRole: userRole
      } 
    });
  } catch (error) {
    return res.failure({ message: 'Failed to send SMS for mobile', error: error.message });
  }
};

// Step 1: Mobile verification - Verify OTP
const verifySmsOtp = async (req, res) => {
  try {
    const companyCtx = await getCompanyFromHeaders(req);
    if (companyCtx.error) {
      return res.failure({ message: companyCtx.error });
    }

    const { companyId } = companyCtx;
    const userCtx = await loadUserContext(req, companyId);
    if (userCtx.error) {
      return res.failure({ message: userCtx.error });
    }

    const { user, userDetails, outletDetails, customerBankDetails } = userCtx;
    const { otp } = req.body || {};

    if (!otp) {
      return res.failure({ message: 'OTP is required' });
    }

    // Get Sequelize instance to call methods
    const existingUser = await dbService.findOne(model.user, { 
      id: user.id, 
      companyId: companyId,
      isActive: true 
    });
    
    if (!existingUser) {
      return res.failure({ message: 'User not found' });
    }

    if (existingUser.isAccountLocked && existingUser.isAccountLocked()) {
      return res.failure({ message: 'Account is temporarily locked due to multiple invalid attempts. Try again later.' });
    }

    const otpField = existingUser.otpMobile || '';
    const [storedHash, expiresAt] = otpField.split('~');
    
    if (!storedHash || !expiresAt) {
      return res.failure({ message: 'No OTP found. Please request a new OTP.' });
    }

    if (new Date(expiresAt) < new Date()) {
      return res.failure({ message: 'OTP expired. Please request a new OTP.' });
    }

    const isMatch = await bcrypt.compare(otp.toString(), storedHash);
    if (!isMatch) {
      await existingUser.incrementOtpAttempts();
      // Reload user to check lock status after increment
      const updatedUser = await dbService.findOne(model.user, { id: user.id });
      if (updatedUser && updatedUser.isAccountLocked && updatedUser.isAccountLocked()) {
        return res.failure({ message: 'Account locked due to multiple invalid attempts.' });
      }
      return res.failure({ message: 'Invalid OTP' });
    }

    // Success: mark verified, clear OTP, reset attempts
    await dbService.update(model.user, { id: user.id }, { 
      mobileVerify: true, 
      otpMobile: null 
    });
    await existingUser.resetOtpAttempts();

    // Update KYC status
    await updateKycStatus(user.id, companyId, userCtx);

    // Generate userToken after successful verification
    const userToken = generateUserToken(user.id);

    const pendingInfo = getPendingSteps({ 
      userDetails: { ...userDetails, mobileVerify: true }, 
      outletDetails, 
      customerBankDetails,
      aadhaarDoc: userCtx.aadhaarDoc,
      panDoc: userCtx.panDoc
    });

    return res.success({ 
      message: 'Mobile verified successfully', 
      data: { 
        userToken: userToken,
        steps: pendingInfo.steps, 
        pending: pendingInfo.pending 
      } 
    });
  } catch (error) {
    return res.failure({ message: 'Failed to verify OTP', error: error.message });
  }
};

// Step 1: Mobile verification - Reset/Resend OTP
const resetSmsOtp = async (req, res) => {
  try {
    const companyCtx = await getCompanyFromHeaders(req);
    if (companyCtx.error) {
      return res.failure({ message: companyCtx.error });
    }

    const { companyId } = companyCtx;
    const userCtx = await loadUserContext(req, companyId);
    if (userCtx.error) {
      return res.failure({ message: userCtx.error });
    }

    const { user } = userCtx;
    const { mobileNo } = req.body || {};

    if (mobileNo != user.mobileNo) {
      return res.failure({ message: 'Invalid Mobile Number' });
    }

    // Get Sequelize instance to call resetOtpAttempts method
    const existingUser = await dbService.findOne(model.user, { 
      id: user.id, 
      companyId: companyId,
      isActive: true 
    });
    
    if (!existingUser) {
      return res.failure({ message: 'User not found' });
    }

    await existingUser.resetOtpAttempts();

    // Generate and send new OTP
    const code = random.randomNumber(6);
    const hashedCode = await bcrypt.hash(code, 10);
    const expireOTP = moment().add(JWT.OTP_EXPIRES_IN || 120, 'seconds').toISOString();

    await dbService.update(
      model.user,
      { id: user.id },
      { otpMobile: `${hashedCode}~${expireOTP}` }
    );

    const msg = `Dear user, your OTP for account login is ${code}. Team Gmaxepay`;
    await amezesmsApi.sendSmsLogin(user.mobileNo, msg);

    return res.success({ message: 'New OTP sent to registered mobile number' });
  } catch (error) {
    return res.failure({ message: 'Failed to reset OTP', error: error.message });
  }
};

// Step 2: Email verification - Send OTP
const sendEmailOtp = async (req, res) => {
  try {
    const companyCtx = await getCompanyFromHeaders(req);
    if (companyCtx.error) {
      return res.failure({ message: companyCtx.error });
    }

    const { companyId, company } = companyCtx;
    const userCtx = await loadUserContext(req, companyId);
    if (userCtx.error) {
      return res.failure({ message: userCtx.error });
    }
    
    const { user, userDetails, outletDetails, customerBankDetails } = userCtx;
    
    const { email } = req.body || {};
  
    // Check if email is already verified - if yes, return pending steps
    if (user.emailVerify) {
      const pendingInfo = getPendingSteps({ 
        userDetails, 
        outletDetails, 
        customerBankDetails,
        aadhaarDoc: userCtx.aadhaarDoc,
        panDoc: userCtx.panDoc
      });
      return res.success({ 
        message: 'Email is already verified', 
        data: { steps: pendingInfo.steps, pending: pendingInfo.pending } 
      });
    }

    // If email is provided in request, validate and check ownership
    if (email) {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.failure({ message: 'Invalid email format' });
      }

      // Check if this email is associated with any user
      const existingEmailUser = await dbService.findOne(model.user, { 
        email: email, 
        isActive: true,
        companyId: companyId
      });

      // If email belongs to current user, proceed with update
      if (existingEmailUser && existingEmailUser.id === user.id) {
        // Email belongs to current user - update and proceed
        await dbService.update(model.user, { id: user.id }, { email: email });
        // Reload user to get updated email
        const updatedUser = await dbService.findOne(model.user, { id: user.id });
        if (updatedUser) {
          user.email = updatedUser.email;
        }
      } else if (existingEmailUser && existingEmailUser.id !== user.id) {
        // Email belongs to another user
        return res.failure({ message: 'Already associated to other user' });
      } else {
        // Email doesn't exist in database - update it
        await dbService.update(model.user, { id: user.id }, { email: email });
        // Reload user to get updated email
        const updatedUser = await dbService.findOne(model.user, { id: user.id });
        if (updatedUser) {
          user.email = updatedUser.email;
        }
      }
    }
    
    // Check if user has email after update
    if (!user.email) {
      return res.failure({ message: 'Email is required. Please provide an email address.' });
    }
    // Get Sequelize instance to call resetLoginAttempts method
    const existingUser = await dbService.findOne(model.user, { id: user.id, isActive: true });
    if (!existingUser) {
      return res.failure({ message: 'User not found' });
    }
    await existingUser.resetLoginAttempts();

    const code = random.randomNumber(6); 
    const hashedCode = await bcrypt.hash(code, 10);
    const expireOTP = moment().add(3, 'minutes').toISOString();

    await dbService.update(model.user, { id: user.id }, { 
      otpEmail: `${hashedCode}~${expireOTP}` 
    });

    // Build logo and illustration URLs
    const backendUrl = process.env.BASE_URL;
    const logoUrl = company?.logo ? imageService.getImageUrl(company.logo) : `${backendUrl}/gmaxepay.png`;
    const illustrationUrl = `${backendUrl}/otp.png`;

    await emailService.sendOtpEmail({ 
      to: user.email, 
      userName: user.name || 'User', 
      otp: String(code), 
      expiryMinutes: 3, 
      logoUrl, 
      illustrationUrl 
    });

    const pendingInfo = getPendingSteps({ 
      userDetails, 
      outletDetails, 
      customerBankDetails,
      aadhaarDoc: userCtx.aadhaarDoc,
      panDoc: userCtx.panDoc
    });

    return res.success({ 
      message: 'OTP sent to registered email', 
      data: { steps: pendingInfo.steps, pending: pendingInfo.pending } 
    });
  } catch (error) {
    return res.failure({ message: 'Failed to send email OTP', error: error.message });
  }
};

// Step 2: Email verification - Verify OTP
const verifyEmailOtp = async (req, res) => {
  try {
    const companyCtx = await getCompanyFromHeaders(req);
    if (companyCtx.error) {
      return res.failure({ message: companyCtx.error });
    }

    const { companyId } = companyCtx;
    const userCtx = await loadUserContext(req, companyId);
    if (userCtx.error) {
      return res.failure({ message: userCtx.error });
    }

    const { user, userDetails, outletDetails, customerBankDetails } = userCtx;
    const { otp } = req.body || {};

    if (!otp) {
      return res.failure({ message: 'OTP is required' });
    }

    // Get Sequelize instance to call methods
    const existingUser = await dbService.findOne(model.user, { 
      id: user.id, 
      companyId: companyId,
      isActive: true 
    });
    
    if (!existingUser) {
      return res.failure({ message: 'User not found' });
    }

    if (existingUser.isAccountLocked && existingUser.isAccountLocked()) {
      return res.failure({ message: 'Account is temporarily locked due to multiple invalid attempts. Try again later.' });
    }

    const otpField = existingUser.otpEmail || '';
    const [storedHash, expiresAt] = otpField.split('~');
    
    if (!storedHash || !expiresAt) {
      return res.failure({ message: 'No OTP found. Please request a new OTP.' });
    }

    if (new Date(expiresAt) < new Date()) {
      return res.failure({ message: 'OTP expired. Please request a new OTP.' });
    }

    const isMatch = await bcrypt.compare(otp.toString(), storedHash);
    if (!isMatch) {
      await existingUser.incrementOtpAttempts();
      // Reload user to check lock status after increment
      const updatedUser = await dbService.findOne(model.user, { id: user.id });
      if (updatedUser && updatedUser.isAccountLocked && updatedUser.isAccountLocked()) {
        return res.failure({ message: 'Account locked due to multiple invalid attempts.' });
      }
      return res.failure({ message: 'Invalid OTP' });
    }

    await dbService.update(model.user, { id: user.id }, { 
      emailVerify: true, 
      otpEmail: null 
    });
    await existingUser.resetOtpAttempts();

    // Update KYC status
    await updateKycStatus(user.id, companyId, userCtx);

    const pendingInfo = getPendingSteps({ 
      userDetails: { ...userDetails, emailVerify: true }, 
      outletDetails, 
      customerBankDetails,
      aadhaarDoc: userCtx.aadhaarDoc,
      panDoc: userCtx.panDoc
    });

    return res.success({ 
      message: 'Email verified successfully', 
      data: { steps: pendingInfo.steps, pending: pendingInfo.pending } 
    });
  } catch (error) {
    return res.failure({ message: 'Failed to verify email OTP', error: error.message });
  }
};

// Step 2: Email verification - Reset/Resend OTP
const resetEmailOtp = async (req, res) => {
  try {
    const companyCtx = await getCompanyFromHeaders(req);
    if (companyCtx.error) {
      return res.failure({ message: companyCtx.error });
    }
    const { email } = req.body || {};
 
    const { companyId, company } = companyCtx;
    const existingUser = await dbService.findOne(model.user, { email: email, companyId: companyId });
    if (email != existingUser.email) {
      return res.failure({ message: 'Invalid Email Address' });
    }
    if (!existingUser.email) {
      return res.failure({ message: 'Email not set for user' });
    }
   
    await existingUser.resetOtpAttempts();

    const code = random.randomNumber(6);
    const hashedCode = await bcrypt.hash(code, 10);
    const expireOTP = moment().add(3, 'minutes').toISOString();

    await dbService.update(model.user, { id: existingUser.id }, { 
      otpEmail: `${hashedCode}~${expireOTP}` 
    });

    const backendUrl = process.env.BASE_URL;
    const logoUrl = company?.logo ? imageService.getImageUrl(company.logo) : `${backendUrl}/gmaxepay.png`;
    const illustrationUrl = `${backendUrl}/otp.png`;

    await emailService.sendOtpEmail({ 
      to: existingUser.email, 
      userName: existingUser.name || 'User', 
      otp: String(code), 
      expiryMinutes: 3, 
      logoUrl, 
      illustrationUrl 
    });

    return res.success({ message: 'New OTP sent to registered email' });
  } catch (error) {
    return res.failure({ message: 'Failed to reset email OTP', error: error.message });
  }
};

// Step 3: Aadhaar verification
const connectAadhaarVerification = async (req, res) => {
  try {
    const companyCtx = await getCompanyFromHeaders(req);
    if (companyCtx.error) {
      return res.failure({ message: companyCtx.error });
    }

    const { companyId, company } = companyCtx;
    const userCtx = await loadUserContext(req, companyId);
    if (userCtx.error) {
      return res.failure({ message: userCtx.error });
    }
   const {redirect_url}= req.body || {};

    const { user } = userCtx;
    const companyDomain = company.customDomain;
    if(!company.customDomain || !companyDomain) {
      return res.failure({ message: 'Aadhaar verification is not allowed for this company' });
    }    // Check if document already exists (already processed)
    const existingDoc = await dbService.findOne(model.digilockerDocument, {
      refId: user.id,
      companyId: companyId,
      documentType: 'AADHAAR',
      isDeleted: false
    });

    const data = {
      isDownload: true
    }
    if(existingDoc){
      return res.success({ message: 'Aadhaar verification already processed. Please download from digilocker' , data});
    }
    
    const response = await ekycHub.createAadharVerificationUrl(redirect_url);
    // Only store verification_id and reference_id if response is successful
    if (response && response.status === 'Success') {
      const { verification_id, reference_id } = response;
      if (verification_id) {
        // Create new document record with verification details (only once)
        await dbService.createOne(model.digilockerDocument, {
          refId: user.id,
          companyId: companyId,
          documentType: 'AADHAAR',
          verificationId: verification_id,
          referenceId: reference_id || null,
          status: response.status || null,
          fullResponse: response,
          addedBy: user.id,
          isActive: true
        });
      }
      return res.success({ message: 'Aadhaar Connection Successful' , data: response });
    } else {
      // If response is not successful, don't save anything
      return res.failure({ message: 'Failed to connect Aadhaar verification', data: response });
    }
  } catch (error) {
    return res.failure({ 
      message: 'Failed to connect Aadhaar verification', 
      error: error.message 
    });
  }
};

// Step 4: PAN verification
const connectPanVerification = async (req, res) => {
  try {
    const companyCtx = await getCompanyFromHeaders(req);
    if (companyCtx.error) {
      return res.failure({ message: companyCtx.error });
    }

    const { companyId, company } = companyCtx;
    const userCtx = await loadUserContext(req, companyId);
    if (userCtx.error) {
      return res.failure({ message: userCtx.error });
    }
    const { redirect_url } = req.body || {};

    const { user } = userCtx;
    const companyDomain = company.customDomain;
    if(!company.customDomain || !companyDomain) {
      return res.failure({ message: 'Pan verification is not allowed for this company' });
    }
    // Check if document already exists (already processed)
    const existingDoc = await dbService.findOne(model.digilockerDocument, {
      refId: user.id,
      companyId: companyId,
      documentType: 'PAN',
      isDeleted: false
    });

    const data = {
      isDownload: true
    }
    if(existingDoc){
      return res.success({ message: 'PAN verification already processed. Please download from digilocker', data });
    }
    
    const response = await ekycHub.createPanVerificationUrl(redirect_url);

    // Only store verification_id and reference_id if response is successful
    if (response && response.status === 'Success') {
      const { verification_id, reference_id } = response;
      if (verification_id) {
        // Create new document record with verification details (only once)
        await dbService.createOne(model.digilockerDocument, {
          refId: user.id,
          companyId: companyId,
          documentType: 'PAN',
          verificationId: verification_id,
          referenceId: reference_id || null,
          status: response?.status || null,
          fullResponse: response,
          addedBy: user.id,
          isActive: true
        });
      }
      return res.success({ message: 'PAN Connection Successful' , data: response });
    } else {
      // If response is not successful, don't save anything
      return res.failure({ message: 'Failed to connect PAN verification', data: response });
    }
  } catch (error) {
    return res.failure({ 
      message: 'Failed to connect PAN verification', 
      error: error.message 
    });
  }
};

// Get Digilocker Both Pan and Aadhaar Documents
const getDigilockerDocuments = async (req, res) => {
  try {
    const companyCtx = await getCompanyFromHeaders(req);
    if (companyCtx.error) {
      return res.failure({ message: companyCtx.error });
    }

    const { companyId } = companyCtx;
    const userCtx = await loadUserContext(req, companyId);
    if (userCtx.error) {
      return res.failure({ message: userCtx.error });
    }
    const { user } = userCtx;

    const { document_type } = req.body || {};

    if (!document_type) return res.failure({ message: 'Document type is required (AADHAAR or PAN)' });

    const docType = document_type.toUpperCase();
    if (docType !== 'AADHAAR' && docType !== 'PAN') {
      return res.failure({ message: 'Invalid document type. Must be AADHAAR or PAN' });
    }

    const userId = user.id;
    const companyIdNum = companyId;
    const docTypeLabel = docType === 'AADHAAR' ? 'Aadhaar' : 'PAN';

    // Find user
    const existingUser = await dbService.findOne(model.user, {
      id: userId,
      companyId: companyIdNum,
      isDeleted: false
    });
    if (!existingUser) {
      return res.failure({ message: 'User not found' });
    }

    // Find latest document
    const allDigilockerDocuments = await dbService.findAll(model.digilockerDocument, {
      refId: userId,
      companyId: companyIdNum,
      documentType: docType,
      isDeleted: false
    }, {
      sort: { id: -1 }
    });

    if (!allDigilockerDocuments || allDigilockerDocuments.length === 0) {
      return res.failure({ message: `Please connect your ${docTypeLabel} to digilocker first` });
    }
    
    const existingDigilockerDocument = allDigilockerDocuments[0];

    // Normalize values for safe comparison (avoid string vs number / case issues)
    const docRefId = Number(existingDigilockerDocument.refId);
    const reqUserId = Number(userId);
    const docCompanyId = Number(existingDigilockerDocument.companyId);
    const reqCompanyId = Number(companyIdNum);
    const docDocType = (existingDigilockerDocument.documentType || '').toString().toUpperCase();
    const reqDocType = docType.toString().toUpperCase();

    // Validate document ownership and required fields
    if (docRefId !== reqUserId || docCompanyId !== reqCompanyId || docDocType !== reqDocType) {
      return res.failure({ message: 'Document access denied. Data mismatch detected.' });
    }

    if (!existingDigilockerDocument.verificationId || !existingDigilockerDocument.referenceId) {
      return res.failure({ message: 'Verification ID and Reference ID are required. Please connect verification first' });
    }

    const { verificationId: verification_id, referenceId: reference_id } = existingDigilockerDocument;

    // Check if we can return cached data
    const isUserVerified = docType === 'AADHAAR' ? existingUser.aadharVerify : existingUser.panVerify;
    const hasFullData =
      (docType === 'AADHAAR' && existingDigilockerDocument.name) ||
      (docType === 'PAN' && existingDigilockerDocument.panNumber);
    const hasAddress = docType === 'AADHAAR' && existingDigilockerDocument.address;

    let response;
    if (isUserVerified && hasFullData) {
      // Return cached data
      response = {
        status: 'SUCCESS',
        message: `${docTypeLabel} Verification Already Processed`,
        data: {
          reference_id: existingDigilockerDocument.referenceId,
          verification_id: existingDigilockerDocument.verificationId,
          status: existingDigilockerDocument.status,
          ...(docType === 'AADHAAR'
            ? {
                name: existingDigilockerDocument.name,
                uid: existingDigilockerDocument.uid,
                dob: existingDigilockerDocument.dob,
                gender: existingDigilockerDocument.gender,
                care_of: existingDigilockerDocument.careOf,
                address: existingDigilockerDocument.address,
                split_address: existingDigilockerDocument.splitAddress,
                year_of_birth: existingDigilockerDocument.yearOfBirth,
                photo_link: existingDigilockerDocument.photoLink,
                xml_file: existingDigilockerDocument.xmlFile
              }
            : {
                pan_number: existingDigilockerDocument.panNumber,
                name: existingDigilockerDocument.panName,
                father_name: existingDigilockerDocument.panFatherName,
                dob: existingDigilockerDocument.panDob
              }),
          message: existingDigilockerDocument.message,
          txid: existingDigilockerDocument.txid
        }
      };
    } else {
      // Fetch from API
      response = await ekycHub.getDocuments(verification_id, reference_id, document_type);

      const responseStatus = (response?.status || '').toString().toUpperCase();
      const isSuccess =
        responseStatus === 'SUCCESS' ||
        responseStatus === 'SUCCEED' ||
        responseStatus === 'Success';

      if (response && isSuccess) {
        // Process successful response
        const docData = response.data || response;
        const updateData = {
          referenceId: docData.reference_id || reference_id || existingDigilockerDocument.referenceId,
          status: docData.status || response.status || 'Success',
          message: docData.message || response.message || null,
          txid: docData.txid || null,
          fullResponse: response
        };

        // Map document-specific fields
        if (docType === 'AADHAAR') {
          updateData.name = docData.name || null;
          updateData.uid = docData.uid || null;
          updateData.dob = docData.dob || null;
          updateData.gender = docData.gender || null;
          updateData.careOf = docData.care_of || null;
          updateData.address = docData.address || null;
          updateData.splitAddress = docData.split_address || null;
          updateData.yearOfBirth = docData.year_of_birth || null;
          updateData.photoLink = docData.photo_link || null;
          updateData.xmlFile = docData.xml_file || null;
        } else {
          updateData.panNumber = docData.pan || docData.pan_number || null;
          updateData.panName = docData.name_pan_card || docData.name || null;
          updateData.panFatherName = docData.father_name || docData.fatherName || null;
          updateData.panDob = docData.dob || null;
          if (docData.xml_file) {
            updateData.xmlFile = docData.xml_file;
          }
        }

        // Update document
        await dbService.update(
          model.digilockerDocument,
          {
            id: existingDigilockerDocument.id,
            refId: userId,
            companyId: companyIdNum,
            documentType: docType,
            isDeleted: false
          },
          updateData
        );

        // Update user verification status
        const userUpdateData =
          docType === 'AADHAAR'
            ? {
                aadharVerify: true,
                ...(updateData.name && { name: updateData.name }),
                ...(updateData.dob && { dob: updateData.dob }),
                ...(updateData.address && { fullAddress: updateData.address })
              }
            : { panVerify: true };

        await dbService.update(
          model.user,
          {
            id: userId,
            companyId: companyIdNum,
            isDeleted: false
          },
          userUpdateData
        );

        // Update KYC status
        await updateKycStatus(userId, companyIdNum, {
          aadhaarDoc: docType === 'AADHAAR' ? existingDigilockerDocument : userCtx?.aadhaarDoc,
          panDoc: docType === 'PAN' ? existingDigilockerDocument : userCtx?.panDoc
        });
      } else {
        // Handle API errors
        const responseData = response?.data || response || {};
        const errorCode = responseData.code || responseData.error_code || null;
        const errorMessage = (responseData.message || responseData.error_message || '').toLowerCase();

        const isExpiredOrPending =
          errorCode === 'url_expired' ||
          errorCode === 'validation_pending' ||
          errorMessage.includes('url expired') ||
          errorMessage.includes('expired') ||
          errorMessage.includes('validation in process');

        if (isExpiredOrPending) {
          // Delete the latest document request
          await dbService.destroy(model.digilockerDocument, {
            id: existingDigilockerDocument.id,
            refId: userId,
            companyId: companyIdNum,
            documentType: docType
          });

          // Reset user verification flag
          const resetData = docType === 'AADHAAR' ? { aadharVerify: false } : { panVerify: false };
          await dbService.update(
            model.user,
            {
              id: userId,
              companyId: companyIdNum,
              isDeleted: false
            },
            resetData
          );

          // Update KYC status
          await updateKycStatus(userId, companyIdNum, {
            aadhaarDoc: docType === 'AADHAAR' ? null : userCtx?.aadhaarDoc,
            panDoc: docType === 'PAN' ? null : userCtx?.panDoc
          });

          const errorMsg =
            errorCode === 'validation_pending'
              ? `Validation is in process. Please reconnect your ${docTypeLabel}.`
              : `Digilocker request URL has expired. Please reconnect your ${docTypeLabel}.`;

          return res.failure({
            message: errorMsg,
            data: {
              ...responseData,
              requiresReconnect: true
            }
          });
        }

        return res.failure({
          message: `Failed to fetch ${docTypeLabel} document from digilocker`,
          data: response
        });
      }
    }

    // Handle PAN details storage
    if (docType === 'PAN') {
      const docData = response.data || response || {};
      const panDetailsPayload = {
        status: 'SUCCESS',
        message: 'PAN Verification Downloaded',
        data: {
          reference_id:
            docData.reference_id ??
            docData.referenceId ??
            existingDigilockerDocument.referenceId ??
            null,
          verification_id:
            docData.verification_id ??
            docData.verificationId ??
            existingDigilockerDocument.verificationId ??
            null,
          status: docData.status ?? response.status ?? 'Success',
          pan_number:
            docData.pan_number ??
            docData.pan ??
            existingDigilockerDocument.panNumber ??
            null,
          name:
            docData.name ??
            docData.name_pan_card ??
            existingDigilockerDocument.panName ??
            null,
          father_name:
            docData.father_name ??
            docData.fatherName ??
            existingDigilockerDocument.panFatherName ??
            null,
          dob: docData.dob ?? existingDigilockerDocument.panDob ?? null,
          message:
            docData.message ??
            response.message ??
            existingDigilockerDocument.message ??
            null,
          txid: docData.txid ?? existingDigilockerDocument.txid ?? null
        }
      };

      const existingPanDetails = existingUser.panDetails || null;
      const shouldUpdatePanDetails =
        !existingPanDetails ||
        JSON.stringify(existingPanDetails) !== JSON.stringify(panDetailsPayload);

      if (shouldUpdatePanDetails) {
        await dbService.update(
          model.user,
          { id: userId, companyId: companyIdNum, isDeleted: false },
          { panDetails: panDetailsPayload }
        );
      }
    }

    const message = `${docTypeLabel} Verification Downloaded`;
    return res.success({ message, data: response.data || response });
  } catch (error) {
    return res.failure({ message: 'Failed to download verification', error: error.message });
  }
};

// Step 5: Shop details (Outlet)
const postShopDetails = async (req, res) => {
  try {
    const companyCtx = await getCompanyFromHeaders(req);
    if (companyCtx.error) {
      return res.failure({ message: companyCtx.error });
    }

    const { companyId, company } = companyCtx;
    const userCtx = await loadUserContext(req, companyId);
    if (userCtx.error) {
      return res.failure({ message: userCtx.error });
    }

    const { user, outlet, customerBank } = userCtx;
    const { shopName, ipAddress, latitude, longitude , shopCategoryId} = req.body || {};
    
    if (!shopName ) {
      return res.failure({ 
        message: 'shopName is required' 
      });
    }
    if(!ipAddress){
      return res.failure({ 
        message: 'ipAddress is required' 
      });
    }
    if(!latitude || !longitude){
      return res.failure({ 
        message: 'pls allow location access to get complete address' 
      });
    }

    // Reverse geocode to get complete address
    const addressData = await googleMap.reverseGeocode(latitude, longitude);
    const completeAddress = addressData.complete_address || addressData.formatted_address;

    // Helper function to extract S3 key from JSON field
    const extractShopImageKey = (imageData) => {
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

    // Extract old shop image key if outlet exists
    let oldShopImageKey = null;
    if (outlet && outlet.shopImage) {
      oldShopImageKey = extractShopImageKey(outlet.shopImage);
    }

    // Handle optional shop image upload (multer memory storage)
    let shopImageKey = null;
    if (req.file && req.file.buffer) {
      const uploadResult = await imageService.uploadImageToS3(
        req.file.buffer,
        req.file.originalname || 'shop.jpg',
        'shop',
        company.id,
        null, // subtype
        user.id // userId for new pattern: companyId/userId/shopImage/
      );
      shopImageKey = uploadResult.key;

      // Delete old shop image if it exists and is different from new one
      if (oldShopImageKey && oldShopImageKey !== shopImageKey) {
        try {
          await imageService.deleteImageFromS3(oldShopImageKey);
        } catch (error) {
        }
      }
    }

    // Check if shop details are already verified for this user (prevent multiple shops)
    if (user.shopDetailsVerify) {
      return res.failure({ message: 'Shop details already verified for this user. Cannot create or update shop details.' });
    }

    const outletPayload = {
      shopName,
      shopAddress: completeAddress,
      ...(shopImageKey ? { shopImage: shopImageKey } : {}),
      outletGoogleMapsLink: addressData?.place_google_maps_link,
      shopCity: addressData?.address_components?.city,
      shopDistrict: addressData?.address_components?.district,
      shopState: addressData?.address_components?.state,
      shopPincode: addressData?.address_components?.postal_code,
      shopLatitude: latitude,
      shopLongitude: longitude,
      shopCategoryId: shopCategoryId? shopCategoryId : 1,
      shopCountry: "India"
    };

    let updatedOutlet = outlet;
    if (outlet) {
      updatedOutlet = await dbService.update(model.outlet, { id: outlet.id }, outletPayload);
    } else {
      updatedOutlet = await dbService.createOne(model.outlet, {
        refId: user.id,
        companyId: company.id,
        userRole: user.userRole,
        ...outletPayload
      });
    }

    const userAddressPayload = {
      shopDetailsVerify: true,
      fullAddress: completeAddress,
      city: addressData?.address_components?.city,
      district: addressData?.address_components?.district,
      state: addressData?.address_components?.state,
      zipcode: addressData?.address_components?.postal_code,
      country: "India",
      latitude: latitude,
      longitude: longitude,
    };

    await dbService.update(model.user, { id: user.id }, userAddressPayload);

    // Update KYC status
    await updateKycStatus(user.id, company.id, { outlet: updatedOutlet, customerBank: customerBank, aadhaarDoc: userCtx.aadhaarDoc, panDoc: userCtx.panDoc });

    // Reload user to get updated shopDetailsVerify
    const updatedUser = await dbService.findOne(model.user, { id: user.id });
    const pendingInfo = getPendingSteps({ 
      user: updatedUser, 
      outlet: updatedOutlet, 
      customerBank,
      aadhaarDoc: userCtx.aadhaarDoc,
      panDoc: userCtx.panDoc
    });

    return res.success({ 
      message: 'Shop details saved', 
      data: { steps: pendingInfo.steps, pending: pendingInfo.pending } 
    });
  } catch (error) {
    return res.failure({ message: 'Failed to save shop details', error: error.message });
  }
};

// Step 6: Bank details (CustomerBank)
const calculateStringSimilarity = (str1, str2) => {
  if (!str1 || !str2) return 0;
  
  // Normalize strings: trim, lowercase, remove extra spaces
  const normalize = (str) => {
    return (str || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
  };
  
  const s1 = normalize(str1);
  const s2 = normalize(str2);
  
  // If both strings are empty after normalization
  if (!s1 && !s2) return 100;
  if (!s1 || !s2) return 0;
  
  // If strings are exactly equal
  if (s1 === s2) return 100;
  
  // Calculate Levenshtein distance
  const len1 = s1.length;
  const len2 = s2.length;
  
  // Create a matrix for dynamic programming
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
  
  // Initialize first row and column
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  // Fill the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  
  // Calculate similarity percentage
  const similarity = maxLen === 0 ? 100 : ((maxLen - distance) / maxLen) * 100;
  
  return Math.round(similarity * 100) / 100; // Round to 2 decimal places
};

const postBankDetails = async (req, res) => {
  try {
    const companyCtx = await getCompanyFromHeaders(req);
    if (companyCtx.error) {
      return res.failure({ message: companyCtx.error });
    }

    const { companyId, company } = companyCtx;
    const userCtx = await loadUserContext(req, companyId);
    if (userCtx.error) {
      return res.failure({ message: userCtx.error });
    }

    const { user, outlet, customerBank } = userCtx;
    const { account_number, ifsc } = req.body || {};

    if (!account_number) {
      return res.failure({ message: 'Account number is required' });
    }
    if (!ifsc) {
      return res.failure({ message: 'IFSC is required' });
    }

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
      // Decrypt the cached response
      try {
        const encryptedData = JSON.parse(existingBank.response);
        
        if (encryptedData && encryptedData.encrypted) {
          // Use doubleDecrypt (from doubleCheckUp.js) which expects object with encrypted, iv, authTag
          const decryptedResponse = doubleDecrypt(encryptedData, Buffer.from(key, 'hex'));
          
          if (decryptedResponse) {
            bankVerification = JSON.parse(decryptedResponse);
          } else {
            // If decryption failed, encryptedData might already be the response
            bankVerification = encryptedData;
          }
        } else {
          // Response might not be double-encrypted, try parsing directly
          bankVerification = JSON.parse(existingBank.response);
        }
      } catch (e) {
        bankVerification = existingBank.response;
      }
    } else {
      bankVerification = await ekycHub.bankVerification(account_number, ifsc);

      // Only save if verification is successful
      if (bankVerification && bankVerification.status === 'Success') {
        // Encrypt the response before saving
        const encryptedResponse = doubleEncrypt(JSON.stringify(bankVerification), encryptionKey);

        await dbService.createOne(model.ekycHub, {
          identityNumber1: account_number,
          identityNumber2: ifsc,
          request: JSON.stringify(encryptedRequest),
          response: JSON.stringify(encryptedResponse),
          identityType: 'BANK',
          companyId: company.id || null,
          addedBy: user.id
        });
      }
    }

    if (!bankVerification) {
      return res.failure({ 
        message: 'Bank verification failed', 
        data: { error: 'No response from verification service' } 
      });
    }

    if (typeof bankVerification === 'string') {
      try {
        bankVerification = JSON.parse(bankVerification);
      } catch (e) {
        return res.failure({ 
          message: 'Bank verification failed', 
          data: { error: 'Invalid response format from verification service', response: bankVerification } 
        });
      }
    }

    if (!bankVerification.status) {
      return res.failure({ 
        message: 'Bank verification failed', 
        data: { error: 'Status missing in verification response', response: bankVerification } 
      });
    }

    if (bankVerification.status !== 'Success') {
      return res.failure({ 
        message: 'Bank verification failed', 
        data: { 
          error: bankVerification.message || bankVerification.error || 'Verification unsuccessful',
          status: bankVerification.status,
          response: bankVerification
        } 
      });
    }
    
    // Fetch bank details from Razorpay API using IFSC
    let razorpayBankData = null;
    try {
      razorpayBankData = await razorpayApi.bankDetails(ifsc);
    } catch (error) {
    }
    
    // Extract bank details from verification response
    // Use Razorpay BANK name as primary source, fallback to eKYC response
    const bankName = (razorpayBankData && razorpayBankData.BANK) 
      ? razorpayBankData.BANK 
      : (bankVerification.bank_name || bankVerification.bankName || null);
    const beneficiaryName = bankVerification.nameAtBank
      || bankVerification.beneficiary_name
      || bankVerification.beneficiaryName
      || bankVerification['nameAtBank']
      || null;
    const accountNumber = bankVerification.account_number || bankVerification['Account Number'] || account_number;
    // Use Razorpay city/branch if available, otherwise use eKYC response
    const city = (razorpayBankData && razorpayBankData.CITY) 
      ? razorpayBankData.CITY 
      : (bankVerification.city || null);
    const branch = (razorpayBankData && razorpayBankData.BRANCH) 
      ? razorpayBankData.BRANCH 
      : (bankVerification.branch || null);

    const aadhaarName = (userCtx.aadhaarDoc && userCtx.aadhaarDoc.name) ? userCtx.aadhaarDoc.name : '';
    const bankBeneficiaryName = beneficiaryName || '';

    const nameSimilarityPercentage = calculateStringSimilarity(aadhaarName, bankBeneficiaryName);

    if (!bankBeneficiaryName) {
      return res.failure({
        message: 'Bank account holder name not found in verification response',
        data: {
          aadhaarName: aadhaarName || null,
          bankHolderName: null,
          similarityPercentage: 0
        }
      });
    }

    if (nameSimilarityPercentage <= 60) {
      return res.failure({
        message: 'Your name does not match with the bank account holder name. Please verify your bank account details.',
        data: {
          aadhaarName: aadhaarName || null,
          bankHolderName: bankBeneficiaryName,
          similarityPercentage: nameSimilarityPercentage
        }
      });
    }

    await dbService.update(model.user, {
      id: user.id,
      companyId: company.id,
      isDeleted: false
    }, {
      bankDetailsVerify: true,
      nameSimilarity: nameSimilarityPercentage.toString()
    });

    const updatedUser = await dbService.findOne(model.user, {
      id: user.id,
      companyId: company.id,
      isDeleted: false
    });

    // Ensure only one primary account exists - set all others to false
    await dbService.update(model.customerBank, {
      refId: user.id,
      companyId: company.id,
      isPrimary: true
    }, {
      isPrimary: false
    });

    // Use user.id directly as refId for customerBank (no customer table needed)
    let updatedCustomerBank = customerBank;
    const payload = {
      refId: user.id, 
      companyId: company.id,
      bankName,
      beneficiaryName: beneficiaryName || user.name,
      accountNumber,
      ifsc,
      city: city || null,
      branch: branch || null,
      isActive: true,
      isPrimary: true
    };

    if (customerBank) {
      updatedCustomerBank = await dbService.update(model.customerBank, { 
        id: customerBank.id 
      }, payload);
    } else {
      updatedCustomerBank = await dbService.createOne(model.customerBank, payload);
    }

    await updateKycStatus(user.id, company.id, { outlet: outlet, customerBank: updatedCustomerBank, aadhaarDoc: userCtx.aadhaarDoc, panDoc: userCtx.panDoc });

    const pendingInfo = getPendingSteps({ 
      user: updatedUser, 
      outlet, 
      customerBank: updatedCustomerBank,
      aadhaarDoc: userCtx.aadhaarDoc,
      panDoc: userCtx.panDoc
    });

    return res.success({ 
      message: 'Bank details Verified',
      data: {
        steps: pendingInfo.steps,
        pending: pendingInfo.pending,
        nameMatching: {
          aadhaarName: aadhaarName || null,
          bankHolderName: bankBeneficiaryName,
          similarityPercentage: nameSimilarityPercentage
        }
      }
    });
  } catch (error) {
    return res.failure({ message: 'Failed to save bank details', error: error.message });
  }
};

const postProfile = async (req, res) => {
  try {
    const companyCtx = await getCompanyFromHeaders(req);
    if (companyCtx.error) {
      return res.failure({ message: companyCtx.error });
    }

    const { companyId, company } = companyCtx;
    const userCtx = await loadUserContext(req, companyId);
    if (userCtx.error) {
      return res.failure({ message: userCtx.error });
    }

    const { user, outlet, customerBank } = userCtx;
    const hasImage = req.file && req.file.buffer;
    
    if (!hasImage) {
      return res.failure({ 
        message: 'Profile image is required. Please upload a profile image.' 
      });
    }
    
    // Validate profile image early (before any async operations)
    const imageBuffer = req.file.buffer;
    if (!imageBuffer || imageBuffer.length < 100) {
      return res.failure({ message: 'Invalid profile image. Please upload a valid image.' });
    }
    
    // Validate image format
    const isJPEG = imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8 && imageBuffer[2] === 0xFF;
    const isPNG = imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47;
    if (!isJPEG && !isPNG) {
      return res.failure({ message: 'Invalid image format. Please upload a JPEG or PNG image.' });
    }
    
    // Check size limit
    if (imageBuffer.length > 15 * 1024 * 1024) {
      return res.failure({ message: 'Image too large. Maximum size is 15MB.' });
    }
    
    // Fetch Aadhaar document (required for face comparison)
    const existingAadharDetails = await dbService.findOne(model.digilockerDocument, { 
      refId: user.id, 
      companyId: companyId, 
      documentType: 'AADHAAR', 
      isDeleted: false 
    });
    
    if (!existingAadharDetails) {
      return res.failure({ message: 'Aadhaar verification is required before profile update' });
    }
    
    const updates = {};
    const imageFileName = req.file.originalname || 'profile.jpg';
    
    try {
      // Convert profile image to base64 for Rekognition
      const profilePhotoBase64ForRekognition = imageBuffer.toString('base64');
      
      // Step 1: Check liveness first
      const livenessResult = await rekognitionService.detectLiveness(profilePhotoBase64ForRekognition);
      
      if (!livenessResult.success) {
        throw new Error('Failed to verify profile photo liveness. Please try again.');
      }
      
      if (!livenessResult.isLive) {
        return res.failure({ 
          message: 'Your face is not live. Please try again.' 
        });
      }
      
      // Step 2: Perform face comparison (extract Aadhaar photo first)
      let faceComparisonResult = null;
      if (existingAadharDetails?.photoLink) {
        // Extract and validate Aadhaar photo
        const aadhaarPhotoBase64 = await extractBase64FromImage(existingAadharDetails.photoLink);
        if (!aadhaarPhotoBase64) {
          throw new Error('Invalid Aadhaar photo data. Please re-verify your Aadhaar.');
        }
        
        const aadhaarBuffer = validateAndConvertBase64(aadhaarPhotoBase64);
        if (!aadhaarBuffer) {
          throw new Error('Invalid Aadhaar photo format. Please re-verify your Aadhaar.');
        }
        
        // Convert to base64 for Rekognition
        const aadhaarPhotoBase64ForRekognition = aadhaarBuffer.toString('base64');
        
        // Perform face comparison
        faceComparisonResult = await rekognitionService.compareFaces(
          aadhaarPhotoBase64ForRekognition, 
          profilePhotoBase64ForRekognition
        );
        
        if (!faceComparisonResult.success) {
          throw new Error('Failed to verify profile photo. Please try again.');
        }
        
        if (!faceComparisonResult.matched) {
          throw new Error('Your face is not recognized by Aadhaar card. Please check it.');
        }
      }
      
      // Step 3: Upload to S3 after liveness and comparison checks pass
      const uploadResult = await imageService.uploadImageToS3(
        imageBuffer,
        imageFileName,
        'profile',
        company.id,
        'user',
        user.id
      );
      
      updates.profileImage = uploadResult.key;
      updates.imageVerify = true;
      updates.profileImageWithShopVerify = true;
    } catch (imageError) {
      if (imageError.message.includes('not recognized') || imageError.message.includes('do not match')) {
        return res.failure({ message: imageError.message });
      }
      return res.failure({ message: 'Failed to process profile image', error: imageError.message });
    }
    
    // Update user in database
    await dbService.update(model.user, { id: user.id }, updates);
    
    if (updates.profileImage && outlet?.id) {
      await dbService.update(
        model.outlet,
        { id: outlet.id },
        { shopImage: updates.profileImage, shopImageVerify: true }
      );
    }
    
    // Reload user context to get updated data
    const updatedUser = await dbService.findOne(model.user, { id: user.id });
    const updatedUserCtx = await loadUserContext(req, companyId);
    const latestUser = updatedUserCtx.user || updatedUser;
    const latestOutlet = updatedUserCtx.outlet || outlet;
    const latestCustomerBank = updatedUserCtx.customerBank || customerBank;
    const latestAadhaarDoc = updatedUserCtx.aadhaarDoc || userCtx.aadhaarDoc;
    const latestPanDoc = updatedUserCtx.panDoc || userCtx.panDoc;
    
    const pendingInfo = getPendingSteps({
      user: latestUser,
      outlet: latestOutlet,
      customerBank: latestCustomerBank,
      aadhaarDoc: latestAadhaarDoc,
      panDoc: latestPanDoc
    });
    
    const kycInfo = calculateKycStatus({
      user: latestUser,
      outlet: latestOutlet,
      customerBank: latestCustomerBank,
      aadhaarDoc: latestAadhaarDoc,
      panDoc: latestPanDoc
    });
    
    await dbService.update(model.user, { id: user.id }, {
      kycStatus: kycInfo.kycStatus,
      kycSteps: kycInfo.kycSteps
    });
    
    const userForCheck = await dbService.findOne(model.user, { id: user.id });
    let tempPassword = null;
    if (pendingInfo.allCompleted && userForCheck && userForCheck.firstTimeOnboarding) {
      tempPassword = generateTempPassword();
      const hashedTempPassword = await bcrypt.hash(tempPassword, 8);
      
      await dbService.update(model.user, { id: user.id }, {
        password: hashedTempPassword,
        firstTimeOnboarding: false,
        firstTimeOnboardingComplete: true,
        isResetPassword: true
      });
      
      try {
        const backendUrl = process.env.BASE_URL;
        const logoUrl = (company && company.logo) ? imageService.getImageUrl(company.logo) : `${backendUrl}/gmaxepay.png`;
        const illustrationUrl = `${backendUrl}/tempPassword.png`;
        
        await emailService.sendTempPasswordEmail({
          to: userForCheck.email,
          userName: userForCheck.name || 'User',
          tempPassword: tempPassword,
          logoUrl: logoUrl,
          illustrationUrl: illustrationUrl
        });
      } catch (emailError) {
      }
    }
    
    const responseData = {
      steps: pendingInfo.steps,
      pending: pendingInfo.pending,
      kycStatus: kycInfo.kycStatus,
      kycSteps: kycInfo.kycSteps,
      allCompleted: pendingInfo.allCompleted
    };
    
    return res.success({ message: 'Your Profile is updated and matched with Aadhaar card', data: responseData });
  } catch (error) {
    return res.failure({ message: 'Failed to update profile', error: error.message });
  }
};


const getPending = async (req, res) => {
  try {
    const companyCtx = await getCompanyFromHeaders(req);
    if (companyCtx.error) {
      return res.failure({ message: companyCtx.error });
    }

    const { companyId } = companyCtx;
    const userCtx = await loadUserContext(req, companyId);
    if (userCtx.error) {
      return res.failure({ message: userCtx.error });
    }

    const { user, userDetails, outlet, outletDetails, customerBank, customerBankDetails, aadhaarDoc, panDoc } = userCtx;
    const pendingInfo = getPendingSteps({ 
      user,
      userDetails,
      outlet,
      outletDetails,
      customerBank,
      customerBankDetails,
      aadhaarDoc,
      panDoc
    });

    return res.success({ 
      message: 'Pending steps fetched', 
      data: pendingInfo 
    });
  } catch (error) {
    return res.failure({ message: 'Failed to fetch pending steps', error: error.message });
  }
};

const getLast4Digits = (aadhaarNumber) => {
  if (!aadhaarNumber) return null;
  const digits = aadhaarNumber.toString().replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
};

const normalizeDate = (dateString) => {
  if (!dateString) return null;
  const dateStr = dateString.toString().trim();
  const match = dateStr.match(/(\d{1,4})[-\/\.](\d{1,2})[-\/\.](\d{2,4})/);
  if (!match) return dateStr;
  
  let day, month, year;
  const part1 = match[1];
  const part2 = match[2];
  const part3 = match[3];
  
  if (part1.length === 4) {
    year = part1;
    month = part2.padStart(2, '0');
    day = part3.padStart(2, '0');
  } else if (part3.length === 4) {
    day = part1.padStart(2, '0');
    month = part2.padStart(2, '0');
    year = part3;
  } else {
    day = part1.padStart(2, '0');
    month = part2.padStart(2, '0');
    const yy = parseInt(part3);
    year = yy < 50 ? `20${part3.padStart(2, '0')}` : `19${part3.padStart(2, '0')}`;
  }
  
  return `${day}-${month}-${year}`;
};

const extractBase64FromImage = async (imageString) => {
  if (!imageString) return null;
  
  // Handle data URL format: data:image/jpeg;base64,/9j/4AAQ...
  if (imageString.startsWith('data:image')) {
    return imageString.split(',')[1];
  }
  
  // Check if it's a URL (S3, CDN, or HTTP/HTTPS)
  if (imageString.startsWith('http://') || imageString.startsWith('https://')) {
    try {
      // Download the image from URL
      const response = await axios.get(imageString, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      
      // Validate it's a valid image
      const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
      const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
      
      if (!isJPEG && !isPNG) {
        return null;
      }
      
      // Convert to base64
      return buffer.toString('base64');
    } catch (error) {
      return null;
    }
  }
  
  // If it's already a base64 string, return as is
  // Validate it's a valid base64 string
  try {
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    const cleaned = imageString.replace(/\s/g, '');
    if (base64Regex.test(cleaned)) {
      return cleaned;
    }
  } catch (e) {
  }
  
  return null;
};

const validateAndConvertBase64 = (base64String) => {
  if (!base64String) return null;
  
  try {
    const cleanBase64 = base64String.replace(/\s/g, '');
    
    if (!/^[A-Za-z0-9+/=]+$/.test(cleanBase64)) {
      return null;
    }
    
    const buffer = Buffer.from(cleanBase64, 'base64');
    
    if (buffer.length < 100) {
      return null;
    }
    
    const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    
    if (!isJPEG && !isPNG) {
      return null;
    }
    
    if (buffer.length > 15 * 1024 * 1024) {
      return null;
    }
    
    return buffer;
  } catch (error) {
    return null;
  }
};

const cleanupOldImages = async (oldFrontKey, oldBackKey, newFrontKey, newBackKey) => {
  const cleanupPromises = [];
  if (oldFrontKey && oldFrontKey !== newFrontKey) {
    cleanupPromises.push(
      imageService.deleteImageFromS3(oldFrontKey).catch(err => 
        err
      )
    );
  }
  if (oldBackKey && oldBackKey !== newBackKey) {
    cleanupPromises.push(
      imageService.deleteImageFromS3(oldBackKey).catch(err => 
        err
      )
    );
  }
  await Promise.all(cleanupPromises);
};

const uploadAadharDocuments = async (req, res) => {
  try {
    const companyCtx = await getCompanyFromHeaders(req);
    if (companyCtx.error) {
      return res.failure({ message: companyCtx.error });
    }

    const { companyId, company } = companyCtx;
    const userCtx = await loadUserContext(req, companyId);
    if (userCtx.error) {
      return res.failure({ message: userCtx.error });
    }

    const { user } = userCtx;
    const front_photo = req.files?.front_photo?.[0];
    const back_photo = req.files?.back_photo?.[0];

    if (!front_photo || !back_photo) {
      const receivedFields = req.files ? Object.keys(req.files).join(', ') : 'none';
      return res.failure({
        message: !front_photo ? 'Front photo is required' : 'Back photo is required',
        receivedFields: receivedFields || 'none',
        expectedFields: ['front_photo', 'back_photo']
      });
    }

    const [existingUser, existingAadharDetails] = await Promise.all([
      dbService.findOne(model.user, { id: user.id }),
      dbService.findOne(model.digilockerDocument, {
        refId: user.id,
        companyId: companyId,
        documentType: 'AADHAAR',
        isDeleted: false
      })
    ]);

    const oldFrontImageKey = extractS3Key(existingUser?.aadharFrontImage);
    const oldBackImageKey = extractS3Key(existingUser?.aadharBackImage);

    const [frontData, backData, frontPhoto] = await Promise.all([
      textractService.extractAadhaarData(front_photo.buffer),
      textractService.extractAadhaarData(back_photo.buffer),
      textractService.extractAadhaarPhoto(front_photo.buffer)
    ]);
    console.log(frontData, backData, frontPhoto);

    if (!frontData.success) {
      return res.failure({
        message: frontData.error || 'Failed to extract data from front image',
        success: false
      });
    }

    if (!backData.success) {
      return res.failure({
        message: backData.error || 'Failed to extract data from back image',
        success: false
      });
    }

    const extractExact12Digits = (aadhaarValue) => {
      if (!aadhaarValue) return null;
      const digits = aadhaarValue.toString().replace(/\D/g, '');
      return digits.length === 12 ? digits : null;
    };

    console.log(frontData.aadhaar_number, backData.aadhaar_number);
    const frontAadhaarNumber = extractExact12Digits(frontData.aadhaar_number);
    const backAadhaarNumber = extractExact12Digits(backData.aadhaar_number);
    console.log(frontAadhaarNumber, backAadhaarNumber);
    console.log(aadhaar_numbers_match);
    const aadhaar_numbers_match = frontAadhaarNumber && backAadhaarNumber
      ? frontAadhaarNumber === backAadhaarNumber
      : false;

    const [frontUploadResult, backUploadResult] = await Promise.all([
      imageService.uploadImageToS3(
        front_photo.buffer,
        front_photo.originalname || 'front_photo.jpg',
        'aadhaar',
        company.id,
        'front',
        user.id
      ),
      imageService.uploadImageToS3(
        back_photo.buffer,
        back_photo.originalname || 'back_photo.jpg',
        'aadhaar',
        company.id,
        'back',
        user.id
      )
    ]);

    const frontImageS3Key = frontUploadResult.key;
    const backImageS3Key = backUploadResult.key;

    if (!frontAadhaarNumber && !backAadhaarNumber) {
      await Promise.all([
        imageService.deleteImageFromS3(frontImageS3Key).catch(() => {}),
        imageService.deleteImageFromS3(backImageS3Key).catch(() => {})
      ]);
      return res.failure({ message: 'Could not extract Aadhaar number from images' });
    }

    if (!aadhaar_numbers_match) {
      await Promise.all([
        imageService.deleteImageFromS3(frontImageS3Key).catch(() => {}),
        imageService.deleteImageFromS3(backImageS3Key).catch(() => {})
      ]);
      return res.failure({ message: 'Aadhaar numbers from front and back images do not match' });
    }

    const extractedData = {
      aadhaar_number: frontAadhaarNumber || backAadhaarNumber || null,
      photo: frontPhoto || null,
      dob: frontData.dob || null,
      aadhaar_numbers_match: aadhaar_numbers_match
    };
    console.log(extractedData);
    const validationResults = {
      aadhaarLast4Match: false,
      dobMatch: false,
      dobOptional: true,
      photoMatch: false,
      allValidationsPassed: false
    };

    if (existingAadharDetails) {
      if (existingAadharDetails.uid && extractedData.aadhaar_number) {
        const existingLast4 = getLast4Digits(existingAadharDetails.uid);
        const extractedLast4 = getLast4Digits(extractedData.aadhaar_number);

        if (existingLast4 && extractedLast4) {
          if (existingLast4 !== extractedLast4) {
            await Promise.all([
              imageService.deleteImageFromS3(frontImageS3Key).catch(() => {}),
              imageService.deleteImageFromS3(backImageS3Key).catch(() => {})
            ]);

            return res.failure({ message: 'pls check your uploaded image' });
          }
          validationResults.aadhaarLast4Match = true;
        }
      }

      const hasExistingDob = !!existingAadharDetails.dob;
      const hasExtractedDob = !!extractedData.dob;

      if (hasExistingDob && hasExtractedDob) {
        const existingDob = normalizeDate(existingAadharDetails.dob);
        const extractedDob = normalizeDate(extractedData.dob);
        validationResults.dobMatch = existingDob === extractedDob;
        validationResults.dobOptional = false;
      } else {
        validationResults.dobMatch = true;
        validationResults.dobOptional = true;
      }

      if (existingAadharDetails.photoLink && extractedData.photo) {
        try {
          const photoLinkBase64 = await extractBase64FromImage(existingAadharDetails.photoLink);
          const extractedPhotoBase64 = await extractBase64FromImage(extractedData.photo);

          if (!photoLinkBase64 || !extractedPhotoBase64) {
            return res.failure({ message: 'Invalid photo data. Please try again.' });
          }

          const photoLinkBuffer = validateAndConvertBase64(photoLinkBase64);
          const extractedPhotoBuffer = validateAndConvertBase64(extractedPhotoBase64);

          if (!photoLinkBuffer || !extractedPhotoBuffer) {
            return res.failure({ message: 'Invalid photo format. Please try again.' });
          }

          const photoLinkBase64ForRekognition = photoLinkBuffer.toString('base64');
          const extractedPhotoBase64ForRekognition = extractedPhotoBuffer.toString('base64');

          const faceComparison = await rekognitionService.compareFaces(
            photoLinkBase64ForRekognition,
            extractedPhotoBase64ForRekognition
          );

          validationResults.photoMatch = faceComparison.success && faceComparison.matched;
          if (!validationResults.photoMatch) {
            await Promise.all([
              imageService.deleteImageFromS3(frontImageS3Key).catch(() => {}),
              imageService.deleteImageFromS3(backImageS3Key).catch(() => {})
            ]);

            return res.failure({ message: 'pls check your uploaded image' });
          }
        } catch {
          validationResults.photoMatch = false;
        }
      } else if (!existingAadharDetails.photoLink && !extractedData.photo) {
        validationResults.photoMatch = true;
      }
    }

    if (existingAadharDetails) {
      validationResults.allValidationsPassed =
        validationResults.aadhaarLast4Match &&
        validationResults.dobMatch &&
        validationResults.photoMatch;
    }

    const sanitizedAadhaarNumber = extractedData.aadhaar_number
      ? extractedData.aadhaar_number.toString().replace(/\D/g, '')
      : '';
    const aadharLast4 = sanitizedAadhaarNumber ? sanitizedAadhaarNumber.slice(-4) : '';
    const canPersistFullAadhaarNumber =
      !!sanitizedAadhaarNumber &&
      (!existingAadharDetails || validationResults.allValidationsPassed);
    const aadharDetailsPayload = sanitizedAadhaarNumber
      ? {
          aadhaarLast4: aadharLast4 || null,
          aadhaarNumber: canPersistFullAadhaarNumber ? sanitizedAadhaarNumber : null
        }
      : null;

    const updateData = {
      aadharFrontImage: frontImageS3Key,
      aadharBackImage: backImageS3Key,
      isAadharUploaded: true
    };

    if (aadharDetailsPayload) {
      updateData.aadharDetails = aadharDetailsPayload;
    }

    if (extractedData.aadhaar_number && extractedData.aadhaar_numbers_match) {
      if (existingAadharDetails) {
        if (validationResults.allValidationsPassed) {
          updateData.aadharVerify = true;
        }
      } else {
        updateData.aadharVerify = true;
      }
    }

    try {
      await dbService.update(model.user, { id: user.id }, updateData);
    } catch (dbError) {
      const errorMessage = dbError.message || dbError.parent?.message || '';
      if (
        dbError.name === 'SequelizeDatabaseError' &&
        (errorMessage.includes('too long') || errorMessage.includes('value too long'))
      ) {
        if (aadharDetailsPayload) {
          const minimalDetails = {
            aadhaarLast4: aadharDetailsPayload.aadhaarLast4 || null,
            aadhaarNumber: canPersistFullAadhaarNumber ? sanitizedAadhaarNumber : null
          };
          try {
            updateData.aadharDetails = minimalDetails;
            await dbService.update(model.user, { id: user.id }, updateData);
          } catch {
            const { aadharDetails, ...updateDataWithoutDetails } = updateData;
            await dbService.update(model.user, { id: user.id }, updateDataWithoutDetails);
          }
        } else {
          const { aadharDetails, ...updateDataWithoutDetails } = updateData;
          await dbService.update(model.user, { id: user.id }, updateDataWithoutDetails);
        }
      } else {
        throw dbError;
      }
    }

    await cleanupOldImages(oldFrontImageKey, oldBackImageKey, frontImageS3Key, backImageS3Key);

    await updateKycStatus(user.id, company.id, userCtx);

    let responseMessage = 'Aadhar documents processed and uploaded successfully';
    if (existingAadharDetails) {
      if (validationResults.allValidationsPassed) {
        responseMessage = 'Aadhar documents verified and uploaded successfully.';
      } else {
        const failedValidations = [];
        if (!validationResults.aadhaarLast4Match) {
          failedValidations.push('Last 4 digits of Aadhaar number do not match');
        }
        if (!validationResults.dobMatch && !validationResults.dobOptional) {
          failedValidations.push('Date of birth does not match');
        }
        if (!validationResults.photoMatch) {
          failedValidations.push('Photo does not match');
        }
        if (failedValidations.length > 0) {
          responseMessage = `Aadhar documents uploaded successfully. However, some validations failed: ${failedValidations.join(
            ', '
          )}`;
        }
      }
    }

    return res.success({
      message: responseMessage,
      data: {
        ...extractedData
      }
    });
  } catch (error) {
    return res.failure({ message: 'Failed to upload Aadhar documents', error: error.message });
  }
};

const uploadPanDocuments = async (req, res) => {
  try {
    const companyCtx = await getCompanyFromHeaders(req);
    if (companyCtx.error) {
      return res.failure({ message: companyCtx.error });
    }

    const { companyId, company } = companyCtx;
    const userCtx = await loadUserContext(req, companyId);
    if (userCtx.error) {
      return res.failure({ message: userCtx.error });
    }

    const { user } = userCtx;
    const front_photo = req.files?.front_photo?.[0];

    if (!front_photo) {
      const receivedFields = req.files ? Object.keys(req.files).join(', ') : 'none';
      return res.failure({
        message: 'Front photo is required',
        receivedFields: receivedFields || 'none',
        expectedFields: ['front_photo']
      });
    }

    const extractPanNumber = (panValue) => {
      if (!panValue) return null;
      const cleaned = panValue.toString().replace(/\s/g, '').toUpperCase();
      if (cleaned.length === 10 && /^[A-Z]{5}\d{4}[A-Z]$/.test(cleaned)) {
        return cleaned;
      }
      return null;
    };

    const staticBackImagePath = path.join(__dirname, '../../../public/panbackside.jpeg');

    const [frontData, frontPhoto, staticBackImageBuffer] = await Promise.all([
      textractService.extractPanData(front_photo.buffer),
      textractService.extractPanPhoto(front_photo.buffer),
      fs.promises.readFile(staticBackImagePath)
    ]);

    if (!frontData.success) {
      return res.failure({
        message: frontData.error || 'Failed to extract data from front image',
        data: {
          textractVerification: {
            success: false,
            message: frontData.error || 'Failed to extract data from front image',
            faceComparison: null
          }
        }
      });
    }

    let extractedPanNumber = extractPanNumber(frontData.pan_number);

    if (!extractedPanNumber && frontData.rawText) {
      const match = frontData.rawText.match(/[A-Z]{4,5}\s*[A-Z]?\d{4}[A-Z]/);
      if (match) {
        const cleaned = match[0].replace(/\s/g, '').toUpperCase();
        if (cleaned.length === 10 && /^[A-Z]{5}\d{4}[A-Z]$/.test(cleaned)) {
          extractedPanNumber = cleaned;
        }
      }
    }

    if (!extractedPanNumber) {
      return res.failure({
        message: 'Could not extract PAN number from image. Please ensure the PAN card image is clear and readable.',
        data: {
          textractVerification: {
            success: false,
            message: 'Could not extract PAN number from image',
            faceComparison: null
          }
        }
      });
    }

    let frontImageS3Key = null;
    let backImageS3Key = null;
    let faceComparisonResult = null;
    let panExistsInDigilocker = false;
    let verificationMessage = 'PAN card processed successfully';

    const [existingUser, digilockerPanDoc, aadhaarDocResult] = await Promise.all([
      dbService.findOne(model.user, { id: user.id }),
      dbService.findOne(model.digilockerDocument, {
        refId: user.id,
        companyId: company.id,
        documentType: 'PAN',
        panNumber: extractedPanNumber,
        isDeleted: false
      }),
      userCtx.aadhaarDoc
        ? null
        : dbService.findOne(model.digilockerDocument, {
            refId: user.id,
            companyId: company.id,
            documentType: 'AADHAAR',
            isDeleted: false
          })
    ]);

    const aadhaarDoc = userCtx.aadhaarDoc || aadhaarDocResult;
    const oldFrontImageKey = extractS3Key(existingUser?.panCardFrontImage);
    const oldBackImageKey = extractS3Key(existingUser?.panCardBackImage);

    if (digilockerPanDoc) {
      panExistsInDigilocker = true;
    }

    if (aadhaarDoc?.photoLink && frontPhoto) {
      try {
        const aadhaarPhotoBase64 = await extractBase64FromImage(aadhaarDoc.photoLink);
        const panPhotoBase64 = frontPhoto;

        if (aadhaarPhotoBase64 && panPhotoBase64) {
          const aadhaarBuffer = validateAndConvertBase64(aadhaarPhotoBase64);
          const panBuffer = validateAndConvertBase64(panPhotoBase64);

          if (aadhaarBuffer && panBuffer) {
            faceComparisonResult = await rekognitionService.compareFaces(
              aadhaarBuffer.toString('base64'),
              panBuffer.toString('base64')
            );

            if (faceComparisonResult?.success && faceComparisonResult?.matched) {
              verificationMessage = panExistsInDigilocker ? 'PAN verification success' : 'PAN card processed successfully';

              const [frontUploadResult, backUploadResult] = await Promise.all([
                imageService.uploadImageToS3(
                  front_photo.buffer,
                  front_photo.originalname || 'front_pan_photo.jpg',
                  'pan',
                  company.id,
                  'front',
                  user.id
                ),
                imageService.uploadImageToS3(
                  staticBackImageBuffer,
                  'panbackside.jpeg',
                  'pan',
                  company.id,
                  'back',
                  user.id
                )
              ]);

              frontImageS3Key = frontUploadResult.key;
              backImageS3Key = backUploadResult.key;
              
              const updateData = {
                panCardFrontImage: frontImageS3Key,
                panCardBackImage: backImageS3Key,
                panVerify: true,
                // Mark manual PAN upload as completed
                isPanUploaded: true
              };

              const updatePromises = [
                dbService.update(model.user, { id: user.id }, updateData),
                updateKycStatus(user.id, company.id, { aadhaarDoc: aadhaarDoc })
              ];

              cleanupOldImages(oldFrontImageKey, oldBackImageKey, frontImageS3Key, backImageS3Key).catch(() => {});

              await Promise.all(updatePromises);
            } else {
              verificationMessage = 'Pls check your uploaded Image';
            }
          }
        }
      } catch {
        verificationMessage = 'PAN verification failed - Error during face comparison';
      }
    } else {
      verificationMessage = 'Aadhaar photo not available for verification';
    }

    if (faceComparisonResult && !faceComparisonResult.matched) {
      return res.failure({
        message: verificationMessage || 'PAN verification failed',
        data: {
          textractVerification: {
            success: true,
            pan_number: extractedPanNumber,
            message: verificationMessage || 'PAN verification failed',
            faceComparison: {
              matched: faceComparisonResult.matched,
              similarity: faceComparisonResult.similarity
            }
          }
        }
      });
    }

    if (!faceComparisonResult && frontData.success) {
      return res.failure({
        message: verificationMessage || 'Aadhaar photo not available for verification',
        data: {
          textractVerification: {
            success: true,
            pan_number: extractedPanNumber,
            message: verificationMessage || 'Aadhaar photo not available for verification',
            faceComparison: null
          }
        }
      });
    }

    const textractVerificationResponse = {
      success: true,
      pan_number: extractedPanNumber,
      message: verificationMessage,
      faceComparison: faceComparisonResult
        ? {
            matched: faceComparisonResult.matched,
            similarity: faceComparisonResult.similarity
          }
        : null
    };

    return res.success({
      message: 'PAN documents uploaded successfully',
      data: {
        panCardFrontImage: frontImageS3Key,
        panCardBackImage: backImageS3Key,
        textractVerification: textractVerificationResponse
      }
    });
  } catch (error) {
    return res.failure({ message: 'Failed to upload PAN documents', error: error.message });
  }
};



module.exports = {
  postReferCode,
  sendSmsMobile,
  verifySmsOtp,
  resetSmsOtp,
  sendEmailOtp,
  verifyEmailOtp,
  resetEmailOtp,
  connectAadhaarVerification,
  connectPanVerification,
  getDigilockerDocuments,
  postShopDetails,
  postBankDetails,
  postProfile,
  getPending,
  uploadAadharDocuments,
  uploadPanDocuments
};

