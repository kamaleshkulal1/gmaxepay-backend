const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const { decryptOnboardingToken } = require('../../../utils/onboardingToken');
const bcrypt = require('bcrypt');
const moment = require('moment');
const random = require('../../../utils/common');
const amezesmsApi = require('../../../services/amezesmsApi');
const { JWT } = require('../../../constants/authConstant');
const emailService = require('../../../services/emailService');

// Allowed Origin for onboarding flows
const getOrigin = (req) => req.get('origin') || req.get('referer') || '';

const ensureAllowedOrigin = (req) => {
  // In non-production, allow all origins for local testing
  if ((process.env.NODE_ENV || '').toLowerCase() !== 'production') {
    return true;
  }
  const origin = getOrigin(req);
  return origin && origin.startsWith(process.env.FRONTEND_URL);
};

const getRequestedDomain = (req) => {
  const d =  req.get('x-company-domain') || '';
  return (d || '').toString().trim().toLowerCase();
};

const ensureDomainMatches = (req, company) => {
  const requested = getRequestedDomain(req);
  if (!requested) return true; // allow if not provided
  const expected = (company?.customDomain || '').toString().trim().toLowerCase();
  if (!expected) return true; // if company has no domain stored, skip
  return requested === expected;
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
      return res.failure({ message: 'Domain mismatch' });
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
      return res.failure({ message: 'Domain mismatch' });
    }
    if(mobileNo != ctx.userDetails.mobileNo) {
      return res.failure({ message: 'Mobile number mismatch' });
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
      return res.failure({ message: 'Domain mismatch' });
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
      return res.failure({ message: 'Domain mismatch' });
    }
    if(mobileNo != ctx.userDetails.mobileNo) {
      return res.failure({ message: 'Mobile number mismatch' });
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
const postEmailVerification = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const { email, otpVerified } = req.body || {};
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Domain mismatch' });
    }
    const updates = {};
    if (email) updates.email = email;
    if (otpVerified === true) updates.emailVerify = true;
    if (Object.keys(updates).length === 0) return res.failure({ message: 'No updates provided' });
    await dbService.update(model.user, { id: ctx.user.id }, updates);
    const pendingInfo = getPendingSteps({ user: { ...ctx.user, ...updates }, outlet: ctx.outlet, customerBank: ctx.customerBank });
    return res.success({ message: 'Email verification updated', data: { steps: pendingInfo.steps, pending: pendingInfo.pending } });
  } catch (error) {
    console.error('Error in email verification:', error);
    return res.failure({ message: 'Failed to update email verification', error: error.message });
  }
};

// Email OTP: send
const sendEmailOtp = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const { email } = req.body || {};
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Domain mismatch' });
    }
    const user = await dbService.findOne(model.user, { id: ctx.tokenData.userId, companyId: ctx.tokenData.companyId, isDeleted: false });
    if(email != user.email){
      return res.failure({ message: 'Email mismatch' });
    }
    
    if (!user) return res.failure({ message: 'User not found' });
    if (!user.email) return res.failure({ message: 'Email not set for user' });

    await user.resetLoginAttempts();

    const code = random.randomNumber(6);
    const hashedCode = await bcrypt.hash(code, 10);
    const expireOTP = moment().add(3, 'minutes').toISOString();

    await dbService.update(model.user, { id: user.id }, { otpEmail: `${hashedCode}~${expireOTP}` });

    await emailService.sendOtpEmail({ to: user.email, userName: user.name || 'User', otp: String(code), expiryMinutes: 3 });

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
      return res.failure({ message: 'Domain mismatch' });
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
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Domain mismatch' });
    }

    const user = await dbService.findOne(model.user, { id: ctx.tokenData.userId, companyId: ctx.tokenData.companyId, isDeleted: false });
    if (!user) return res.failure({ message: 'User not found' });
    if (!user.email) return res.failure({ message: 'Email not set for user' });

    await user.resetOtpAttempts();

    const code = random.randomNumber(6);
    const hashedCode = await bcrypt.hash(code, 10);
    const expireOTP = moment().add(3, 'minutes').toISOString();

    await dbService.update(model.user, { id: user.id }, { otpEmail: `${hashedCode}~${expireOTP}` });
    await emailService.sendOtpEmail({ to: user.email, userName: user.name || 'User', otp: String(code), expiryMinutes: 3 });

    return res.success({ message: 'New OTP sent to registered email' });
  } catch (error) {
    console.error('Error resetting email OTP:', error);
    return res.failure({ message: 'Failed to reset email OTP', error: error.message });
  }
};

// Step 3: Aadhaar and PAN verification
const postKycVerification = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const { aadharVerified, panVerified, aadharInfo, panInfo } = req.body || {};
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Domain mismatch' });
    }
    const updates = {};
    if (aadharVerified === true) updates.aadharVerify = true;
    if (panVerified === true) updates.panVerify = true;
    if (aadharInfo) updates.aadharInfo = aadharInfo;
    if (panInfo) updates.panInfo = panInfo;
    if (Object.keys(updates).length === 0) return res.failure({ message: 'No updates provided' });
    await dbService.update(model.user, { id: ctx.user.id }, updates);
    const pendingInfo = getPendingSteps({ user: { ...ctx.user, ...updates }, outlet: ctx.outlet, customerBank: ctx.customerBank });
    return res.success({ message: 'KYC updated', data: { steps: pendingInfo.steps, pending: pendingInfo.pending } });
  } catch (error) {
    console.error('Error in KYC verification:', error);
    return res.failure({ message: 'Failed to update KYC verification', error: error.message });
  }
};

// Step 4: Shop details (Outlet)
const postShopDetails = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Domain mismatch' });
    }
    const { shopName, shopAddress, gstNo, mobileNo, zipCode } = req.body || {};
    if (!shopName || !shopAddress) return res.failure({ message: 'shopName and shopAddress are required' });
    let outlet = ctx.outlet;
    if (outlet) {
      outlet = await dbService.update(model.outlet, { id: outlet.id }, { shopName, shopAddress, gstNo, mobileNo, zipCode });
    } else {
      outlet = await dbService.createOne(model.outlet, {
        refId: ctx.user.id,
        companyId: ctx.company.id,
        userRole: ctx.user.userRole,
        shopName,
        shopAddress,
        gstNo: gstNo || null,
        mobileNo: mobileNo || ctx.user.mobileNo,
        zipCode: zipCode || ctx.user.zipcode
      });
    }
    const pendingInfo = getPendingSteps({ user: ctx.user, outlet, customerBank: ctx.customerBank });
    return res.success({ message: 'Shop details saved', data: { steps: pendingInfo.steps, pending: pendingInfo.pending } });
  } catch (error) {
    console.error('Error in shop details:', error);
    return res.failure({ message: 'Failed to save shop details', error: error.message });
  }
};

// Step 5: Bank details (CustomerBank)
const postBankDetails = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Domain mismatch' });
    }
    const { bankName, beneficiaryName, accountNumber, ifsc, city, branch } = req.body || {};
    if (!bankName || !accountNumber || !ifsc) return res.failure({ message: 'bankName, accountNumber and ifsc are required' });
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

// Step 6: Profile
const postProfile = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const { name, fullAddress, city, state, zipcode, profileImage } = req.body || {};
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Domain mismatch' });
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

// Utility endpoint: get pending steps only
const getPending = async (req, res) => {
  try {
    if (!ensureAllowedOrigin(req)) return res.failure({ message: 'Origin not allowed' });
    const token = getTokenFromReq(req);
    const ctx = await loadContextByToken(token);
    if (ctx.error) return res.failure({ message: ctx.error });
    if (!ensureDomainMatches(req, ctx.company)) {
      return res.failure({ message: 'Domain mismatch' });
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
  postEmailVerification,
  postKycVerification,
  postShopDetails,
  postBankDetails,
  postProfile,
  getPending
};


