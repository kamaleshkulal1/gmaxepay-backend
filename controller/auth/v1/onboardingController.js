const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const { decryptOnboardingToken } = require('../../../utils/onboardingToken');
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
const razorpayApi = require('../../../services/razorpayApi');
const { doubleEncrypt, decrypt } = require('../../../utils/doubleCheckUp');
const axios = require('axios');
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
  return normalizedDomain === 'localhost' || normalizedDomain === 'app.gmaxepay.in';
};

const getRequestedDomain = (req) => {
  const d = req.get('x-company-domain') || '';
  const domain = (d || '').toString().trim().toLowerCase();
  // Default to app.gmaxepay.in if no domain provided
  return domain || 'app.gmaxepay.in';
};

const ensureDomainMatches = (req, company) => {
  const requested = getRequestedDomain(req);
  // Always validate that the requested domain is allowed (localhost or app.gmaxepay.in)
  if (!isAllowedCompanyDomain(requested)) {
    return false;
  }
  // If the request is coming from core allowed domains, allow regardless of company's customDomain
  if (requested === 'app.gmaxepay.in' || requested === 'localhost') {
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
  const tokenRecord = await dbService.findOne(model.onboardingToken, {
    token,
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
  
  const userDetails = {
    userId: user.id,
    mobileVerify: user.mobileVerify,
    emailVerify: user.emailVerify,
    aadharVerify: user.aadharVerify,
    panVerify: user.panVerify,
    mobileNo: user.mobileNo,
    email: user.email,
    profileImage: user.profileImage,
    aadharFrontImage: user.aadharFrontImage,
    aadharBackImage: user.aadharBackImage,
    panCardFrontImage: user.panCardFrontImage,
    panCardBackImage: user.panCardBackImage,
  }
  const outletDetails = outlet ? {
    outletId: outlet.id || null,
    shopName: outlet.shopName,
    shopAddress: outlet.shopAddress,
    gstNo: outlet.gstNo,
    mobileNo: outlet.mobileNo,
    zipCode: outlet.zipCode
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
  
  const aadhaarSubSteps = [
    { key: 'connect', label: 'Connect Aadhaar', done: aadhaarConnect },
    { key: 'download', label: 'Download Aadhaar', done: aadhaarDownload },
    { key: 'upload', label: 'Upload Aadhaar Images', done: aadhaarUpload }
  ];
  
  const panSubSteps = [
    { key: 'connect', label: 'Connect PAN', done: panConnect },
    { key: 'download', label: 'Download PAN', done: panDownload },
    { key: 'upload', label: 'Upload PAN Images', done: panUpload }
  ];
  
  const aadhaarAllDone = aadhaarConnect && aadhaarDownload && aadhaarUpload;
  const panAllDone = panConnect && panDownload && panUpload;
  
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
    { key: 'shopDetails', label: 'Shop/outlet details', done: !!outletDetails },
    { key: 'bankVerification', label: 'Bank verification', done: !!(customerBankDetails && customerBankDetails.accountNumber && customerBankDetails.ifsc) },
    { key: 'profile', label: 'Profile setup', done: !!userDetails?.profileImage }
  ];
  const pending = steps.filter(s => !s.done).map(s => s.key);
  return { steps, pending, allCompleted: pending.length === 0 };
};

/**
 * Verify onboarding token and return user details
 * @route GET /company/onboarding/:token
 */
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
    const { tokenData, userDetails, outletDetails, customerBankDetails, aadhaarDoc, panDoc } = ctx;
    const pendingInfo = getPendingSteps({ userDetails, outletDetails, customerBankDetails, aadhaarDoc, panDoc });
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

/**
 * Mark onboarding token as used (call this after successful onboarding)
 * @route POST /company/onboarding/:token/complete
 */
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
    if(mobileNo != ctx.userDetails.mobileNo) {
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
    if(mobileNo != ctx.userDetails.mobileNo) {
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
    if(email != user.email){
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
    if(email != user.email){
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
  try{
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    const {redirect_url} = req.body || {};
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }
    if (!redirect_url) return res.failure({ message: 'Redirect URL is required' });
    const  existingUser = await dbService.findOne(model.user, { id: ctx.tokenData.userId, companyId: ctx.tokenData.companyId, isDeleted: false });
    if(!existingUser) return res.failure({ message: 'User not found' });
    
    // Check if document already exists (already processed)
    const existingDoc = await dbService.findOne(model.digilockerDocument, {
      refId: ctx.tokenData.userId,
      companyId: ctx.tokenData.companyId,
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
      return res.success({ message: 'Aadhaar Connection Successful' , data: response });
    } else {
      // If response is not successful, don't save anything
      return res.failure({ message: 'Failed to connect Aadhaar verification', data: response });
    }
  } catch (error) {
    console.error('Error connecting Aadhaar verification:', error);
    return res.failure({ message: 'Failed to connect Aadhaar verification', error: error.message });
  }
}

// Step 5: PAN verification
const connectPanVerification = async (req, res) => {
  try{
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }
    const {redirect_url} = req.body || {};
    if (!redirect_url) return res.failure({ message: 'Redirect URL is required' });
    const existingUser = await dbService.findOne(model.user, { id: ctx.tokenData.userId, companyId: ctx.tokenData.companyId, isDeleted: false });
    if(!existingUser) return res.failure({ message: 'User not found' });
    
    // Check if document already exists (already processed)
    const existingDoc = await dbService.findOne(model.digilockerDocument, {
      refId: ctx.tokenData.userId,
      companyId: ctx.tokenData.companyId,
      documentType: 'PAN',
      isDeleted: false
    });
    
    if (existingDoc) {
      return res.failure({ message: 'PAN verification already processed. Please download from digilocker' });
    }
    
    const response = await ekycHub.createPanVerificationUrl(redirect_url);
    
    // Only store verification_id and reference_id if response is successful
    if (response && response.status === 'Success') {
      const { verification_id, reference_id } = response;
      if (verification_id) {
        // Create new document record with verification details (only once)
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
      }
      return res.success({ message: 'PAN Connection Successful' , data: response });
    } else {
      // If response is not successful, don't save anything
      return res.failure({ message: 'Failed to connect PAN verification', data: response });
    }
  }
  catch (error) {
    console.error('Error connecting PAN verification:', error);
    return res.failure({ message: 'Failed to connect PAN verification', error: error.message });
  }
}

// Get Digilocker Both Pan and Aadhaar Documents
const getDigilockerDocuments = async (req, res) => {
  try{
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }
    const { document_type } = req.body || {};
    
    // Validate document_type first
    if (!document_type) return res.failure({ message: 'Document type is required (AADHAAR or PAN)' });
    
    // Normalize document_type to uppercase
    const docType = document_type.toUpperCase();
    if (docType !== 'AADHAAR' && docType !== 'PAN') {
      return res.failure({ message: 'Invalid document type. Must be AADHAAR or PAN' });
    }

    const existingUser = await dbService.findOne(model.user, { id: ctx.tokenData.userId, companyId: ctx.tokenData.companyId, isDeleted: false });
    if(!existingUser) return res.failure({ message: 'User not found' });

    // Find existing document record (created when connectAadhaarVerification or connectPanVerification was called)
    const existingDigilockerDocument = await dbService.findOne(model.digilockerDocument, {
      refId: ctx.tokenData.userId,
      companyId: ctx.tokenData.companyId,
      documentType: docType,
      isDeleted: false
    });

    // Check if verification was initiated - if no record found, tell them to connect first
    if (!existingDigilockerDocument) {
      return res.failure({ message: `Please connect your ${docType === 'AADHAAR' ? 'Aadhaar' : 'PAN'} to digilocker first` });
    }

    if (!existingDigilockerDocument.verificationId) {
      return res.failure({ message: 'Verification ID is required. Please connect verification first' });
    }

    if (!existingDigilockerDocument.referenceId) {
      return res.failure({ message: 'Reference ID is required. Please connect verification first' });
    }

    // Extract verification_id and reference_id from stored document
    const verification_id = existingDigilockerDocument.verificationId;
    const reference_id = existingDigilockerDocument.referenceId;
    
    let response;
    let shouldFetchFromApi = true;
    
    // If document already has full data (name for Aadhaar or panNumber for PAN), it's already processed
    if ((docType === 'AADHAAR' && existingDigilockerDocument.name) || (docType === 'PAN' && existingDigilockerDocument.panNumber)) {
      // Already processed - return existing data
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
    
    // Fetch from API if needed (document exists but doesn't have full data yet - only once)
    if (shouldFetchFromApi) {
      response = await ekycHub.getDocuments(verification_id, reference_id, document_type);
      
      // Store the response in database only if successful (only once)
      if (response && response.status === 'Success') {
        const docData = response;
        const updateData = {
          referenceId: docData.reference_id || reference_id || existingDigilockerDocument.referenceId,
          status: docData.status || 'Success',
          message: docData.message || null,
          txid: docData.txid || null,
          fullResponse: docData
        };
        
        if (docType === 'AADHAAR') {
          // Store Aadhaar specific fields
          updateData.name = docData.name || null;
          updateData.uid = docData.uid || null;
          updateData.dob = docData.dob || null;
          updateData.gender = docData.gender || null;
          updateData.careOf = docData.care_of || null;
          updateData.address = docData.address || null;
          updateData.splitAddress = docData.split_address || null;
          updateData.yearOfBirth = docData.year_of_birth || null;
          updateData.photoLink = docData.photo_link || null; // Base64 encoded photo
          updateData.xmlFile = docData.xml_file || null;
        } else if (docType === 'PAN') {
          // Store PAN specific fields
          updateData.panNumber = docData.pan_number || docData.pan || null;
          updateData.panName = docData.name || null;
          updateData.panFatherName = docData.father_name || null;
          updateData.panDob = docData.dob || null;
        }
        
        // Update existing document with full data (only once)
        await dbService.update(
          model.digilockerDocument,
          { id: existingDigilockerDocument.id },
          updateData
        );
        
        // Update user verification status
        if (docType === 'AADHAAR') {
          await dbService.update(model.user, { id: ctx.user.id }, { aadharVerify: true });
          await dbService.update(model.user, { id: ctx.user.id }, { name: updateData.name });
        } else if (docType === 'PAN') {
          await dbService.update(model.user, { id: ctx.user.id }, { panVerify: true });
        }
      }
    }

    const message = docType === 'AADHAAR' 
      ? 'Aadhaar Verification Downloaded' 
      : 'PAN Verification Downloaded';
    
    return res.success({ message, data: response.data || response });
  }
  catch (error) {
    console.error('Error downloading Digilocker verification:', error);
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
  
    if(!shopName) return res.failure({ message: 'Shop name is required' });
    if(!longitude) return res.failure({ message: 'Longitude is required' });
    if(!ipAddress) return res.failure({ message: 'IP address is required' });
    if(!latitude) return res.failure({ message: 'Latitude is required' });

    // Reverse geocode to get complete address
    const addressData = await googleMap.reverseGeocode(latitude, longitude);
    const formatted_address = addressData.formatted_address;
    const completeAddress = addressData.complete_address;

    // Optional shop image upload (multer memory storage)
    let shopImageKey = null;
    if (req.file && req.file.buffer) {
      const uploadResult = await imageService.uploadImageToS3(
        req.file.buffer,
        req.file.originalname || 'shop.jpg',
        'shop',
        ctx.company.id
      );
      shopImageKey = uploadResult.key;
    }

    const outletPayload = {
      shopName,
      shopAddress: formatted_address||completeAddress,
      ...(shopImageKey ? { shopImage: shopImageKey } : {}),
      outletGoogleMapsLink: addressData?.place_google_maps_link,
      shopCity: addressData?.address_components?.city,
      shopDistrict: addressData?.address_components?.district,
      shopState: addressData?.address_components?.state,
      shopPincode: addressData?.address_components?.postal_code
    };

    // Allow creating shop details only once per user/company
    if (ctx.outlet) {
      return res.failure({ message: 'Shop details already submitted' });
    }

    const outlet = await dbService.createOne(
      model.outlet,
      { refId: ctx.user.id, companyId: ctx.company.id, userRole: ctx.user.userRole, ...outletPayload }
    );
    const pendingInfo = getPendingSteps({ user: ctx.user, outlet, customerBank: ctx.customerBank, aadhaarDoc: ctx.aadhaarDoc, panDoc: ctx.panDoc });
    return res.success({ message: 'Shop details saved', data: { address: completeAddress, steps: pendingInfo.steps, pending: pendingInfo.pending } });
  } catch (error) {
    console.error('Error in shop details:', error);
    return res.failure({ message: 'Failed to save shop details', error: error.message });
  }
};

// Step 7: Bank details (CustomerBank)
const postBankDetails = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }
    const {account_number, ifsc } = req.body || {};
    if(!account_number) return res.failure({ message: 'Account number is required' });
    if(!ifsc) return res.failure({ message: 'IFSC is required' });

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

    if(existingBank){
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
        // If not encrypted or not JSON, return as is
        bankVerification = existingBank.response;
      }
    } else {
      bankVerification = await ekycHub.bankVerification(account_number, ifsc);

      // Only save if verification is successful
      if(bankVerification && bankVerification.status === 'Success'){
        // Encrypt the response before saving
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

    if(bankVerification.status !== 'Success') return res.failure({ message: 'Bank verification failed' });
    
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
    const beneficiaryName = bankVerification.beneficiary_name || bankVerification.beneficiaryName || ctx.user.name;
    const accountNumber = bankVerification.account_number || account_number;
    // Use Razorpay city/branch if available, otherwise use eKYC response
    const city = (razorpayBankData && razorpayBankData.CITY) 
      ? razorpayBankData.CITY 
      : (bankVerification.city || null);
    const branch = (razorpayBankData && razorpayBankData.BRANCH) 
      ? razorpayBankData.BRANCH 
      : (bankVerification.branch || null);

    // Find or create customer record (customerBank.refId references customer table, not user)
    let customer = await dbService.findOne(model.customer, {
      mobile: ctx.user.mobileNo
    });

    if (!customer) {
      // Create customer record from user data
      const customerName = ctx.user.name || '';
      const nameParts = customerName.split(' ');
      const firstName = nameParts[0] || customerName;
      const lastName = nameParts.slice(1).join(' ') || null;

      customer = await dbService.createOne(model.customer, {
        firstName,
        lastName,
        email: ctx.user.email || null,
        mobile: ctx.user.mobileNo,
        isActive: true
      });
    }

    let customerBank = ctx.customerBank;
    const payload = {
      refId: customer.id, 
      companyId: ctx.company.id,
      bankName,
      beneficiaryName: beneficiaryName || ctx.user.name,
      accountNumber,
      ifsc,
      city: city || null,
      branch: branch || null,
      isActive: true
    };
    if (customerBank) {
      customerBank = await dbService.update(model.customerBank, { id: customerBank.id }, payload);
    } else {
      customerBank = await dbService.createOne(model.customerBank, payload);
    }
    const pendingInfo = getPendingSteps({ user: ctx.user, outlet: ctx.outlet, customerBank, aadhaarDoc: ctx.aadhaarDoc, panDoc: ctx.panDoc });
    return res.success({ message: 'Bank details saved', data: { steps: pendingInfo.steps, pending: pendingInfo.pending } });
  } catch (error) {
    console.error('Error in bank details:', error);
    return res.failure({ message: 'Failed to save bank details', error: error.message });
  }
};

// Step 8: Profile
const postProfile = async (req, res) => {
  try {
    // Early validation
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    
    const token = getTokenFromReq(req);
    const hasImage = req.file && req.file.buffer;
    
    if (!hasImage) {
      return res.failure({ 
        message: 'Profile image is required. Please upload a profile image.' 
      });
    }
    
    // Load context
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
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
      refId: ctx.user.id, 
      companyId: ctx.company.id, 
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
        ctx.company.id,
        'user',
        ctx.user.id
      );
      
      updates.profileImage = uploadResult.key;
      updates.imageVerify = true;
    } catch (imageError) {
      console.error('Error processing profile image:', imageError);
      // Return user-friendly error message
      if (imageError.message.includes('not recognized')) {
        return res.failure({ message: imageError.message });
      }
      return res.failure({ message: 'Failed to process profile image', error: imageError.message });
    }
    
    // Update user in database
    await dbService.update(model.user, { id: ctx.user.id }, updates);
    
    // Prepare response
    const updatedUser = { ...ctx.user, ...updates };
    const pendingInfo = getPendingSteps({ 
      user: updatedUser, 
      outlet: ctx.outlet, 
      customerBank: ctx.customerBank,
      aadhaarDoc: ctx.aadhaarDoc,
      panDoc: ctx.panDoc
    });
    
    const responseData = {
      steps: pendingInfo.steps,
      pending: pendingInfo.pending
    };
    
    return res.success({ message: 'Your Profile is updated and matched with Aadhaar card', data: responseData });
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
    
    const [frontUploadResult, backUploadResult, llmResponse] = await Promise.all([
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
      ),
      llmService.llmAadhaarOcr(front_photo, back_photo)
    ]);
    
    const frontImageS3Key = frontUploadResult.key;
    const backImageS3Key = backUploadResult.key;
    
    if (!llmResponse || !llmResponse.success) {
      await dbService.update(model.user, { id: ctx.user.id }, {
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
            await dbService.update(model.user, { id: ctx.user.id }, {
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

    const aadharLast4 = extractedData.aadhaar_number?.toString().slice(-4) || '';
    const matchStatus = extractedData.aadhaar_numbers_match ? '1' : '0';
    const validationPassed = existingAadharDetails && validationResults.allValidationsPassed ? '1' : '0';
    const aadharDetailsString = `${aadharLast4},${matchStatus},${validationPassed}`;

    const updateData = {
      aadharFrontImage: frontImageS3Key, 
      aadharBackImage: backImageS3Key,
      aadharDetails: aadharDetailsString
    };
    
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
        const minimalDetails = extractedData.aadhaar_numbers_match ? '1' : '0';
        try {
          updateData.aadharDetails = minimalDetails;
          await dbService.update(model.user, { id: ctx.user.id }, updateData);
        } catch (secondError) {
          const { aadharDetails, ...updateDataWithoutDetails } = updateData;
          await dbService.update(model.user, { id: ctx.user.id }, updateDataWithoutDetails);
        }
      } else {
        throw dbError;
      }
    }
    
    await cleanupOldImages(oldFrontImageKey, oldBackImageKey, frontImageS3Key, backImageS3Key);
    
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
    const back_photo = req.files?.back_photo?.[0];
    
    if (!front_photo || !back_photo) {
      const receivedFields = req.files ? Object.keys(req.files).join(', ') : 'none';
      return res.failure({ 
        message: !front_photo ? 'Front photo is required' : 'Back photo is required',
        receivedFields: receivedFields || 'none',
        expectedFields: ['front_photo', 'back_photo']
      });
    }
    
    const existingUser = await dbService.findOne(model.user, { id: ctx.user.id });
    const oldFrontImageKey = extractS3Key(existingUser?.panCardFrontImage);
    const oldBackImageKey = extractS3Key(existingUser?.panCardBackImage);
    
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
        back_photo.buffer,
        back_photo.originalname || 'back_photo.jpg',
        'pan',
        ctx.company.id,
        'back',
        ctx.user.id
      )
    ]);
    
    const frontImageS3Key = frontUploadResult.key;
    const backImageS3Key = backUploadResult.key;
    
    const updateData = {
      panCardFrontImage: frontImageS3Key,
      panCardBackImage: backImageS3Key
    };
    
    await dbService.update(model.user, { id: ctx.user.id }, updateData);
    
    await cleanupOldImages(oldFrontImageKey, oldBackImageKey, frontImageS3Key, backImageS3Key);
    
    return res.success({ 
      message: 'PAN documents uploaded successfully',
      data: {
        panCardFrontImage: frontImageS3Key,
        panCardBackImage: backImageS3Key
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
  uploadPanDocuments
};
