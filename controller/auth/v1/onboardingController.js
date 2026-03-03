const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const { decryptOnboardingToken } = require('../../../utils/onboardingToken');
const { encrypt } = require('../../../utils/encryption');
const bcrypt = require('bcrypt');
const moment = require('moment');
const random = require('../../../utils/common');
const amezesmsApi = require('../../../services/amezesmsApi');
const { JWT } = require('../../../constants/authConstant');
const emailService = require('../../../services/emailService');
const imageService = require('../../../services/imageService');
const googleMap = require('../../../services/googleMap');
const ekycHub = require('../../../services/eKycHub');
const llmService = require('../../../services/llmService');
const rekognitionService = require('../../../services/rekognitionService');
const textractService = require('../../../services/textractService');
const razorpayApi = require('../../../services/razorpayApi');
const { doubleEncrypt, decrypt } = require('../../../utils/doubleCheckUp');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const key = Buffer.from(process.env.AES_KEY, 'hex');


// Allowed Origin for onboarding flows
const getOrigin = (req) => req.get('origin') || req.get('referer') || '';

const isAllowedOrigin = (origin) => {
  if (!origin) return false;

  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    const protocol = url.protocol.toLowerCase();

    // Allow localhost with any port (http://localhost:*, http://127.0.0.1:*, http://::1:*)
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return protocol === 'http:' || protocol === 'https:';
    }

    // Allow https://app.gmaxepay.in
    if (hostname === 'app.gmaxepay.in') {
      return protocol === 'https:';
    }

    if (hostname === 'app.gmaxepay.com') {
      return protocol === 'https:';
    }

    return false;
  } catch (error) {
    // If origin is not a valid URL, deny access
    return false;
  }
};

const ensureAllowedOrigin = (req) => {
  const origin = getOrigin(req);

  // If no origin header, allow only in development (for API testing tools)
  // Browsers always send Origin header for cross-origin requests
  if (!origin) {
    const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';
    return !isProduction;
  }

  return isAllowedOrigin(origin);
};

const isAllowedCompanyDomain = (domain) => {
  if (!domain) return false;
  const normalizedDomain = domain.toString().trim().toLowerCase();
  return normalizedDomain === 'localhost' || normalizedDomain === 'app.gmaxepay.in' || normalizedDomain === 'app.gmaxepay.com';
};

const getRequestedDomain = (req) => {
  const d = req.get('x-company-domain') || '';
  const domain = (d || '').toString().trim().toLowerCase();
  return domain || 'app.gmaxepay.in' || 'app.gmaxepay.com';
};

const ensureDomainMatches = (req, company) => {
  const requested = getRequestedDomain(req);
  // Always validate that the requested domain is allowed (localhost or app.gmaxepay.in)
  if (!isAllowedCompanyDomain(requested)) {
    return false;
  }
  // If the request is coming from core allowed domains, allow regardless of company's customDomain
  if (requested === 'app.gmaxepay.in' || requested === 'localhost' || requested === 'app.gmaxepay.com') {
    return true;
  }
  // Otherwise, if company has a customDomain stored, validate against it
  const expected = (company?.customDomain || '').toString().trim().toLowerCase();
  if (expected && requested) {
    return requested === expected;
  }
  // No expected domain stored; allow
  return true;
};

const getTokenFromReq = (req) => {
  if (req.params?.token) return req.params.token;
  if (req.body?.token) return req.body.token;
  const auth = req.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
};

const loadContextByToken = async (token) => {
  if (!token) return { error: 'Onboarding token is required' };

  // Encrypt the token before searching (since tokens are stored encrypted in database)
  let encryptedToken;
  try {
    encryptedToken = encrypt(token);
  } catch (error) {
    console.error('Error encrypting token for search:', error);
    return { error: 'Invalid token format' };
  }

  const tokenRecord = await dbService.findOne(model.onboardingToken, {
    token: encryptedToken,
    isDeleted: false
  });
  if (!tokenRecord) return { error: 'Invalid or expired onboarding link' };
  if (tokenRecord.isDeactivated) return { error: 'This onboarding link has been deactivated' };
  if (tokenRecord.isUsed) return { error: 'This onboarding link has already been used' };
  if (new Date() > tokenRecord.expiresAt) return { error: 'This onboarding link has expired' };
  const tokenData = decryptOnboardingToken(token);
  if (!tokenData) return { error: 'Invalid or corrupted onboarding token' };
  if (tokenData.userId !== tokenRecord.userId || tokenData.companyId !== tokenRecord.companyId) {
    return { error: 'Token validation failed' };
  }
  const user = await dbService.findOne(model.user, { id: tokenData.userId, isDeleted: false });
  if (!user) return { error: 'User not found' };
  const company = await dbService.findOne(model.company, { id: tokenData.companyId, isDeleted: false });
  if (!company) return { error: 'Company not found' };
  const outlet = await dbService.findOne(model.outlet, { refId: user.id, companyId: company.id });

  // Find customer record to lookup customerBank (customerBank.refId references customer table)
  const customer = await dbService.findOne(model.customer, {
    mobile: user.mobileNo
  });

  // Find customerBank using customer.id if customer exists, otherwise try user.id for backward compatibility
  let customerBank = null;
  if (customer) {
    customerBank = await dbService.findOne(model.customerBank, { refId: customer.id, companyId: company.id });
  }
  // Fallback: try with user.id for backward compatibility with old data
  if (!customerBank) {
    customerBank = await dbService.findOne(model.customerBank, { refId: user.id, companyId: company.id });
  }

  // Fetch digilocker documents for Aadhaar and PAN
  const [aadhaarDoc, panDoc] = await Promise.all([
    dbService.findOne(model.digilockerDocument, {
      refId: user.id,
      companyId: company.id,
      documentType: 'AADHAAR',
      isDeleted: false
    }),
    dbService.findOne(model.digilockerDocument, {
      refId: user.id,
      companyId: company.id,
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
    isAadharUploaded: user.isAadharUploaded,
    isPanUploaded: user.isPanUploaded,
    shopDetailsVerify: user.shopDetailsVerify,
    bankDetailsVerify: user.bankDetailsVerify,
    profileImageWithShopVerify: user.profileImageWithShopVerify,
    mobileNo: user.mobileNo,
    email: user.email,
    profileImage: getImageUrl(user.profileImage, true),
    aadharFrontImage: getImageUrl(user.aadharFrontImage, false),
    aadharBackImage: getImageUrl(user.aadharBackImage, false),
    panCardFrontImage: getImageUrl(user.panCardFrontImage, false),
    panCardBackImage: getImageUrl(user.panCardBackImage, false),
  }
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
    return imageService.getImageUrl(plainKey, true);
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
  const companyDetails = {
    companyId: company.id,
    companyName: company.companyName,
  }

  return {
    tokenRecord,
    tokenData,
    company,
    user,
    outlet,
    customerBank,
    companyDetails,
    userDetails,
    outletDetails,
    customerBankDetails,
    aadhaarDoc,
    panDoc
  };
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
  const aadhaarUpload = !!(user.isAadharUploaded);

  // Check PAN sub-steps
  const panConnect = !!(panDoc && panDoc.verificationId);
  const panDownload = !!(panDoc && panDoc.panNumber); // If panNumber exists, document is downloaded
  const panFrontImageKey = extractS3Key(panCardFrontImage);
  const panBackImageKey = extractS3Key(panCardBackImage);
  const panUpload = !!(user.isPanUploaded);

  // Check if verification is done via manual upload flags
  const aadharVerifyFlag = !!(user.isAadharUploaded || userDetails.isAadharUploaded);
  const panVerifyFlag = !!(user.isPanUploaded || userDetails.isPanUploaded);

  const aadhaarSubSteps = [
    { key: 'connect', label: 'Connect Aadhaar', done: aadharVerifyFlag || aadhaarConnect },
    { key: 'download', label: 'Download Aadhaar', done: aadharVerifyFlag || aadhaarDownload },
    { key: 'upload', label: 'Upload Aadhaar Images', done: aadharVerifyFlag }
  ];

  const panSubSteps = [
    { key: 'connect', label: 'Connect PAN', done: panVerifyFlag || panConnect },
    { key: 'download', label: 'Download PAN', done: panVerifyFlag || panDownload },
    { key: 'upload', label: 'Upload PAN Images', done: panVerifyFlag }
  ];

  // Overall done: either manual flag is set OR all digilocker/image steps are complete
  const aadhaarAllDone = aadharVerifyFlag || (aadhaarConnect && aadhaarDownload && aadhaarUpload);
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
    console.error(`Error reverting ${kycType} KYC verification:`, error);
  }
};


const verifyOnboardingLink = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) {
      return res.failure({ message: 'Origin not allowed' });
    }
    const token = req.params.token;
    const ctx = await loadContextByToken(token);
    if (ctx.error) {
      return res.failure({ message: ctx.error });
    }
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }
    const { tokenData, user, userDetails, outletDetails, customerBankDetails, aadhaarDoc, panDoc } = ctx;
    const pendingInfo = getPendingSteps({ user, userDetails, outletDetails, customerBankDetails, aadhaarDoc, panDoc });
    const isOnboardingCompleted = pendingInfo.allCompleted;
    return res.success({
      message: isOnboardingCompleted ? 'Onboarding is completed' : 'Onboarding is pending',
      data: {
        userId: tokenData.userId,
        name: tokenData.name,
        steps: pendingInfo.steps,
        pending: pendingInfo.pending,
        isOnboardingCompleted
      }
    });
  } catch (error) {
    console.error('Error verifying onboarding link:', error);
    return res.failure({
      message: 'Failed to verify onboarding link',
      error: error.message
    });
  }
};


const completeOnboarding = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) {
      return res.failure({ message: 'Origin not allowed' });
    }
    const token = getTokenFromReq(req);
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }
    await dbService.update(
      model.onboardingToken,
      { id: ctx.tokenRecord.id },
      {
        isUsed: true,
        usedAt: new Date()
      }
    );
    return res.success({ message: 'Onboarding token marked as completed' });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    return res.failure({
      message: 'Failed to complete onboarding',
      error: error.message
    });
  }
};

// Step 1: Mobile verification
const sendSmsMobile = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const { mobileNo } = req.body || {};
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }
    if (mobileNo != ctx.userDetails.mobileNo) {
      return res.failure({ message: 'Invalid Mobile Number' });
    }

    // Fetch full user instance
    const user = await dbService.findOne(model.user, { id: ctx.tokenData.userId, companyId: ctx.tokenData.companyId, isDeleted: false });
    if (!user) return res.failure({ message: 'User not found' });

    // Check lock status
    if (user.isAccountLocked && user.isAccountLocked()) {
      return res.failure({ message: 'Account is temporarily locked due to multiple invalid attempts. Try again later.' });
    }

    // Reset attempts when generating a new OTP
    await user.resetLoginAttempts();

    // Generate OTP and store with expiry
    const code = random.randomNumber(6);
    const hashedCode = await bcrypt.hash(code, 10);
    const expireOTP = moment().add(JWT.OTP_EXPIRES_IN || 120, 'seconds').toISOString();

    await dbService.update(
      model.user,
      { id: user.id },
      { otpMobile: `${hashedCode}~${expireOTP}` }
    );

    // Send SMS
    const msg = `Dear user, your OTP for account login is ${code}. Team Gmaxepay`;
    await amezesmsApi.sendSmsLogin(user.mobileNo, msg);

    const pendingInfo = getPendingSteps({ userDetails: ctx.userDetails, outletDetails: ctx.outletDetails, customerBankDetails: ctx.customerBankDetails, aadhaarDoc: ctx.aadhaarDoc, panDoc: ctx.panDoc });
    return res.success({ message: 'OTP sent to registered mobile number', data: { steps: pendingInfo.steps, pending: pendingInfo.pending } });
  } catch (error) {
    console.error('Error in mobile verification:', error);
    return res.failure({ message: 'Failed to  send sms for mobile', error: error.message });
  }
};

// Verify mobile OTP during onboarding (3 attempts then lock)
const verifySmsOtp = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const { otp } = req.body || {};
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }
    if (!otp) return res.failure({ message: 'OTP is required' });

    const user = await dbService.findOne(model.user, { id: ctx.tokenData.userId, companyId: ctx.tokenData.companyId, isDeleted: false });
    if (!user) return res.failure({ message: 'User not found' });

    if (user.isAccountLocked && user.isAccountLocked()) {
      return res.failure({ message: 'Account is temporarily locked due to multiple invalid attempts. Try again later.' });
    }

    const otpField = user.otpMobile || '';
    const [storedHash, expiresAt] = otpField.split('~');
    if (!storedHash || !expiresAt) {
      return res.failure({ message: 'No OTP found. Please request a new OTP.' });
    }
    if (new Date(expiresAt) < new Date()) {
      return res.failure({ message: 'OTP expired. Please request a new OTP.' });
    }

    const isMatch = await bcrypt.compare(otp.toString(), storedHash);
    if (!isMatch) {
      await user.incrementOtpAttempts();
      if (user.isAccountLocked && user.isAccountLocked()) {
        return res.failure({ message: 'Account locked due to multiple invalid attempts.' });
      }
      return res.failure({ message: 'Invalid OTP' });
    }

    // Success: mark verified, clear OTP, reset attempts
    await dbService.update(model.user, { id: user.id }, { mobileVerify: true, otpMobile: null });
    await user.resetOtpAttempts();

    // Update KYC status
    await updateKycStatus(user.id, ctx.tokenData.companyId, ctx);

    const pendingInfo = getPendingSteps({ userDetails: { ...ctx.userDetails, mobileVerify: true }, outletDetails: ctx.outletDetails, customerBankDetails: ctx.customerBankDetails, aadhaarDoc: ctx.aadhaarDoc, panDoc: ctx.panDoc });
    return res.success({ message: 'Mobile verified successfully', data: { steps: pendingInfo.steps, pending: pendingInfo.pending } });
  } catch (error) {
    console.error('Error verifying mobile OTP:', error);
    return res.failure({ message: 'Failed to verify OTP', error: error.message });
  }
};

// Reset OTP attempts and resend a new OTP
const resetSmsOtp = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const { mobileNo } = req.body || {};
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }
    if (mobileNo != ctx.userDetails.mobileNo) {
      return res.failure({ message: 'Invalid Mobile Number' });
    }

    const user = await dbService.findOne(model.user, { id: ctx.tokenData.userId, companyId: ctx.tokenData.companyId, isDeleted: false });
    if (!user) return res.failure({ message: 'User not found' });

    await user.resetOtpAttempts();

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
// Step 2: Email verification

// Email OTP: send
const sendEmailOtp = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const { email } = req.body || {};
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }
    const user = await dbService.findOne(model.user, { id: ctx.tokenData.userId, companyId: ctx.tokenData.companyId, isDeleted: false });
    if (email != user.email) {
      return res.failure({ message: 'Invalid Email Address' });
    }

    if (!user) return res.failure({ message: 'User not found' });
    if (!user.email) return res.failure({ message: 'Email not set for user' });

    await user.resetLoginAttempts();

    const code = random.randomNumber(6);
    const hashedCode = await bcrypt.hash(code, 10);
    const expireOTP = moment().add(3, 'minutes').toISOString();

    await dbService.update(model.user, { id: user.id }, { otpEmail: `${hashedCode}~${expireOTP}` });

    // Build logo and illustration URLs similar to welcome email
    const backendUrl = process.env.BASE_URL;
    const logoUrl = `${backendUrl}/gmaxepay.png`;
    const illustrationUrl = `${backendUrl}/otp.png`;

    await emailService.sendOtpEmail({ to: user.email, userName: user.name || 'User', otp: String(code), expiryMinutes: 3, logoUrl, illustrationUrl });

    const pendingInfo = getPendingSteps({ userDetails: ctx.userDetails, outletDetails: ctx.outletDetails, customerBankDetails: ctx.customerBankDetails, aadhaarDoc: ctx.aadhaarDoc, panDoc: ctx.panDoc });
    return res.success({ message: 'OTP sent to registered email', data: { steps: pendingInfo.steps, pending: pendingInfo.pending } });
  } catch (error) {
    console.error('Error sending email OTP:', error);
    return res.failure({ message: 'Failed to send email OTP', error: error.message });
  }
};

// Email OTP: verify
const verifyEmailOtp = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const { otp } = req.body || {};
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }
    if (!otp) return res.failure({ message: 'OTP is required' });

    const user = await dbService.findOne(model.user, { id: ctx.tokenData.userId, companyId: ctx.tokenData.companyId, isDeleted: false });
    if (!user) return res.failure({ message: 'User not found' });

    if (user.isAccountLocked && user.isAccountLocked()) {
      return res.failure({ message: 'Account is temporarily locked due to multiple invalid attempts. Try again later.' });
    }

    const otpField = user.otpEmail || '';
    const [storedHash, expiresAt] = otpField.split('~');
    if (!storedHash || !expiresAt) {
      return res.failure({ message: 'No OTP found. Please request a new OTP.' });
    }
    if (new Date(expiresAt) < new Date()) {
      return res.failure({ message: 'OTP expired. Please request a new OTP.' });
    }

    const isMatch = await bcrypt.compare(otp.toString(), storedHash);
    if (!isMatch) {
      await user.incrementOtpAttempts();
      if (user.isAccountLocked && user.isAccountLocked()) {
        return res.failure({ message: 'Account locked due to multiple invalid attempts.' });
      }
      return res.failure({ message: 'Invalid OTP' });
    }

    await dbService.update(model.user, { id: user.id }, { emailVerify: true, otpEmail: null });
    await user.resetOtpAttempts();

    // Update KYC status
    await updateKycStatus(user.id, ctx.tokenData.companyId, ctx);

    const pendingInfo = getPendingSteps({ userDetails: { ...ctx.userDetails, emailVerify: true }, outletDetails: ctx.outletDetails, customerBankDetails: ctx.customerBankDetails, aadhaarDoc: ctx.aadhaarDoc, panDoc: ctx.panDoc });
    return res.success({ message: 'Email verified successfully', data: { steps: pendingInfo.steps, pending: pendingInfo.pending } });
  } catch (error) {
    console.error('Error verifying email OTP:', error);
    return res.failure({ message: 'Failed to verify email OTP', error: error.message });
  }
};

// Email OTP: reset/resend
const resetEmailOtp = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    const { email } = req.body
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }
    const user = await dbService.findOne(model.user, { id: ctx.tokenData.userId, companyId: ctx.tokenData.companyId, isDeleted: false });
    if (email != user.email) {
      return res.failure({ message: 'Invalid Email Address' });
    }
    if (!user) return res.failure({ message: 'User not found' });
    if (!user.email) return res.failure({ message: 'Email not set for user' });

    await user.resetOtpAttempts();

    const code = random.randomNumber(6);
    const hashedCode = await bcrypt.hash(code, 10);
    const expireOTP = moment().add(3, 'minutes').toISOString();

    await dbService.update(model.user, { id: user.id }, { otpEmail: `${hashedCode}~${expireOTP}` });

    const backendUrl = process.env.BASE_URL;
    const logoUrl = (ctx.company && ctx.company.logo) ? imageService.getImageUrl(ctx.company.logo) : `${backendUrl}/gmaxepay.png`;
    const illustrationUrl = `${backendUrl}/otp.png`;
    await emailService.sendOtpEmail({ to: user.email, userName: user.name || 'User', otp: String(code), expiryMinutes: 3, logoUrl, illustrationUrl });

    return res.success({ message: 'New OTP sent to registered email' });
  } catch (error) {
    console.error('Error resetting email OTP:', error);
    return res.failure({ message: 'Failed to reset email OTP', error: error.message });
  }
};

// Step 4: Aadhaar verification
const connectAadhaarVerification = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    const { redirect_url } = req.body || {};
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }
    if (!redirect_url) return res.failure({ message: 'Redirect URL is required' });

    // Append isRedirect=true to redirect_url
    const modifiedRedirectUrl = redirect_url;
    const existingUser = await dbService.findOne(model.user, {
      id: ctx.tokenData.userId,
      companyId: ctx.tokenData.companyId,
      isDeleted: false
    });
    if (!existingUser) return res.failure({ message: 'User not found' });

    const allDigilockerDocuments = await dbService.findAll(model.digilockerDocument, {
      refId: ctx.tokenData.userId,
      companyId: ctx.tokenData.companyId,
      documentType: 'AADHAAR',
      isDeleted: false
    }, {
      sort: { id: -1 }
    });

    const existingDoc = allDigilockerDocuments && allDigilockerDocuments.length > 0 ? allDigilockerDocuments[0] : null;

    if (existingDoc && existingUser.aadharVerify) {
      // Use existing context with the existingDoc
      const pendingInfo = getPendingSteps({
        userDetails: ctx.userDetails,
        outletDetails: ctx.outletDetails,
        customerBankDetails: ctx.customerBankDetails,
        aadhaarDoc: existingDoc,
        panDoc: ctx.panDoc
      });
      return res.success({
        message: 'Aadhaar verification already processed. Please download from digilocker',
        data: {
          steps: pendingInfo.steps,
          pending: pendingInfo.pending
        }
      });
    }
    console.log('modifiedRedirectUrl', modifiedRedirectUrl);
    const response = await ekycHub.createAadharVerificationUrl(modifiedRedirectUrl);
    console.log('response', response);
    if (response && response.status === 'Success') {
      const { verification_id, reference_id } = response;
      if (verification_id) {
        await dbService.createOne(model.digilockerDocument, {
          refId: ctx.tokenData.userId,
          companyId: ctx.tokenData.companyId,
          documentType: 'AADHAAR',
          verificationId: verification_id,
          referenceId: reference_id || null,
          status: response.status || null,
          fullResponse: response,
          addedBy: ctx.user.id,
          isActive: true
        });
      }
      return res.success({ message: 'Aadhaar Connection Successful', data: response });
    } else {
      return res.failure({ message: 'Failed to connect Aadhaar verification', data: response });
    }
  } catch (error) {
    return res.failure({ message: 'Failed to connect Aadhaar verification', error: error.message });
  }
}

// Step 5: PAN verification
const connectPanVerification = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }
    const { redirect_url } = req.body || {};
    if (!redirect_url) return res.failure({ message: 'Redirect URL is required' });

    const existingUser = await dbService.findOne(model.user, {
      id: ctx.tokenData.userId,
      companyId: ctx.tokenData.companyId,
      isDeleted: false
    });
    if (!existingUser) return res.failure({ message: 'User not found' });

    console.log(`[connectPanVerification] User ID: ${ctx.tokenData.userId}, Company ID: ${ctx.tokenData.companyId}`);

    const existingDoc = await dbService.findOne(model.digilockerDocument, {
      refId: ctx.tokenData.userId,
      companyId: ctx.tokenData.companyId,
      documentType: 'PAN',
      isDeleted: false
    });

    if (existingDoc && existingUser.panVerify) {
      console.log(`[connectPanVerification] PAN already verified for user ${ctx.tokenData.userId}`);
      // Use existing context with the existingDoc
      const pendingInfo = getPendingSteps({
        userDetails: ctx.userDetails,
        outletDetails: ctx.outletDetails,
        customerBankDetails: ctx.customerBankDetails,
        aadhaarDoc: ctx.aadhaarDoc,
        panDoc: existingDoc
      });
      return res.success({
        message: 'PAN verification already processed. Please download from digilocker',
        data: {
          steps: pendingInfo.steps,
          pending: pendingInfo.pending
        }
      });
    }

    console.log(`[connectPanVerification] Creating PAN verification URL for user ${ctx.tokenData.userId}`);
    const response = await ekycHub.createPanVerificationUrl(redirect_url);
    console.log(`[connectPanVerification] API Response status: ${response?.status}`);

    if (response && response.status === 'Success') {
      const { verification_id, reference_id } = response;
      if (verification_id) {
        await dbService.createOne(model.digilockerDocument, {
          refId: ctx.tokenData.userId,
          companyId: ctx.tokenData.companyId,
          documentType: 'PAN',
          verificationId: verification_id,
          referenceId: reference_id || null,
          status: response?.status || null,
          fullResponse: response,
          addedBy: ctx.user.id,
          isActive: true
        });
        console.log(`[connectPanVerification] Document record created for user ${ctx.tokenData.userId}, verification_id: ${verification_id}`);
      }
      return res.success({ message: 'PAN Connection Successful', data: response });
    } else {
      console.error(`[connectPanVerification] Failed response:`, response);
      return res.failure({ message: 'Failed to connect PAN verification', data: response });
    }
  }
  catch (error) {
    console.error('[connectPanVerification] Error:', error);
    return res.failure({ message: 'Failed to connect PAN verification', error: error.message });
  }
}

// Get Digilocker Both Pan and Aadhaar Documents
const getDigilockerDocuments = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }

    const { document_type } = req.body || {};
    if (!document_type) return res.failure({ message: 'Document type is required (AADHAAR or PAN)' });

    const docType = document_type.toUpperCase();
    if (docType !== 'AADHAAR' && docType !== 'PAN') {
      return res.failure({ message: 'Invalid document type. Must be AADHAAR or PAN' });
    }

    const userId = ctx.tokenData.userId;
    const companyId = ctx.tokenData.companyId;
    const docTypeLabel = docType === 'AADHAAR' ? 'Aadhaar' : 'PAN';

    // Find user
    const existingUser = await dbService.findOne(model.user, {
      id: userId,
      companyId: companyId,
      isDeleted: false
    });
    if (!existingUser) {
      return res.failure({ message: 'User not found' });
    }

    // Find latest document
    const allDigilockerDocuments = await dbService.findAll(model.digilockerDocument, {
      refId: userId,
      companyId: companyId,
      documentType: docType,
      isDeleted: false
    }, {
      sort: { id: -1 }
    });
    console.log("allDigilockerDocuments", allDigilockerDocuments);

    if (!allDigilockerDocuments || allDigilockerDocuments.length === 0) {
      return res.failure({ message: `Please connect your ${docTypeLabel} to digilocker first` });
    }

    const existingDigilockerDocument = allDigilockerDocuments[0];

    // Validate document ownership and required fields
    if (existingDigilockerDocument.refId !== userId ||
      existingDigilockerDocument.companyId !== companyId ||
      existingDigilockerDocument.documentType !== docType) {
      return res.failure({ message: 'Document access denied. Data mismatch detected.' });
    }

    if (!existingDigilockerDocument.verificationId || !existingDigilockerDocument.referenceId) {
      return res.failure({ message: 'Verification ID and Reference ID are required. Please connect verification first' });
    }

    const { verificationId: verification_id, referenceId: reference_id } = existingDigilockerDocument;

    // Check if we can return cached data
    const isUserVerified = docType === 'AADHAAR' ? existingUser.aadharVerify : existingUser.panVerify;
    const hasFullData = (docType === 'AADHAAR' && existingDigilockerDocument.name) ||
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
    } else {
      // Fetch from API
      response = await ekycHub.getDocuments(verification_id, reference_id, document_type);
      console.log("response", response);

      const responseStatus = (response?.status || '').toString().toUpperCase();
      const isSuccess = responseStatus === 'SUCCESS' || responseStatus === 'SUCCEED' || responseStatus === 'Success';

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
            companyId: companyId,
            documentType: docType,
            isDeleted: false
          },
          updateData
        );

        // Update user verification status
        const userUpdateData = docType === 'AADHAAR'
          ? { aadharVerify: true, ...(updateData.name && { name: updateData.name }), ...(updateData.dob && { dob: updateData.dob }), ...(updateData.address && { fullAddress: updateData.address }) }
          : { panVerify: true };

        await dbService.update(model.user, {
          id: userId,
          companyId: companyId,
          isDeleted: false
        }, userUpdateData);

        // Update KYC status
        await updateKycStatus(userId, companyId, {
          aadhaarDoc: docType === 'AADHAAR' ? existingDigilockerDocument : ctx?.aadhaarDoc,
          panDoc: docType === 'PAN' ? existingDigilockerDocument : ctx?.panDoc
        });
      } else {
        // Handle API errors
        const responseData = response?.data || response || {};
        const errorCode = responseData.code || responseData.error_code || null;
        const errorMessage = (responseData.message || responseData.error_message || '').toLowerCase();

        const isExpiredOrPending = errorCode === 'url_expired' ||
          errorCode === 'validation_pending' ||
          errorMessage.includes('url expired') ||
          errorMessage.includes('expired') ||
          errorMessage.includes('validation in process');

        if (isExpiredOrPending) {
          // Delete the latest document request
          await dbService.destroy(model.digilockerDocument, {
            id: existingDigilockerDocument.id,
            refId: userId,
            companyId: companyId,
            documentType: docType
          });

          // Reset user verification flag
          const resetData = docType === 'AADHAAR' ? { aadharVerify: false } : { panVerify: false };
          await dbService.update(model.user, {
            id: userId,
            companyId: companyId,
            isDeleted: false
          }, resetData);

          // Update KYC status
          await updateKycStatus(userId, companyId, {
            aadhaarDoc: docType === 'AADHAAR' ? null : ctx?.aadhaarDoc,
            panDoc: docType === 'PAN' ? null : ctx?.panDoc
          });

          const errorMsg = errorCode === 'validation_pending'
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
      }
    }

    const message = `${docTypeLabel} Verification Downloaded`;
    return res.success({ message, data: response.data || response });
  }
  catch (error) {
    return res.failure({ message: 'Failed to download verification', error: error.message });
  }
}

// Step 6: Shop details (Outlet)
const postShopDetails = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }
    const { shopName, longitude, ipAddress, latitude } = req.body || {};

    if (!shopName) return res.failure({ message: 'Shop name is required' });
    if (!longitude) return res.failure({ message: 'Longitude is required' });
    if (!ipAddress) return res.failure({ message: 'IP address is required' });
    if (!latitude) return res.failure({ message: 'Latitude is required' });

    // Reverse geocode to get complete address
    const addressData = await googleMap.reverseGeocode(latitude, longitude);
    const formatted_address = addressData.formatted_address;
    const completeAddress = addressData.complete_address;

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
    if (ctx.outlet && ctx.outlet.shopImage) {
      oldShopImageKey = extractShopImageKey(ctx.outlet.shopImage);
    }

    // Optional shop image upload (multer memory storage)
    let shopImageKey = null;
    if (req.file && req.file.buffer) {
      const uploadResult = await imageService.uploadImageToS3(
        req.file.buffer,
        req.file.originalname || 'shop.jpg',
        'shop',
        ctx.company.id,
        null, // subtype
        ctx.user.id // userId for new pattern: companyId/userId/shopImage/
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
    if (ctx.user.shopDetailsVerify) {
      return res.failure({ message: 'Shop details already verified.' });
    }

    const outletPayload = {
      shopName,
      shopAddress: formatted_address || completeAddress,
      ...(shopImageKey ? { shopImage: shopImageKey } : {}),
      outletGoogleMapsLink: addressData?.place_google_maps_link,
      shopCity: addressData?.address_components?.city,
      shopDistrict: addressData?.address_components?.district,
      shopState: addressData?.address_components?.state,
      shopPincode: addressData?.address_components?.postal_code,
      shopLatitude: latitude,
      shopLongitude: longitude,
      shopCountry: addressData?.address_components?.country,
      shopCategoryId: 1
    };

    const outlet = await dbService.createOne(
      model.outlet,
      { refId: ctx.user.id, companyId: ctx.company.id, userRole: ctx.user.userRole, ...outletPayload }
    );

    // Set shopDetailsVerify to true in user table (prevents multiple shops)
    await dbService.update(model.user, { id: ctx.user.id }, { shopDetailsVerify: true });

    // Update KYC status
    await updateKycStatus(ctx.user.id, ctx.company.id, { outlet, customerBank: ctx.customerBank, aadhaarDoc: ctx.aadhaarDoc, panDoc: ctx.panDoc });

    // Reload user context to get updated shopDetailsVerify
    const updatedUser = await dbService.findOne(model.user, { id: ctx.user.id });
    const pendingInfo = getPendingSteps({ user: updatedUser, outlet, customerBank: ctx.customerBank, aadhaarDoc: ctx.aadhaarDoc, panDoc: ctx.panDoc });
    return res.success({ message: 'Shop details saved', data: { address: completeAddress, steps: pendingInfo.steps, pending: pendingInfo.pending } });
  } catch (error) {
    console.error('Error in shop details:', error);
    return res.failure({ message: 'Failed to save shop details', error: error.message });
  }
};

// Step 7: Bank details (CustomerBank)
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
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }
    const { account_number, ifsc } = req.body || {};
    if (!account_number) return res.failure({ message: 'Account number is required' });
    if (!ifsc) return res.failure({ message: 'IFSC is required' });

    const encryptionKey = Buffer.from(key, 'hex');
    const requestData = { account_number, ifsc };
    const encryptedRequest = doubleEncrypt(JSON.stringify(requestData), encryptionKey);

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
          companyId: ctx.company.id || null,
          addedBy: ctx.user.id
        });
      }
    }

    if (!bankVerification || bankVerification.status !== 'Success') {
      console.error('Bank verification failed - Status:', bankVerification?.status);
      console.error('Bank verification failed - Full Response:', JSON.stringify(bankVerification, null, 2));
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

    const aadhaarName = (ctx.aadhaarDoc && ctx.aadhaarDoc.name) ? ctx.aadhaarDoc.name : '';
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
      id: ctx.user.id,
      companyId: ctx.company.id,
      isDeleted: false
    }, {
      bankDetailsVerify: true,
      nameSimilarity: nameSimilarityPercentage.toString()
    });

    const updatedUser = await dbService.findOne(model.user, {
      id: ctx.user.id,
      companyId: ctx.company.id,
      isDeleted: false
    });

    const city = (razorpayBankData && razorpayBankData.CITY)
      ? razorpayBankData.CITY
      : (bankVerification.city || null);
    const branch = (razorpayBankData && razorpayBankData.BRANCH)
      ? razorpayBankData.BRANCH
      : (bankVerification.branch || null);

    const payload = {
      refId: ctx.user.id,
      companyId: ctx.company.id,
      bankName,
      beneficiaryName: beneficiaryName || ctx.user.name,
      accountNumber,
      ifsc,
      city: city || null,
      branch: branch || null,
      isFundTransfer: true,
      isPayout: true,
      isActive: true,
      isPrimary: true,

    };
    let customerBank = ctx.customerBank;
    if (customerBank) {
      customerBank = await dbService.update(model.customerBank, { id: customerBank.id }, payload);
    } else {
      customerBank = await dbService.createOne(model.customerBank, payload);
    }

    await updateKycStatus(ctx.user.id, ctx.company.id, { outlet: ctx.outlet, customerBank, aadhaarDoc: ctx.aadhaarDoc, panDoc: ctx.panDoc });

    const pendingInfo = getPendingSteps({ user: updatedUser, outlet: ctx.outlet, customerBank, aadhaarDoc: ctx.aadhaarDoc, panDoc: ctx.panDoc });
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

// Step 8: Profile (single photo used for liveness + Aadhaar comparison)
const postProfile = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);

    const uploadedPhoto =
      req.file ||
      (req.files && req.files.photo && req.files.photo[0]) ||
      null;

    if (!uploadedPhoto || !uploadedPhoto.buffer) {
      return res.failure({
        message: 'Profile photo is required. Please upload a clear selfie with shop background.'
      });
    }

    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }

    const photoBuffer = uploadedPhoto.buffer;
    if (!photoBuffer || photoBuffer.length < 100) {
      return res.failure({ message: 'Invalid photo. Please upload a valid image.' });
    }

    const validateImageFormat = (buffer) => {
      const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
      const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
      return isJPEG || isPNG;
    };

    if (!validateImageFormat(photoBuffer)) {
      return res.failure({ message: 'Invalid photo format. Please upload a JPEG or PNG image.' });
    }

    if (photoBuffer.length > 15 * 1024 * 1024) {
      return res.failure({ message: 'Photo too large. Maximum size is 15MB.' });
    }

    const existingAadharDetails = await dbService.findOne(model.digilockerDocument, {
      refId: ctx.user.id,
      companyId: ctx.company.id,
      documentType: 'AADHAAR',
      isDeleted: false
    });

    if (!existingAadharDetails) {
      return res.failure({ message: 'Aadhaar verification is required before profile update' });
    }

    const updates = {};
    const photoFileName = uploadedPhoto.originalname || 'profile.jpg';

    try {
      const photoBase64 = photoBuffer.toString('base64');

      const livenessResult = await rekognitionService.detectLiveness(photoBase64);

      if (!livenessResult.success) {
        throw new Error('Failed to verify liveness photo. Please try again.');
      }

      if (!livenessResult.isLive) {
        return res.failure({
          message: livenessResult.message || 'Your face is not live. Please try again.'
        });
      }

      let faceComparisonResult = null;
      if (existingAadharDetails?.photoLink) {
        const aadhaarPhotoBase64 = await extractBase64FromImage(existingAadharDetails.photoLink);
        if (!aadhaarPhotoBase64) {
          throw new Error('Invalid Aadhaar photo data. Please re-verify your Aadhaar.');
        }

        const aadhaarBuffer = validateAndConvertBase64(aadhaarPhotoBase64);
        if (!aadhaarBuffer) {
          throw new Error('Invalid Aadhaar photo format. Please re-verify your Aadhaar.');
        }

        const aadhaarPhotoBase64ForRekognition = aadhaarBuffer.toString('base64');
        faceComparisonResult = await rekognitionService.compareFaces(
          aadhaarPhotoBase64ForRekognition,
          photoBase64
        );

        if (!faceComparisonResult.success) {
          throw new Error('Failed to verify profile photo. Please try again.');
        }

        if (!faceComparisonResult.matched) {
          throw new Error('Your face is not recognized by Aadhaar card. Please check it.');
        }
      }

      const photoUploadResult = await imageService.uploadImageToS3(
        photoBuffer,
        photoFileName,
        'profile',
        ctx.company.id,
        null,
        ctx.user.id
      );

      updates.profileImage = photoUploadResult.key;
      updates.imageVerify = true;
      updates.profileImageWithShopVerify = true;
    } catch (imageError) {
      console.error('Error processing images:', imageError);
      if (imageError.message.includes('not recognized') || imageError.message.includes('do not match')) {
        return res.failure({ message: imageError.message });
      }
      return res.failure({ message: 'Failed to process images', error: imageError.message });
    }

    await dbService.update(model.user, { id: ctx.user.id }, updates);

    const updatedUser = await dbService.findOne(model.user, { id: ctx.user.id });
    const updatedCtx = await loadContextByToken(token);
    const latestUser = updatedCtx.user || updatedUser;
    const latestOutlet = updatedCtx.outlet || ctx.outlet;
    const latestCustomerBank = updatedCtx.customerBank || ctx.customerBank;
    const latestAadhaarDoc = updatedCtx.aadhaarDoc || ctx.aadhaarDoc;
    const latestPanDoc = updatedCtx.panDoc || ctx.panDoc;

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

    await dbService.update(model.user, { id: ctx.user.id }, {
      kycStatus: kycInfo.kycStatus,
      kycSteps: kycInfo.kycSteps
    });

    const userForCheck = await dbService.findOne(model.user, { id: ctx.user.id });
    let tempPassword = null;
    if (pendingInfo.allCompleted && userForCheck && userForCheck.firstTimeOnboarding) {
      tempPassword = generateTempPassword();
      const hashedTempPassword = await bcrypt.hash(tempPassword, 8);

      await dbService.update(model.user, { id: ctx.user.id }, {
        password: hashedTempPassword,
        firstTimeOnboarding: false,
        firstTimeOnboardingComplete: true,
        isResetPassword: true
      });

      try {
        const backendUrl = process.env.BASE_URL;
        const logoUrl = (ctx.company && ctx.company.logo) ? imageService.getImageUrl(ctx.company.logo) : `${backendUrl}/gmaxepay.png`;
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

    return res.success({
      message: 'Your Profile is updated and matched with Aadhaar card',
      data: responseData
    });
  } catch (error) {
    console.error('Error in profile update:', error);
    return res.failure({ message: 'Failed to update profile', error: error.message });
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

const uploadAadharDocuments = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }

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
      dbService.findOne(model.user, { id: ctx.user.id }),
      dbService.findOne(model.digilockerDocument, {
        refId: ctx.user.id,
        companyId: ctx.company.id,
        documentType: 'AADHAAR',
        isDeleted: false
      })
    ]);

    const oldFrontImageKey = extractS3Key(existingUser?.aadharFrontImage);
    const oldBackImageKey = extractS3Key(existingUser?.aadharBackImage);

    // Extract data from both images using AWS Textract service
    // Processes front image, back image, and extracts photo from front image in parallel
    const [frontData, backData, frontPhoto] = await Promise.all([
      textractService.extractAadhaarData(front_photo.buffer),
      textractService.extractAadhaarData(back_photo.buffer),
      textractService.extractAadhaarPhoto(front_photo.buffer)
    ]);

    // Validate that data extraction was successful for front image
    if (!frontData.success) {
      return res.failure({
        message: frontData.error || 'Failed to extract data from front image',
        success: false
      });
    }

    // Validate that data extraction was successful for back image
    if (!backData.success) {
      return res.failure({
        message: backData.error || 'Failed to extract data from back image',
        success: false
      });
    }

    const extractExact12Digits = (aadhaarValue) => {
      if (!aadhaarValue) return null;
      const digits = aadhaarValue.toString().replace(/\D/g, '');
      // Return only if exactly 12 digits, otherwise null
      return digits.length === 12 ? digits : null;
    };

    // Extract Aadhaar numbers from both images - ensure exactly 12 digits
    const frontAadhaarNumber = extractExact12Digits(frontData.aadhaar_number);
    const backAadhaarNumber = extractExact12Digits(backData.aadhaar_number);

    const aadhaar_numbers_match = frontAadhaarNumber && backAadhaarNumber
      ? frontAadhaarNumber === backAadhaarNumber
      : false;

    // Upload images to S3 after successful extraction
    const [frontUploadResult, backUploadResult] = await Promise.all([
      imageService.uploadImageToS3(
        front_photo.buffer,
        front_photo.originalname || 'front_photo.jpg',
        'aadhaar',
        ctx.company.id,
        'front',
        ctx.user.id
      ),
      imageService.uploadImageToS3(
        back_photo.buffer,
        back_photo.originalname || 'back_photo.jpg',
        'aadhaar',
        ctx.company.id,
        'back',
        ctx.user.id
      )
    ]);

    const frontImageS3Key = frontUploadResult.key;
    const backImageS3Key = backUploadResult.key;

    // Validate Aadhaar numbers match
    if (!frontAadhaarNumber && !backAadhaarNumber) {
      // Delete newly uploaded images from S3 since validation failed
      await Promise.all([
        imageService.deleteImageFromS3(frontImageS3Key).catch(err =>
          console.error('Error deleting front image from S3:', err)
        ),
        imageService.deleteImageFromS3(backImageS3Key).catch(err =>
          console.error('Error deleting back image from S3:', err)
        )
      ]);
      return res.failure({ message: 'Could not extract Aadhaar number from images' });
    }

    if (!aadhaar_numbers_match) {
      // Delete newly uploaded images from S3 since validation failed
      await Promise.all([
        imageService.deleteImageFromS3(frontImageS3Key).catch(err =>
          console.error('Error deleting front image from S3:', err)
        ),
        imageService.deleteImageFromS3(backImageS3Key).catch(err =>
          console.error('Error deleting back image from S3:', err)
        )
      ]);
      return res.failure({ message: 'Aadhaar numbers from front and back images do not match' });
    }

    const extractedData = {
      aadhaar_number: frontAadhaarNumber || backAadhaarNumber || null,
      photo: frontPhoto || null,
      dob: frontData.dob || null,
      aadhaar_numbers_match: aadhaar_numbers_match
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
            // Delete newly uploaded images from S3 since validation failed and we won't save them
            await Promise.all([
              imageService.deleteImageFromS3(frontImageS3Key).catch(err =>
                console.error('Error deleting front image from S3:', err)
              ),
              imageService.deleteImageFromS3(backImageS3Key).catch(err =>
                console.error('Error deleting back image from S3:', err)
              )
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
          console.log("faceComparison", faceComparison);

          validationResults.photoMatch = faceComparison.success && faceComparison.matched;
          if (!validationResults.photoMatch) {
            // Delete newly uploaded images from S3 since photo validation failed and we won't save them
            await Promise.all([
              imageService.deleteImageFromS3(frontImageS3Key).catch(err =>
                console.error('Error deleting front image from S3:', err)
              ),
              imageService.deleteImageFromS3(backImageS3Key).catch(err =>
                console.error('Error deleting back image from S3:', err)
              )
            ]);

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
      await dbService.update(model.user, { id: ctx.user.id }, updateData);
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
            await dbService.update(model.user, { id: ctx.user.id }, updateData);
          } catch (secondError) {
            const { aadharDetails, ...updateDataWithoutDetails } = updateData;
            await dbService.update(model.user, { id: ctx.user.id }, updateDataWithoutDetails);
          }
        } else {
          const { aadharDetails, ...updateDataWithoutDetails } = updateData;
          await dbService.update(model.user, { id: ctx.user.id }, updateDataWithoutDetails);
        }
      } else {
        throw dbError;
      }
    }

    await cleanupOldImages(oldFrontImageKey, oldBackImageKey, frontImageS3Key, backImageS3Key);

    // Update KYC status after Aadhaar upload
    await updateKycStatus(ctx.user.id, ctx.company.id, ctx);

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


const uploadPanDocuments = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }

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
        dbService.findOne(model.user, { id: ctx.user.id }),
        dbService.findOne(model.digilockerDocument, {
          refId: ctx.user.id,
          companyId: ctx.company.id,
          documentType: 'PAN',
          panNumber: extractedPanNumber,
          isDeleted: false
        }),
        // Fetch Aadhaar doc only if not in context (parallel fetch)
        ctx.aadhaarDoc ? Promise.resolve(null) : dbService.findOne(model.digilockerDocument, {
          refId: ctx.user.id,
          companyId: ctx.company.id,
          documentType: 'AADHAAR',
          isDeleted: false
        })
      ]);

      // Use Aadhaar doc from context if available, otherwise use fetched result
      const aadhaarDoc = ctx.aadhaarDoc || aadhaarDocResult;

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
                    ctx.company.id,
                    'front',
                    ctx.user.id
                  ),
                  imageService.uploadImageToS3(
                    staticBackImageBuffer,
                    'panbackside.jpeg',
                    'pan',
                    ctx.company.id,
                    'back',
                    ctx.user.id
                  )
                ]);

                frontImageS3Key = frontUploadResult.key;
                backImageS3Key = backUploadResult.key;

                // Update user records with uploaded image keys
                const updateData = {
                  panCardFrontImage: frontImageS3Key,
                  panCardBackImage: backImageS3Key,
                  panVerify: true,
                  isPanUploaded: true
                };

                await dbService.update(model.user, { id: ctx.user.id }, updateData);
                await cleanupOldImages(oldFrontImageKey, oldBackImageKey, frontImageS3Key, backImageS3Key);

                // Update KYC status after PAN upload
                await updateKycStatus(ctx.user.id, ctx.company.id, { aadhaarDoc: aadhaarDoc });
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

// Utility endpoint: get pending steps only
const getPending = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }
    const pendingInfo = getPendingSteps({ user: ctx.user, outlet: ctx.outlet, customerBank: ctx.customerBank, aadhaarDoc: ctx.aadhaarDoc, panDoc: ctx.panDoc });
    return res.success({ message: 'Pending steps fetched', data: pendingInfo });
  } catch (error) {
    console.error('Error fetching pending steps:', error);
    return res.failure({ message: 'Failed to fetch pending steps', error: error.message });
  }
};


const uploadFrontBackAadharDocuments = async (req, res) => {
  try {
    // Validate origin and authentication
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }

    // Extract uploaded files
    const front_photo = req.files?.front_photo?.[0];
    const back_photo = req.files?.back_photo?.[0];

    // Validate that both photos are provided
    if (!front_photo || !back_photo) {
      const receivedFields = req.files ? Object.keys(req.files).join(', ') : 'none';
      return res.failure({
        message: !front_photo ? 'Front photo is required' : 'Back photo is required',
        receivedFields: receivedFields || 'none',
        expectedFields: ['front_photo', 'back_photo']
      });
    }

    const [existingUser, existingAadharDetails] = await Promise.all([
      dbService.findOne(model.user, { id: ctx.user.id }),
      dbService.findOne(model.digilockerDocument, {
        refId: ctx.user.id,
        companyId: ctx.company.id,
        documentType: 'AADHAAR',
        isDeleted: false
      })
    ]);

    const oldFrontImageKey = extractS3Key(existingUser?.aadharFrontImage);
    const oldBackImageKey = extractS3Key(existingUser?.aadharBackImage);

    // Extract data from both images using AWS Textract service
    // Processes front image, back image, and extracts photo from front image in parallel
    const [frontData, backData, frontPhoto] = await Promise.all([
      textractService.extractAadhaarData(front_photo.buffer),
      textractService.extractAadhaarData(back_photo.buffer),
      textractService.extractAadhaarPhoto(front_photo.buffer)
    ]);

    // Validate that data extraction was successful for front image
    if (!frontData.success) {
      return res.failure({
        message: frontData.error || 'Failed to extract data from front image',
        success: false
      });
    }

    // Validate that data extraction was successful for back image
    if (!backData.success) {
      return res.failure({
        message: backData.error || 'Failed to extract data from back image',
        success: false
      });
    }

    const extractExact12Digits = (aadhaarValue) => {
      if (!aadhaarValue) return null;
      const digits = aadhaarValue.toString().replace(/\D/g, '');
      // Return only if exactly 12 digits, otherwise null
      return digits.length === 12 ? digits : null;
    };

    // Extract Aadhaar numbers from both images - ensure exactly 12 digits
    const frontAadhaarNumber = extractExact12Digits(frontData.aadhaar_number);
    const backAadhaarNumber = extractExact12Digits(backData.aadhaar_number);

    const aadhaar_numbers_match = frontAadhaarNumber && backAadhaarNumber
      ? frontAadhaarNumber === backAadhaarNumber
      : false;

    // Upload images to S3 after successful extraction
    const [frontUploadResult, backUploadResult] = await Promise.all([
      imageService.uploadImageToS3(
        front_photo.buffer,
        front_photo.originalname || 'front_photo.jpg',
        'aadhaar',
        ctx.company.id,
        'front',
        ctx.user.id
      ),
      imageService.uploadImageToS3(
        back_photo.buffer,
        back_photo.originalname || 'back_photo.jpg',
        'aadhaar',
        ctx.company.id,
        'back',
        ctx.user.id
      )
    ]);

    const frontImageS3Key = frontUploadResult.key;
    const backImageS3Key = backUploadResult.key;

    // Validate Aadhaar numbers match
    if (!frontAadhaarNumber && !backAadhaarNumber) {
      // Delete newly uploaded images from S3 since validation failed
      await Promise.all([
        imageService.deleteImageFromS3(frontImageS3Key).catch(err =>
          console.error('Error deleting front image from S3:', err)
        ),
        imageService.deleteImageFromS3(backImageS3Key).catch(err =>
          console.error('Error deleting back image from S3:', err)
        )
      ]);
      return res.failure({ message: 'Could not extract Aadhaar number from images' });
    }

    if (!aadhaar_numbers_match) {
      // Delete newly uploaded images from S3 since validation failed
      await Promise.all([
        imageService.deleteImageFromS3(frontImageS3Key).catch(err =>
          console.error('Error deleting front image from S3:', err)
        ),
        imageService.deleteImageFromS3(backImageS3Key).catch(err =>
          console.error('Error deleting back image from S3:', err)
        )
      ]);
      return res.failure({ message: 'Aadhaar numbers from front and back images do not match' });
    }

    const extractedData = {
      aadhaar_number: frontAadhaarNumber || backAadhaarNumber || null,
      photo: frontPhoto || null,
      dob: frontData.dob || null,
      aadhaar_numbers_match: aadhaar_numbers_match
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
            // Delete newly uploaded images from S3 since validation failed and we won't save them
            await Promise.all([
              imageService.deleteImageFromS3(frontImageS3Key).catch(err =>
                console.error('Error deleting front image from S3:', err)
              ),
              imageService.deleteImageFromS3(backImageS3Key).catch(err =>
                console.error('Error deleting back image from S3:', err)
              )
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
          console.log(`[uploadFrontBackAadharDocuments] faceComparison for user ${ctx.user.id}:`, JSON.stringify(faceComparison));

          validationResults.photoMatch = faceComparison.success && faceComparison.matched;
          if (!validationResults.photoMatch) {
            // Delete newly uploaded images from S3 since photo validation failed and we won't save them
            await Promise.all([
              imageService.deleteImageFromS3(frontImageS3Key).catch(err =>
                console.error('Error deleting front image from S3:', err)
              ),
              imageService.deleteImageFromS3(backImageS3Key).catch(err =>
                console.error('Error deleting back image from S3:', err)
              )
            ]);

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
      await dbService.update(model.user, { id: ctx.user.id }, updateData);
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
            await dbService.update(model.user, { id: ctx.user.id }, updateData);
          } catch (secondError) {
            const { aadharDetails, ...updateDataWithoutDetails } = updateData;
            await dbService.update(model.user, { id: ctx.user.id }, updateDataWithoutDetails);
          }
        } else {
          const { aadharDetails, ...updateDataWithoutDetails } = updateData;
          await dbService.update(model.user, { id: ctx.user.id }, updateDataWithoutDetails);
        }
      } else {
        throw dbError;
      }
    }

    await cleanupOldImages(oldFrontImageKey, oldBackImageKey, frontImageS3Key, backImageS3Key);

    // Update KYC status after Aadhaar upload
    await updateKycStatus(ctx.user.id, ctx.company.id, ctx);

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

    const response = {
      success: aadhaar_numbers_match,
      aadhaar_number: extractedData.aadhaar_number,
      aadhaar_numbers_match: aadhaar_numbers_match,
      name: frontData.name || null,
      dob: extractedData.dob || null,
      gender: frontData.gender || null,
      photo: extractedData.photo || null
    };

    console.log("frontAadhaarNumber", frontAadhaarNumber);
    console.log("backAadhaarNumber", backAadhaarNumber);
    console.log("response", response);
    console.log("DataResponse", response);

    return res.success({
      message: responseMessage,
      data: {
        ...response
      }
    });
  } catch (error) {
    console.error('Error in upload front back Aadhar documents:', error);
    return res.failure({
      message: 'Failed to process Aadhar documents',
      error: error.message,
      success: false
    });
  }
}

const uploadFrontBackPanDocuments = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }

    const front_photo = req.file || req.files?.front_photo?.[0];

    if (!front_photo) {
      const receivedFields = req.file ? 'front_photo' : (req.files ? Object.keys(req.files).join(', ') : 'none');
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
      dbService.findOne(model.user, { id: ctx.user.id }),
      dbService.findOne(model.digilockerDocument, {
        refId: ctx.user.id,
        companyId: ctx.company.id,
        documentType: 'PAN',
        panNumber: extractedPanNumber,
        isDeleted: false
      }),
      ctx.aadhaarDoc ? null : dbService.findOne(model.digilockerDocument, {
        refId: ctx.user.id,
        companyId: ctx.company.id,
        documentType: 'AADHAAR',
        isDeleted: false
      })
    ]);

    const aadhaarDoc = ctx.aadhaarDoc || aadhaarDocResult;
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
            console.log(`[uploadFrontBackPanDocuments] faceComparison for user ${ctx.user.id}:`, JSON.stringify(faceComparisonResult));

            if (faceComparisonResult?.success && faceComparisonResult?.matched) {
              verificationMessage = panExistsInDigilocker ? 'PAN verification success' : 'PAN card processed successfully';

              const [frontUploadResult, backUploadResult] = await Promise.all([
                imageService.uploadImageToS3(
                  front_photo.buffer,
                  front_photo.originalname || 'front_pan_photo.jpg',
                  'pan',
                  ctx.company.id,
                  'front',
                  ctx.user.id
                ),
                imageService.uploadImageToS3(
                  staticBackImageBuffer,
                  'panbackside.jpeg',
                  'pan',
                  ctx.company.id,
                  'back',
                  ctx.user.id
                )
              ]);

              frontImageS3Key = frontUploadResult.key;
              backImageS3Key = backUploadResult.key;

              const updateData = {
                panCardFrontImage: frontImageS3Key,
                panCardBackImage: backImageS3Key,
                panVerify: true,
                isPanUploaded: true
              };

              const updatePromises = [
                dbService.update(model.user, { id: ctx.user.id }, updateData),
                updateKycStatus(ctx.user.id, ctx.company.id, { aadhaarDoc: aadhaarDoc })
              ];

              cleanupOldImages(oldFrontImageKey, oldBackImageKey, frontImageS3Key, backImageS3Key)
                .catch(err => console.error('Error cleaning up old images:', err));

              await Promise.all(updatePromises);
            } else {
              verificationMessage = 'Pls check your uploaded Image';
            }
          }
        }
      } catch (comparisonError) {
        console.error('Error comparing faces:', comparisonError);
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
        textractVerification: textractVerificationResponse
      }
    });
  } catch (error) {
    console.error('Error in upload front back Pan documents:', error);
    return res.failure({
      message: 'Failed to process Pan documents',
      error: error.message
    });
  }
};

module.exports = {
  verifyOnboardingLink,
  completeOnboarding,
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
  uploadPanDocuments,
  uploadFrontBackAadharDocuments,
  uploadFrontBackPanDocuments
};
