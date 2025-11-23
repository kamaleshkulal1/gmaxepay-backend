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
const rekognitionService = require('../../../services/rekognitionService');
const razorpayApi = require('../../../services/razorpayApi');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const key = Buffer.from(process.env.AES_KEY, 'hex');
const { generateUniqueReferCode } = require('../../../utils/generateUniqueReferCode');
const { generateUserToken, decryptUserToken } = require('../../../utils/userToken');

// Get company ID and domain from headers
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

// Load user context
const loadUserContext = async (req, companyId) => {
  // Get userId from token header instead of request body
  const userToken = req.get('token');
  
  if (!userToken) {
    return { error: 'token header is required' };
  }

  // Decrypt user token to get userId
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

  // Find customer record to lookup customerBank (customerBank.refId references customer table)
  const customer = await dbService.findOne(model.customer, {
    mobile: user.mobileNo
  });
  
  // Find customerBank using customer.id if customer exists, otherwise try user.id for backward compatibility
  let customerBank = null;
  if (customer) {
    customerBank = await dbService.findOne(model.customerBank, { refId: customer.id, companyId: companyId });
  }
  // Fallback: try with user.id for backward compatibility with old data
  if (!customerBank) {
    customerBank = await dbService.findOne(model.customerBank, { refId: user.id, companyId: companyId });
  }

  // Fetch digilocker documents for Aadhaar and PAN
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

  // Get image URLs (keys are already decrypted by model hooks)
  // Profile images use simple CDN URLs, other images use secure proxy
  const getImageUrl = (imageData, isProfileImage = false) => {
    if (!imageData) return null;
    // Extract plain key from image data (already decrypted by model hooks)
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
    // For profile images, use simple CDN URL (no secure proxy)
    // For other images, use secure proxy
    return imageService.getImageUrl(plainKey, !isProfileImage);
  };

  const userDetails = {
    userId: user.id,
    mobileVerify: user.mobileVerify,
    emailVerify: user.emailVerify,
    aadharVerify: user.aadharVerify,
    panVerify: user.panVerify,
    mobileNo: user.mobileNo,
    email: user.email,
    profileImage: getImageUrl(user.profileImage, true), // true = is profile image, use simple CDN
    aadharFrontImage: getImageUrl(user.aadharFrontImage, false),
    aadharBackImage: getImageUrl(user.aadharBackImage, false),
    panCardFrontImage: getImageUrl(user.panCardFrontImage, false),
    panCardBackImage: getImageUrl(user.panCardBackImage, false),
  };

  // Get secure shop image URL
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
  } : null;

  return { user, outlet, customerBank, userDetails, outletDetails, customerBankDetails, aadhaarDoc, panDoc, customer };
};

const getPendingSteps = (ctx) => {
  const userDetails = ctx.userDetails || ctx.user || {};
  const user = ctx.user || {};
  const outletDetails = ctx.outletDetails || ctx.outlet || null;
  const customerBankDetails = ctx.customerBankDetails || ctx.customerBank || null;
  const aadhaarDoc = ctx.aadhaarDoc || null;
  const panDoc = ctx.panDoc || null;
  
  // Helper to extract S3 key from JSON field
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
  const aadhaarUpload = !!(aadhaarFrontImageKey && aadhaarBackImageKey);
  
  // Check PAN sub-steps
  const panConnect = !!(panDoc && panDoc.verificationId);
  const panDownload = !!(panDoc && panDoc.panNumber); // If panNumber exists, document is downloaded
  const panFrontImageKey = extractS3Key(panCardFrontImage);
  const panBackImageKey = extractS3Key(panCardBackImage);
  const panUpload = !!(panFrontImageKey && panBackImageKey);
  
  // Check if verification is done via user flags (for manual verification)
  const aadharVerifyFlag = !!(user.aadharVerify || userDetails?.aadharVerify);
  const panVerifyFlag = !!(user.panVerify || userDetails?.panVerify);
  
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
                          !!(customerBankDetails && customerBankDetails.accountNumber && customerBankDetails.ifsc);
  
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
    console.error('Error updating KYC status:', error);
    return null;
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
      console.error('Error encrypting referCode for search:', error);
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
    console.error('Error in postReferCode:', error);
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
    console.error('Error encrypting referCode for search:', error);
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

    // If user exists, check userRole - only roles 3, 4, 5 can access
    if (existingUser) {
      // Check if user belongs to the same company (convert both to numbers for comparison)
      const existingUserCompanyId = Number(existingUser.companyId);
      const requestCompanyId = Number(companyId);
      
      if (existingUserCompanyId !== requestCompanyId) {
        return res.failure({ message: 'Invalid company' });
      }
      // Check if userRole is 1 or 2 - deny access
      if (existingUser.userRole === 1 || existingUser.userRole === 2) {
        return res.failure({ 
          message: 'Access denied. This mobile number is registered with an admin account.' 
        });
      }

      // Check if any verification is already completed
      // Prevent duplicate user creation - if user exists with any verification, return pending steps
      const isMobileVerified = existingUser.mobileVerify === true || existingUser.mobileVerify === 'true';
      const isEmailVerified = existingUser.emailVerify === true || existingUser.emailVerify === 'true';
      const isAadharVerified = existingUser.aadharVerify === true || existingUser.aadharVerify === 'true';
      const isPanVerified = existingUser.panVerify === true || existingUser.panVerify === 'true';
      const isBankVerified = existingUser.bankDetailsVerify === true || existingUser.bankDetailsVerify === 'true';
      
      // If any verification is completed, return with pending steps (no duplicate user creation, no OTP)
      if (isMobileVerified || isEmailVerified || isAadharVerified || isPanVerified || isBankVerified) {
        // Generate userToken for existing verified user
        const userToken = generateUserToken(existingUser.id);
        
        // Fetch related data for pending steps
        const outlet = await dbService.findOne(model.outlet, { 
          refId: existingUser.id, 
          companyId: companyId 
        });

        // Find customer record to lookup customerBank
        const customer = await dbService.findOne(model.customer, {
          mobile: existingUser.mobileNo
        });
        
        // Find customerBank using customer.id if customer exists, otherwise try user.id for backward compatibility
        let customerBank = null;
        if (customer) {
          customerBank = await dbService.findOne(model.customerBank, { refId: customer.id, companyId: companyId });
        }
        if (!customerBank) {
          customerBank = await dbService.findOne(model.customerBank, { refId: existingUser.id, companyId: companyId });
        }

        // Fetch digilocker documents for Aadhaar and PAN
        const [aadhaarDoc, panDoc] = await Promise.all([
          dbService.findOne(model.digilockerDocument, {
            refId: existingUser.id,
            companyId: companyId,
            documentType: 'AADHAAR',
            isDeleted: false
          }),
          dbService.findOne(model.digilockerDocument, {
            refId: existingUser.id,
            companyId: companyId,
            documentType: 'PAN',
            isDeleted: false
          })
        ]);

        // Create userDetails object for getPendingSteps
        const userDetails = {
          userId: existingUser.id,
          mobileVerify: existingUser.mobileVerify,
          emailVerify: existingUser.emailVerify,
          aadharVerify: existingUser.aadharVerify,
          panVerify: existingUser.panVerify,
          mobileNo: existingUser.mobileNo,
          email: existingUser.email,
          aadharFrontImage: existingUser.aadharFrontImage,
          aadharBackImage: existingUser.aadharBackImage,
          panCardFrontImage: existingUser.panCardFrontImage,
          panCardBackImage: existingUser.panCardBackImage,
          shopDetailsVerify: existingUser.shopDetailsVerify,
          bankDetailsVerify: existingUser.bankDetailsVerify,
          profileImageWithShopVerify: existingUser.profileImageWithShopVerify
        };

        const outletDetails = outlet ? {
          outletId: outlet.id || null,
          shopName: outlet.shopName,
          shopAddress: outlet.shopAddress,
          gstNo: outlet.gstNo,
          mobileNo: outlet.mobileNo,
          zipCode: outlet.zipCode,
          shopImage: outlet.shopImage
        } : null;

        const customerBankDetails = customerBank ? {
          customerBankId: customerBank.id,
          accountNumber: customerBank.accountNumber,
          ifsc: customerBank.ifsc,
        } : null;

        // Get pending steps
        const pendingInfo = getPendingSteps({ 
          user: existingUser, 
          userDetails: userDetails, 
          outletDetails: outletDetails, 
          customerBankDetails: customerBankDetails, 
          aadhaarDoc: aadhaarDoc, 
          panDoc: panDoc 
        });
        
        // Determine appropriate message based on what's verified
        let message = 'User already exists';
        if (isMobileVerified) {
          message = 'Mobile already verified';
        } else if (isEmailVerified) {
          message = 'Email is already verified';
        } else if (isAadharVerified) {
          message = 'Aadhaar is already verified';
        } else if (isPanVerified) {
          message = 'PAN is already verified';
        } else if (isBankVerified) {
          message = 'Bank details are already verified';
        }
        
        return res.success({ 
          message: message, 
          data: { 
            userToken: userToken,
            mobileNo: cleanMobileNo,
            mobileVerify: isMobileVerified,
            emailVerify: isEmailVerified,
            aadharVerify: isAadharVerified,
            panVerify: isPanVerified,
            bankVerify: isBankVerified,
            status: 'verified',
            userRole: existingUser.userRole,
            steps: pendingInfo.steps,
            pending: pendingInfo.pending,
            allCompleted: pendingInfo.allCompleted
          } 
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
      console.log('smsResult', smsResult);
      // Check if SMS was sent successfully
      // SMS API might return different response formats, so we check for common error indicators
      if (smsResult && typeof smsResult === 'object') {
        // Check for error status or error message
        if (smsResult.error || (smsResult.status && smsResult.status.toLowerCase() === 'error')) {
          return res.failure({ message: 'Failed to send SMS. Please try again.' });
        }
      }
    } catch (smsError) {
      console.error('SMS sending error:', smsError);
      return res.failure({ message: 'Failed to send SMS. Please try again.' });
    }

    // If user exists but mobileVerify is false, update OTP only (don't create new user)
    if (existingUser && existingUser.mobileVerify === false) {
      // Check if userRole is 1 or 2 - deny access
      if (existingUser.userRole === 1 || existingUser.userRole === 2) {
        return res.failure({ 
          message: 'Access denied. This mobile number is registered with an admin account.' 
        });
      }

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
      loggedIn: false
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
        apesWallet: 0,
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
    console.error('Error in mobile verification:', error);
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
    console.error('Error verifying mobile OTP:', error);
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
    console.error('Error resetting mobile OTP:', error);
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
    console.error('Error sending email OTP:', error);
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
    console.error('Error verifying email OTP:', error);
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
    console.error('Error resetting email OTP:', error);
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
    
    if (existingDoc) {
      return res.failure({ message: 'Aadhaar verification already processed. Please download from digilocker' });
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
    console.error('Error connecting Aadhaar verification:', error);
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

    const { companyId ,company} = companyCtx;
    const userCtx = await loadUserContext(req, companyId);
    if (userCtx.error) {
      return res.failure({ message: userCtx.error });
    }

    const { user } = userCtx;
    const companyDomain = company.customDomain;
    if(!company.customDomain || !companyDomain) {
      return res.failure({ message: 'Pan verification is not allowed for this company' });
    }
    const redirect_url = `https://${companyDomain || company?.customDomain}/setup`;

    if (!redirect_url) {
      return res.failure({ message: 'Redirect URL is required' });
    }

    // Check if document already exists (already processed)
    const existingDoc = await dbService.findOne(model.digilockerDocument, {
      refId: user.id,
      companyId: companyId,
      documentType: 'PAN',
      isDeleted: false
    });
    
    if (existingDoc) {
      return res.failure({ message: 'PAN verification already processed. Please download from digilocker' });
    }
    
    const response = await ekycHub.createPanVerificationUrl(redirect_url);
    console.log("response",response);

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
    console.error('Error connecting PAN verification:', error);
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

    const existingUser = await dbService.findOne(model.user, { 
      id: userId, 
      companyId: companyId, 
      isDeleted: false 
    });
    if(!existingUser) {
      console.error(`[getDigilockerDocuments] User not found - User ID: ${userId}, Company ID: ${companyId}`);
      return res.failure({ message: 'User not found' });
    }

    const existingDigilockerDocument = await dbService.findOne(model.digilockerDocument, {
      refId: userId,
      companyId: companyId,
      documentType: docType,
      isDeleted: false
    }, {
      sort: { id: -1 }
    });
   
    if (!existingDigilockerDocument) {
      return res.failure({ message: `Please connect your ${docType === 'AADHAAR' ? 'Aadhaar' : 'PAN'} to digilocker first` });
    }

    if (!existingDigilockerDocument.verificationId) {
      return res.failure({ message: 'Verification ID is required. Please connect verification first' });
    }

    if (!existingDigilockerDocument.referenceId) {
      return res.failure({ message: 'Reference ID is required. Please connect verification first' });
    }

    const verification_id = existingDigilockerDocument.verificationId;
    const reference_id = existingDigilockerDocument.referenceId;
    
    
    let response;
    let shouldFetchFromApi = true;
    
    const isUserVerified = docType === 'AADHAAR' ? existingUser.aadharVerify : existingUser.panVerify;
    
    const hasFullData = (docType === 'AADHAAR' && existingDigilockerDocument.name) || (docType === 'PAN' && existingDigilockerDocument.panNumber);
    
    if (isUserVerified && hasFullData) {
      response = {
        status: 'SUCCESS',
        message: `${docType === 'AADHAAR' ? 'Aadhaar' : 'PAN'} Verification Already Processed`,
        data: {
          reference_id: existingDigilockerDocument.referenceId,
          verification_id: existingDigilockerDocument.verificationId,
          status: existingDigilockerDocument.status,
          ...(docType === 'AADHAAR' ? {
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
          } : {
            pan_number: existingDigilockerDocument.panNumber,
            name: existingDigilockerDocument.panName,
            father_name: existingDigilockerDocument.panFatherName,
            dob: existingDigilockerDocument.panDob
          }),
          message: existingDigilockerDocument.message,
          txid: existingDigilockerDocument.txid
        }
      };
      shouldFetchFromApi = false;
    }
    
    if (shouldFetchFromApi) {
      console.log("verification_id",verification_id);
      console.log("reference_id",reference_id);
      console.log("document_type",document_type);
      response = await ekycHub.getDocuments(verification_id, reference_id, document_type);
      console.log("response",response);
      
      // Handle both 'Success' and 'SUCCESS' status, and check if data is nested
      const responseStatus = (response?.status || '').toString().toUpperCase();
      const isSuccess = responseStatus === 'SUCCESS' || responseStatus === 'SUCCEED' || responseStatus === 'Success';
      
      if (response && isSuccess) {
        // Extract data from response.data if it exists, otherwise use response directly
        const docData = response.data || response;
        const updateData = {
          referenceId: docData.reference_id || reference_id || existingDigilockerDocument.referenceId,
          status: docData.status || response.status || 'Success',
          message: docData.message || response.message || null,
          txid: docData.txid || null,
          fullResponse: response
        };
        
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
        } else if (docType === 'PAN') {
          // Map API response fields to database fields
          // API returns: pan, name_pan_card, dob, type, gender, xml_file
          updateData.panNumber = docData.pan || docData.pan_number || null;
          updateData.panName = docData.name_pan_card || docData.name || null;
          updateData.panFatherName = docData.father_name || docData.fatherName || null;
          updateData.panDob = docData.dob || null;
          // Store additional fields if needed (type, gender, xml_file)
          // Note: xml_file is stored in xmlFile field (shared with Aadhaar)
          if (docData.xml_file) {
            updateData.xmlFile = docData.xml_file;
          }
        }
        
        console.log(`[getDigilockerDocuments] Update data for ${docType}:`, JSON.stringify(updateData, null, 2));
        
        await dbService.update(
          model.digilockerDocument,
          { 
            id: existingDigilockerDocument.id,
            refId: userId,
            companyId: companyId,
            documentType: docType,
            isDeleted: false
          },
          updateData
        );
        console.log(`[getDigilockerDocuments] Document updated successfully for User ID: ${userId}, Document Type: ${docType}`);
        
        if (docType === 'AADHAAR') {
          const userUpdateData = {
            aadharVerify: true,
            name: updateData.name
          };
          if (updateData.dob) {
            userUpdateData.dob = updateData.dob;
          }
          await dbService.update(model.user, { 
            id: userId,
            companyId: companyId,
            isDeleted: false
          }, userUpdateData);
          console.log(`[getDigilockerDocuments] User Aadhaar verification updated for User ID: ${userId}`);
        } else if (docType === 'PAN') {
          await dbService.update(model.user, { 
            id: userId,
            companyId: companyId,
            isDeleted: false
          }, { panVerify: true });
          console.log(`[getDigilockerDocuments] User PAN verification updated for User ID: ${userId}`);
        }
        
        // Update KYC status after document download
        await updateKycStatus(userId, companyId, { aadhaarDoc: docType === 'AADHAAR' ? existingDigilockerDocument : userCtx?.aadhaarDoc, panDoc: docType === 'PAN' ? existingDigilockerDocument : userCtx?.panDoc });
      } else {
        return res.failure({ 
          message: `Failed to fetch ${docType === 'AADHAAR' ? 'Aadhaar' : 'PAN'} document from digilocker`, 
          data: response 
        });
      }
    }

    const message = docType === 'AADHAAR' 
      ? 'Aadhaar Verification Downloaded' 
      : 'PAN Verification Downloaded';

    if (docType === 'PAN') {
      const docData = response.data || response || {};
      const panDetailsPayload = {
        status: 'SUCCESS',
        message,
        data: {
          reference_id: docData.reference_id ?? docData.referenceId ?? existingDigilockerDocument.referenceId ?? null,
          verification_id: docData.verification_id ?? docData.verificationId ?? existingDigilockerDocument.verificationId ?? null,
          status: docData.status ?? response.status ?? 'Success',
          pan_number: docData.pan_number ?? docData.pan ?? existingDigilockerDocument.panNumber ?? null,
          name: docData.name ?? docData.name_pan_card ?? existingDigilockerDocument.panName ?? null,
          father_name: docData.father_name ?? docData.fatherName ?? existingDigilockerDocument.panFatherName ?? null,
          dob: docData.dob ?? existingDigilockerDocument.panDob ?? null,
          message: docData.message ?? response.message ?? existingDigilockerDocument.message ?? null,
          txid: docData.txid ?? existingDigilockerDocument.txid ?? null
        }
      };

      const existingPanDetails = existingUser.panDetails || null;
      const shouldUpdatePanDetails = !existingPanDetails || JSON.stringify(existingPanDetails) !== JSON.stringify(panDetailsPayload);

      if (shouldUpdatePanDetails) {
        await dbService.update(
          model.user,
          { id: userId, companyId: companyId, isDeleted: false },
          { panDetails: panDetailsPayload }
        );
        console.log(`[getDigilockerDocuments] Stored PAN details for User ID: ${userId}`);
      }
    }
    
    return res.success({ message, data: response.data || response });
  } catch (error) {
    console.error('[getDigilockerDocuments] Error:', error);
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
    const { shopName, ipAddress, latitude, longitude } = req.body || {};

    if (!shopName || !ipAddress || !latitude || !longitude) {
      return res.failure({ 
        message: 'shopName, ipAddress, latitude and longitude are required' 
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
          console.error('Error deleting old shop image from S3:', error);
          // Continue even if deletion fails
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

    // Set shopDetailsVerify to true in user table (prevents multiple shops)
    await dbService.update(model.user, { id: user.id }, { shopDetailsVerify: true });

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
    console.error('Error in shop details:', error);
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
          const decryptedResponse = decrypt(encryptedData, Buffer.from(key, 'hex'));
          if (decryptedResponse) {
            bankVerification = JSON.parse(decryptedResponse);
          } else {
            bankVerification = encryptedData;
          }
        } else {
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

    if (bankVerification.status !== 'Success') {
      return res.failure({ message: 'Bank verification failed' });
    }
    
    // Fetch bank details from Razorpay API using IFSC
    let razorpayBankData = null;
    try {
      razorpayBankData = await razorpayApi.bankDetails(ifsc);
    } catch (error) {
      console.error('Error fetching bank details from Razorpay:', error);
      // Continue without Razorpay data if API fails
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
      console.error('Bank beneficiary name is missing');
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
      console.error('Name similarity is below threshold (60%)');
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

    // Find or create customer record (customerBank.refId references customer table, not user)
    let customer = userCtx.customer || await dbService.findOne(model.customer, {
      mobile: user.mobileNo
    });

    if (!customer) {
      // Create customer record from user data
      const customerName = user.name || '';
      const nameParts = customerName.split(' ');
      const firstName = nameParts[0] || customerName;
      const lastName = nameParts.slice(1).join(' ') || null;

      customer = await dbService.createOne(model.customer, {
        firstName,
        lastName,
        email: user.email || null,
        mobile: user.mobileNo,
        isActive: true
      });
    }

    let updatedCustomerBank = customerBank;
    const payload = {
      refId: customer.id, 
      companyId: company.id,
      bankName,
      beneficiaryName: beneficiaryName || user.name,
      accountNumber,
      ifsc,
      city: city || null,
      branch: branch || null,
      isActive: true
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
    console.error('Error in bank details:', error);
    return res.failure({ message: 'Failed to save bank details', error: error.message });
  }
};

// Step 7: Profile
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
      console.error('Error processing profile image:', imageError);
      // Return user-friendly error message
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
        console.error('Error sending temporary password email:', emailError);
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
    console.error('Error in profile update:', error);
    return res.failure({ message: 'Failed to update profile', error: error.message });
  }
};

// Get pending steps
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

    const { user, outlet, customerBank, aadhaarDoc, panDoc } = userCtx;
    const pendingInfo = getPendingSteps({ 
      user, 
      outlet, 
      customerBank,
      aadhaarDoc,
      panDoc
    });

    return res.success({ 
      message: 'Pending steps fetched', 
      data: pendingInfo 
    });
  } catch (error) {
    console.error('Error fetching pending steps:', error);
    return res.failure({ message: 'Failed to fetch pending steps', error: error.message });
  }
};

// Helper functions
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
        console.error('Downloaded image is not JPEG or PNG. URL:', imageString);
        return null;
      }
      
      // Convert to base64
      return buffer.toString('base64');
    } catch (error) {
      console.error('Error downloading image from URL:', imageString, error.message);
      return null;
    }
  }
  
  // If it's already a base64 string, return as is
  // Validate it's a valid base64 string
  try {
    // Check if it's a valid base64 string (basic validation)
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    const cleaned = imageString.replace(/\s/g, '');
    if (base64Regex.test(cleaned)) {
      return cleaned;
    }
  } catch (e) {
    console.error('Error validating base64 string:', e);
  }
  
  return null;
};

// Helper function to validate and convert base64 to buffer
const validateAndConvertBase64 = (base64String) => {
  if (!base64String) return null;
  
  try {
    // Remove any whitespace
    const cleanBase64 = base64String.replace(/\s/g, '');
    
    // Validate base64 format
    if (!/^[A-Za-z0-9+/=]+$/.test(cleanBase64)) {
      console.error('Invalid base64 format');
      return null;
    }
    
    // Convert to buffer
    const buffer = Buffer.from(cleanBase64, 'base64');
    
    // Validate buffer is not empty and has minimum size (at least 100 bytes for a valid image)
    if (buffer.length < 100) {
      console.error('Image buffer too small:', buffer.length);
      return null;
    }
    
    // Validate it's a valid image format (JPEG or PNG)
    // JPEG starts with FF D8 FF
    // PNG starts with 89 50 4E 47
    const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    
    if (!isJPEG && !isPNG) {
      console.error('Invalid image format. Expected JPEG or PNG. First bytes:', buffer.slice(0, 4));
      return null;
    }
    
    // AWS Rekognition has a 15MB limit
    if (buffer.length > 15 * 1024 * 1024) {
      console.error('Image too large:', buffer.length, 'bytes');
      return null;
    }
    
    return buffer;
  } catch (error) {
    console.error('Error converting base64 to buffer:', error);
    return null;
  }
};

const cleanupOldImages = async (oldFrontKey, oldBackKey, newFrontKey, newBackKey) => {
  const cleanupPromises = [];
  if (oldFrontKey && oldFrontKey !== newFrontKey) {
    cleanupPromises.push(
      imageService.deleteImageFromS3(oldFrontKey).catch(err => 
        console.error('Error deleting old front image from S3:', err)
      )
    );
  }
  if (oldBackKey && oldBackKey !== newBackKey) {
    cleanupPromises.push(
      imageService.deleteImageFromS3(oldBackKey).catch(err => 
        console.error('Error deleting old back image from S3:', err)
      )
    );
  }
  await Promise.all(cleanupPromises);
};

// Upload Aadhaar documents
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
    
    const [frontUploadResult, backUploadResult, llmResponse] = await Promise.all([
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
      ),
      llmService.llmAadhaarOcr(front_photo, back_photo)
    ]);
    
    const frontImageS3Key = frontUploadResult.key;
    const backImageS3Key = backUploadResult.key;
    
    if (!llmResponse || !llmResponse.success) {
      await dbService.update(model.user, { id: user.id }, {
        aadharFrontImage: frontImageS3Key,
        aadharBackImage: backImageS3Key
      }).catch(err => console.error('Error updating user images:', err));
      
      await cleanupOldImages(oldFrontImageKey, oldBackImageKey, frontImageS3Key, backImageS3Key);
      
      const errorMessage = llmResponse?.message || llmResponse?.error || 'Failed to extract Aadhar data';
      return res.failure({ message: errorMessage });
    }
    
    const extractedData = {
      aadhaar_number: llmResponse.aadhaar_number || null,
      photo: llmResponse.photo || null,
      dob: llmResponse.dob || null,
      aadhaar_numbers_match: llmResponse.aadhaar_numbers_match || false
    };

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
            await dbService.update(model.user, { id: user.id }, {
              aadharFrontImage: frontImageS3Key,
              aadharBackImage: backImageS3Key
            }).catch(err => console.error('Error updating user images:', err));
            
            await cleanupOldImages(oldFrontImageKey, oldBackImageKey, frontImageS3Key, backImageS3Key);
            
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
            console.error('Failed to extract base64 from photos');
            return res.failure({ message: 'Invalid photo data. Please try again.' });
          }

          // Validate and convert base64 to buffers
          const photoLinkBuffer = validateAndConvertBase64(photoLinkBase64);
          const extractedPhotoBuffer = validateAndConvertBase64(extractedPhotoBase64);

          if (!photoLinkBuffer || !extractedPhotoBuffer) {
            console.error('Failed to convert photo base64 to buffer');
            return res.failure({ message: 'Invalid photo format. Please try again.' });
          }

          // Convert buffers to base64 for Rekognition service
          const photoLinkBase64ForRekognition = photoLinkBuffer.toString('base64');
          const extractedPhotoBase64ForRekognition = extractedPhotoBuffer.toString('base64');

          const faceComparison = await rekognitionService.compareFaces(
            photoLinkBase64ForRekognition, 
            extractedPhotoBase64ForRekognition
          );
          console.log("faceComparison",faceComparison);
          
          validationResults.photoMatch = faceComparison.success && faceComparison.matched;
          if(!validationResults.photoMatch){
            return res.failure({ message: 'pls check your uploaded image' });
          }
          if (!faceComparison.success) {
            console.error('AWS Rekognition error:', faceComparison.error);
          }
        } catch (faceError) {
          console.error('Error comparing faces:', faceError);
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
      aadharBackImage: backImageS3Key
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
      if (dbError.name === 'SequelizeDatabaseError' && 
          (errorMessage.includes('too long') || errorMessage.includes('value too long'))) {
        if (aadharDetailsPayload) {
          const minimalDetails = {
            aadhaarLast4: aadharDetailsPayload.aadhaarLast4 || null,
            aadhaarNumber: canPersistFullAadhaarNumber ? sanitizedAadhaarNumber : null
          };
          try {
            updateData.aadharDetails = minimalDetails;
            await dbService.update(model.user, { id: user.id }, updateData);
          } catch (secondError) {
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
    
    // Update KYC status after Aadhaar upload
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
          responseMessage = `Aadhar documents uploaded successfully. However, some validations failed: ${failedValidations.join(', ')}`;
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
    console.error('Error in upload Aadhar documents:', error);
    return res.failure({ message: 'Failed to upload Aadhar documents', error: error.message });
  }
};

// Upload PAN documents
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
    
    // Call LLM service for PAN verification first
    const llmResult = await llmService.llmPanVerification(front_photo);
    
    // Initialize response variables
    let frontImageS3Key = null;
    let backImageS3Key = null;
    let faceComparisonResult = null;
    let panExistsInDigilocker = false;
    let uploaded = false;
    let verificationMessage = llmResult?.message || 'PAN card processed successfully';
    
    // Only proceed if LLM verification succeeds
    if (llmResult?.success && llmResult?.data?.pan_number) {
      const extractedPanNumber = llmResult.data.pan_number;
      
      // Read static back image file
      const staticBackImagePath = path.join(__dirname, '../../../public/panbackside.jpeg');
      const staticBackImageBuffer = fs.readFileSync(staticBackImagePath);
      
      // Parallelize: Get existing user data, check digilocker PAN, and fetch Aadhaar doc
      const [existingUser, digilockerPanDoc, aadhaarDocResult] = await Promise.all([
        dbService.findOne(model.user, { id: user.id }),
        dbService.findOne(model.digilockerDocument, {
          refId: user.id,
          companyId: company.id,
          documentType: 'PAN',
          panNumber: extractedPanNumber,
          isDeleted: false
        }),
        // Fetch Aadhaar doc only if not in context (parallel fetch)
        userCtx.aadhaarDoc ? Promise.resolve(null) : dbService.findOne(model.digilockerDocument, {
          refId: user.id,
          companyId: company.id,
          documentType: 'AADHAAR',
          isDeleted: false
        })
      ]);
      
      // Use Aadhaar doc from context if available, otherwise use fetched result
      const aadhaarDoc = userCtx.aadhaarDoc || aadhaarDocResult;
      
      const oldFrontImageKey = extractS3Key(existingUser?.panCardFrontImage);
      const oldBackImageKey = extractS3Key(existingUser?.panCardBackImage);
      
      // Check if PAN exists in digilocker
      if (digilockerPanDoc) {
        panExistsInDigilocker = true;
      }
      
      // Perform face comparison first (before uploading to S3)
      // Use front_photo.buffer directly instead of base64 from LLM result
      if (aadhaarDoc?.photoLink && front_photo.buffer) {
        try {
          // Extract base64 from Aadhaar photo
          const aadhaarPhotoBase64 = await extractBase64FromImage(aadhaarDoc.photoLink);
          
          // Use front_photo.buffer directly for PAN photo (convert to base64)
          const panPhotoBase64 = front_photo.buffer.toString('base64');
          
          if (aadhaarPhotoBase64 && panPhotoBase64) {
            const aadhaarBuffer = validateAndConvertBase64(aadhaarPhotoBase64);
            const panBuffer = validateAndConvertBase64(panPhotoBase64);
            
            if (aadhaarBuffer && panBuffer) {
              faceComparisonResult = await rekognitionService.compareFaces(
                aadhaarBuffer.toString('base64'),
                panBuffer.toString('base64')
              );
              
              // Only proceed with S3 upload if face matches
              if (faceComparisonResult?.success && faceComparisonResult?.matched) {
                uploaded = true;
                verificationMessage = panExistsInDigilocker ? 'PAN verification success' : 'PAN card processed successfully';
                
                // Upload images to S3 only if face comparison matches
                const [frontUploadResult, backUploadResult] = await Promise.all([
                  imageService.uploadImageToS3(
                    front_photo.buffer,
                    front_photo.originalname || 'front_photo.jpg',
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
                
                // Update user records with uploaded image keys
                const updateData = {
                  panCardFrontImage: frontImageS3Key,
                  panCardBackImage: backImageS3Key,
                  panVerify: true
                };
                
                await dbService.update(model.user, { id: user.id }, updateData);
                await cleanupOldImages(oldFrontImageKey, oldBackImageKey, frontImageS3Key, backImageS3Key);
                
                // Update KYC status after PAN upload
                await updateKycStatus(user.id, company.id, { aadhaarDoc: aadhaarDoc });
              } else {
                // If face doesn't match, set verification failed message (no S3 upload)
                verificationMessage = 'PAN verification failed';
              }
            }
          }
        } catch (comparisonError) {
          console.error('Error comparing faces:', comparisonError);
          verificationMessage = 'PAN verification failed';
        }
      } else {
        // If Aadhaar photo is not available, set appropriate message
        verificationMessage = 'Aadhaar photo not available for verification';
      }
    }
    
    // Handle failure cases - return failure response
    // Case 1: LLM verification failed
    if (!llmResult?.success) {
      return res.failure({
        message: llmResult?.message || 'PAN verification failed',
        data: {
          llmVerification: {
            success: false,
            session_id: llmResult?.session_id || null,
            message: llmResult?.message || 'PAN verification failed',
            faceComparison: null
          }
        }
      });
    }
    
    // Case 2: Face comparison failed (matched: false)
    if (faceComparisonResult && !faceComparisonResult.matched) {
      return res.failure({
        message: verificationMessage || 'PAN verification failed',
        data: {
          llmVerification: {
            success: llmResult?.success || false,
            session_id: llmResult?.session_id || null,
            message: verificationMessage || 'PAN verification failed',
            faceComparison: {
              matched: faceComparisonResult.matched,
              similarity: faceComparisonResult.similarity
            }
          }
        }
      });
    }
    
    // Case 3: Aadhaar photo not available (face comparison couldn't be performed)
    if (!faceComparisonResult && llmResult?.success) {
      return res.failure({
        message: verificationMessage || 'Aadhaar photo not available for verification',
        data: {
          llmVerification: {
            success: llmResult?.success || false,
            session_id: llmResult?.session_id || null,
            message: verificationMessage || 'Aadhaar photo not available for verification',
            faceComparison: null
          }
        }
      });
    }
    
    // Success case: Face comparison matched - prepare simplified response
    const llmVerificationResponse = {
      success: llmResult?.success || false,
      session_id: llmResult?.session_id || null,
      message: verificationMessage,
      faceComparison: faceComparisonResult ? {
        matched: faceComparisonResult.matched,
        similarity: faceComparisonResult.similarity
      } : null
    };
    
    return res.success({ 
      message: 'PAN documents uploaded successfully',
      data: {
        panCardFrontImage: frontImageS3Key,
        panCardBackImage: backImageS3Key,
        llmVerification: llmVerificationResponse
      }
    });
  } catch (error) {
    console.error('Error uploading PAN documents:', error);
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

