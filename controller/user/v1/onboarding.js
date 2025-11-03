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
const { doubleEncrypt, decrypt } = require('../../../utils/doubleCheckUp');
const key = Buffer.from(process.env.AES_KEY, 'hex');

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

  // Validate domain if provided
  if (domain) {
    const companyDomain = (company.customDomain || '').toString().trim().toLowerCase();
    const requestedDomain = domain.toString().trim().toLowerCase();
    
    // Allow localhost and app.gmaxepay.in
    const allowedDomains = ['localhost', 'app.gmaxepay.in'];
    if (!allowedDomains.includes(requestedDomain) && companyDomain !== requestedDomain) {
      return { error: 'Invalid domain' };
    }
  }

  return { company, companyId };
};

// Load user context
const loadUserContext = async (req, companyId) => {
  const { userId } = req.body || {};
  
  if (!userId) {
    return { error: 'userId is required in request body' };
  }

  const user = await dbService.findOne(model.user, { 
    id: userId, 
    companyId: companyId,
    isDeleted: false 
  });

  if (!user) {
    return { error: 'User not found' };
  }

  const outlet = await dbService.findOne(model.outlet, { 
    refId: user.id, 
    companyId: companyId 
  });

  const customerBank = await dbService.findOne(model.customerBank, { 
    refId: user.id, 
    companyId: companyId 
  });

  const userDetails = {
    userId: user.id,
    mobileVerify: user.mobileVerify,
    emailVerify: user.emailVerify,
    aadharVerify: user.aadharVerify,
    panVerify: user.panVerify,
    mobileNo: user.mobileNo,
    email: user.email,
    profileImage: user.profileImage,
  };

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

  return { user, outlet, customerBank, userDetails, outletDetails, customerBankDetails };
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

// Step 1: Mobile verification - Send OTP
const sendSmsMobile = async (req, res) => {
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

    const { user, userDetails } = userCtx;
    const { mobileNo } = req.body || {};

    if (mobileNo != user.mobileNo) {
      return res.failure({ message: 'Invalid Mobile Number' });
    }

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

    const pendingInfo = getPendingSteps({ 
      userDetails, 
      outletDetails: userCtx.outletDetails, 
      customerBankDetails: userCtx.customerBankDetails 
    });

    return res.success({ 
      message: 'OTP sent to registered mobile number', 
      data: { steps: pendingInfo.steps, pending: pendingInfo.pending } 
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
    await dbService.update(model.user, { id: user.id }, { 
      mobileVerify: true, 
      otpMobile: null 
    });
    await user.resetOtpAttempts();

    const pendingInfo = getPendingSteps({ 
      userDetails: { ...userDetails, mobileVerify: true }, 
      outletDetails, 
      customerBankDetails 
    });

    return res.success({ 
      message: 'Mobile verified successfully', 
      data: { steps: pendingInfo.steps, pending: pendingInfo.pending } 
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

    if (email != user.email) {
      return res.failure({ message: 'Invalid Email Address' });
    }

    if (!user.email) {
      return res.failure({ message: 'Email not set for user' });
    }

    await user.resetLoginAttempts();

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
      customerBankDetails 
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

    await dbService.update(model.user, { id: user.id }, { 
      emailVerify: true, 
      otpEmail: null 
    });
    await user.resetOtpAttempts();

    const pendingInfo = getPendingSteps({ 
      userDetails: { ...userDetails, emailVerify: true }, 
      outletDetails, 
      customerBankDetails 
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

    const { companyId, company } = companyCtx;
    const userCtx = await loadUserContext(req, companyId);
    if (userCtx.error) {
      return res.failure({ message: userCtx.error });
    }

    const { user } = userCtx;
    const { email } = req.body || {};

    if (email != user.email) {
      return res.failure({ message: 'Invalid Email Address' });
    }

    if (!user.email) {
      return res.failure({ message: 'Email not set for user' });
    }

    await user.resetOtpAttempts();

    const code = random.randomNumber(6);
    const hashedCode = await bcrypt.hash(code, 10);
    const expireOTP = moment().add(3, 'minutes').toISOString();

    await dbService.update(model.user, { id: user.id }, { 
      otpEmail: `${hashedCode}~${expireOTP}` 
    });

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

    const { companyId } = companyCtx;
    const userCtx = await loadUserContext(req, companyId);
    if (userCtx.error) {
      return res.failure({ message: userCtx.error });
    }

    const { redirect_url } = req.body || {};
    if (!redirect_url) {
      return res.failure({ message: 'Redirect URL is required' });
    }

    const response = await ekycHub.createAadharVerificationUrl(redirect_url);
    return res.success({ 
      message: 'Aadhaar Connection Successful', 
      data: response 
    });
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

    const { companyId } = companyCtx;
    const userCtx = await loadUserContext(req, companyId);
    if (userCtx.error) {
      return res.failure({ message: userCtx.error });
    }

    const { redirect_url } = req.body || {};
    if (!redirect_url) {
      return res.failure({ message: 'Redirect URL is required' });
    }

    const response = await ekycHub.createPanVerificationUrl(redirect_url);
    return res.success({ 
      message: 'PAN Connection Successful', 
      data: response 
    });
  } catch (error) {
    console.error('Error connecting PAN verification:', error);
    return res.failure({ 
      message: 'Failed to connect PAN verification', 
      error: error.message 
    });
  }
};

// Get Digilocker documents
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

    const { verification_id, reference_id, document_type } = req.body || {};
    if (!verification_id) {
      return res.failure({ message: 'Verification ID is required' });
    }

    const response = await ekycHub.getDocuments(verification_id, reference_id, document_type);
    return res.success({ 
      message: 'Aadhaar Verification Downloaded', 
      data: response 
    });
  } catch (error) {
    console.error('Error downloading Aadhaar verification:', error);
    return res.failure({ 
      message: 'Failed to download Aadhaar verification', 
      error: error.message 
    });
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

    let updatedOutlet = outlet;
    if (outlet) {
      updatedOutlet = await dbService.update(model.outlet, { id: outlet.id }, { 
        shopName, 
        ipAddress, 
        latitude, 
        longitude 
      });
    } else {
      updatedOutlet = await dbService.createOne(model.outlet, { 
        refId: user.id, 
        companyId: company.id, 
        userRole: user.userRole, 
        shopName, 
        ipAddress, 
        latitude, 
        longitude 
      });
    }

    const pendingInfo = getPendingSteps({ 
      user, 
      outlet: updatedOutlet, 
      customerBank 
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

    // Extract bank details from verification response
    const bankName = bankVerification.bank_name || bankVerification.bankName || null;
    const beneficiaryName = bankVerification.beneficiary_name || bankVerification.beneficiaryName || user.name;
    const accountNumber = bankVerification.account_number || account_number;
    const city = bankVerification.city || null;
    const branch = bankVerification.branch || null;

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
      isActive: true
    };

    if (customerBank) {
      updatedCustomerBank = await dbService.update(model.customerBank, { 
        id: customerBank.id 
      }, payload);
    } else {
      updatedCustomerBank = await dbService.createOne(model.customerBank, payload);
    }

    const pendingInfo = getPendingSteps({ 
      user, 
      outlet, 
      customerBank: updatedCustomerBank 
    });

    return res.success({ 
      message: 'Bank details saved', 
      data: { steps: pendingInfo.steps, pending: pendingInfo.pending } 
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

    const { companyId } = companyCtx;
    const userCtx = await loadUserContext(req, companyId);
    if (userCtx.error) {
      return res.failure({ message: userCtx.error });
    }

    const { user, outlet, customerBank } = userCtx;
    const { name, fullAddress, city, state, zipcode, profileImage } = req.body || {};

    const updates = {};
    if (name) updates.name = name;
    if (fullAddress) updates.fullAddress = fullAddress;
    if (city) updates.city = city;
    if (state) updates.state = state;
    if (zipcode) updates.zipcode = zipcode;
    if (profileImage) updates.profileImage = profileImage; // expects S3 key from upload API

    if (Object.keys(updates).length === 0) {
      return res.failure({ message: 'No updates provided' });
    }

    await dbService.update(model.user, { id: user.id }, updates);

    const pendingInfo = getPendingSteps({ 
      user: { ...user, ...updates }, 
      outlet, 
      customerBank 
    });

    return res.success({ 
      message: 'Profile updated', 
      data: { steps: pendingInfo.steps, pending: pendingInfo.pending } 
    });
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

    const { user, outlet, customerBank } = userCtx;
    const pendingInfo = getPendingSteps({ 
      user, 
      outlet, 
      customerBank 
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

module.exports = {
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

