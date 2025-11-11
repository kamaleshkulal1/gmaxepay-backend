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
const { doubleEncrypt, decrypt } = require('../../../utils/doubleCheckUp');
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
  const customerBank = await dbService.findOne(model.customerBank, { refId: user.id, companyId: company.id });
  const userDetails = {
    userId: user.id,
    mobileVerify: user.mobileVerify,
    emailVerify: user.emailVerify,
    aadharVerify: user.aadharVerify,
    panVerify: user.panVerify,
    mobileNo: user.mobileNo,
    email: user.email,
    profileImage: user.profileImage,
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

  return { tokenRecord, tokenData, company, user, outlet, customerBank, companyDetails, userDetails, outletDetails, customerBankDetails };
};

const getPendingSteps = (ctx) => {
  const userDetails = ctx.userDetails || ctx.user || {};
  const outletDetails = ctx.outletDetails || ctx.outlet || null;
  const customerBankDetails = ctx.customerBankDetails || ctx.customerBank || null;
  const steps = [
    { key: 'mobileVerification', label: 'Mobile verification', done: !!userDetails?.mobileVerify },
    { key: 'emailVerification', label: 'Email verification', done: !!userDetails?.emailVerify },
    { key: 'aadharVerification', label: 'Aadhaar verification', done: !!userDetails?.aadharVerify },
    { key: 'panVerification', label: 'PAN verification', done: !!userDetails?.panVerify },
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
    const { tokenData, userDetails, outletDetails, customerBankDetails } = ctx;
    const pendingInfo = getPendingSteps({ userDetails, outletDetails, customerBankDetails });
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

    const pendingInfo = getPendingSteps({ userDetails: ctx.userDetails, outletDetails: ctx.outletDetails, customerBankDetails: ctx.customerBankDetails });
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

    const pendingInfo = getPendingSteps({ userDetails: { ...ctx.userDetails, mobileVerify: true }, outletDetails: ctx.outletDetails, customerBankDetails: ctx.customerBankDetails });
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

    const pendingInfo = getPendingSteps({ userDetails: ctx.userDetails, outletDetails: ctx.outletDetails, customerBankDetails: ctx.customerBankDetails });
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

    const pendingInfo = getPendingSteps({ userDetails: { ...ctx.userDetails, emailVerify: true }, outletDetails: ctx.outletDetails, customerBankDetails: ctx.customerBankDetails });
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
    console.log("response", response);
    console.log("response.status", response.status);
    console.log("response.data", response.data);
    
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
      console.log("API response", response);
      
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
    const pendingInfo = getPendingSteps({ user: ctx.user, outlet, customerBank: ctx.customerBank });
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
    
    // Extract bank details from verification response
    const bankName = bankVerification.bank_name || bankVerification.bankName || null;
    const beneficiaryName = bankVerification.beneficiary_name || bankVerification.beneficiaryName || ctx.user.name;
    const accountNumber = bankVerification.account_number || account_number;
    const city = bankVerification.city || null;
    const branch = bankVerification.branch || null;

    let customerBank = ctx.customerBank;
    const payload = {
      refId: ctx.user.id,
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
    const pendingInfo = getPendingSteps({ user: ctx.user, outlet: ctx.outlet, customerBank });
    return res.success({ message: 'Bank details saved', data: { steps: pendingInfo.steps, pending: pendingInfo.pending } });
  } catch (error) {
    console.error('Error in bank details:', error);
    return res.failure({ message: 'Failed to save bank details', error: error.message });
  }
};

// Step 8: Profile
const postProfile = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const { name, fullAddress, city, state, zipcode, profileImage } = req.body || {};
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Invalid Domain' });
    }
    const updates = {};
    if (name) updates.name = name;
    if (fullAddress) updates.fullAddress = fullAddress;
    if (city) updates.city = city;
    if (state) updates.state = state;
    if (zipcode) updates.zipcode = zipcode;
    if (profileImage) updates.profileImage = profileImage; // expects S3 key from upload API
    if (Object.keys(updates).length === 0) return res.failure({ message: 'No updates provided' });
    await dbService.update(model.user, { id: ctx.user.id }, updates);
    const pendingInfo = getPendingSteps({ user: { ...ctx.user, ...updates }, outlet: ctx.outlet, customerBank: ctx.customerBank });
    return res.success({ message: 'Profile updated', data: { steps: pendingInfo.steps, pending: pendingInfo.pending } });
  } catch (error) {
    console.error('Error in profile update:', error);
    return res.failure({ message: 'Failed to update profile', error: error.message });
  }
};

// const uploadAadharDocuments = async (req, res) => {
//   try {
//     if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
//     const token = getTokenFromReq(req);
//     const ctx = await loadContextByToken(token);
//     if (ctx.error) return res.failure({ message: ctx.error });
//     if (!ensureDomainMatches(req, ctx.company)) {
//       return res.failure({ message: 'Invalid Domain' });
//     }
//    if(req.body.front_photo) return res.failure({ message: 'Front photo is required' });
//    if(req.body.back_photo) return res.failure({ message: 'Back photo is required' });
//     const response = await ekycHub.uploadAadharDocuments(req.body);
//     return res.success({ message: 'Aadhar documents uploaded', data: response });
//   }

//   catch (error) {
//     console.error('Error in upload Aadhar documents:', error);
//     return res.failure({ message: 'Failed to upload Aadhar documents', error: error.message });
//   }
// }

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
    const pendingInfo = getPendingSteps({ user: ctx.user, outlet: ctx.outlet, customerBank: ctx.customerBank });
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
  getPending
};


