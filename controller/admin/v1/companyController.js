const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const { Op } = require('sequelize');
const { where, cast, col } = require('sequelize');
const imageService = require('../../../services/imageService');
const { uploadImageToS3, deleteImageFromS3, getImageUrl } = imageService;
const key = Buffer.from(process.env.AES_KEY, 'hex');
const { decrypt, doubleEncrypt } = require('../../../utils/doubleCheckUp');
const { generateOnboardingToken } = require('../../../utils/onboardingToken');
const { generateUniqueReferCode } = require('../../../utils/generateUniqueReferCode');
const { sendWelcomeEmail } = require('../../../services/emailService');
const googleMap = require('../../../services/googleMap');
const postalPincode = require('../../../services/postalPincode');
const mapplesMap = require('../../../services/mapplesMap');

// Helper function to check IP address
const checkDomainIP = async (domain) => {
  const dns = require('dns').promises;
  
  // Get whitelisted IPs from environment variable
  const companyCheckIp = process.env.COMPANY_CHECK_IP;
  
  if (!companyCheckIp) {
    throw new Error('COMPANY_CHECK_IP environment variable is not configured');
  }

  // Parse the IP array from environment variable
  const whitelistedIPs = companyCheckIp
    .replace(/[\[\]]/g, '') // Remove brackets
    .split(',')
    .map(ip => ip.trim())
    .filter(ip => ip.length > 0);

  if (whitelistedIPs.length === 0) {
    throw new Error('No whitelisted IPs configured');
  }

  // Resolve domain to IPv4 addresses
  const resolvedIPs = await dns.resolve4(domain);
  
  console.log(`Domain ${domain} resolved to IPs: ${resolvedIPs.join(', ')}`);
  console.log(`Whitelisted IPs: ${whitelistedIPs.join(', ')}`);
  
  // Check if any resolved IP matches whitelisted IPs
  const matchedIPs = resolvedIPs.filter(ip => whitelistedIPs.includes(ip));
  
  if (matchedIPs.length === 0) {
    // Additional check: Try to find IPs in the same network range (first 3 octets match)
    const networkMatches = resolvedIPs.filter(resolvedIP => {
      const resolvedParts = resolvedIP.split('.');
      return whitelistedIPs.some(whitelistedIP => {
        const whitelistedParts = whitelistedIP.split('.');
        // Check if first 3 octets match (same network)
        return resolvedParts[0] === whitelistedParts[0] && 
               resolvedParts[1] === whitelistedParts[1] && 
               resolvedParts[2] === whitelistedParts[2];
      });
    });

    if (networkMatches.length > 0) {
      console.log(`Network match found but exact IP mismatch. Resolved: ${networkMatches.join(', ')}`);
      throw new Error(`Domain ${domain} resolves to IPs in the same network but not exact match. Resolved IPs: ${resolvedIPs.join(', ')}. Whitelisted IPs: ${whitelistedIPs.join(', ')}. Please update your DNS records or whitelist configuration.`);
    }
    
    throw new Error(`Domain ${domain} does not resolve to any whitelisted IP. Resolved IPs: ${resolvedIPs.join(', ')}. Whitelisted IPs: ${whitelistedIPs.join(', ')}`);
  }

  return {
    success: true,
    resolvedIPs,
    matchedIPs,
    whitelistedIPs
  };
};

const createCompany = async (req, res) => {
  try {
    let data = req.body;
    
    // Validate required fields
    if(!data.BussinessEntity) {
      return res.failure({
        message: 'Business entity is required'
      });
    }
    if(!data.MobileNo) {
      return res.failure({
        message: 'Mobile number is required'
      });
    }
    if(!data.PanNumber) {
      return res.failure({
        message: 'PAN number is required'
      });
    }
    if(!data.PanName) {
      return res.failure({
        message: 'PAN name is required'
      });
    }
    if(!data.email) {
      return res.failure({
        message: 'Email is required'
      });
    }
    // Check if profileImage is provided either as S3 key or as file upload
    if(!data.profileImage && !req.file) {
      return res.failure({
        message: 'Profile image is required. Please provide either profileImage (S3 key) or upload a file.'
      });
    }
    if(!data.address) {
      return res.failure({
        message: 'Address is required'
      });
    }
    if(!data.city) {
      return res.failure({
        message: 'City is required'
      });
    }
    if(!data.state) {
      return res.failure({
        message: 'State is required'
      });
    }
    if(!data.companyName) {
      return res.failure({
        message: 'Company name is required'
      });
    }
    if(!data.postalCode) {
      return res.failure({
        message: 'Postal code is required'
      });
    }
    if(!data.customDomain) {
      return res.failure({
        message: 'Custom domain is required'
      });
    }
    if(!data.Remarks) {
      return res.failure({
        message: 'Remarks are required'
      });
    }

    // Validate verification token
    if (!data.verificationToken) {
      return res.failure({
        message: 'Verification token is required. Please verify your IP first.'
      });
    }

    // Decrypt and validate the verification token
    try {
      const decodedToken = Buffer.from(data.verificationToken, 'base64').toString('utf-8');
      const encryptedToken = JSON.parse(decodedToken);
      const decryptedToken = decrypt(encryptedToken, key);
      
      if (!decryptedToken) {
        throw new Error('Invalid token format');
      }

      const tokenData = JSON.parse(decryptedToken);
      
      // Check if token is expired (valid for 1 hour)
      const tokenAge = Date.now() - tokenData.timestamp;
      const TOKEN_VALIDITY = 60 * 60 * 1000; // 1 hour in milliseconds
      
      if (tokenAge > TOKEN_VALIDITY) {
        return res.failure({
          message: 'Verification token has expired. Please verify your IP again.'
        });
      }

      // Check if token is verified
      if (!tokenData.verified) {
        return res.failure({
          message: 'Invalid verification token'
        });
      }

      // Check if domain matches
      if (tokenData.domain !== data.customDomain) {
        return res.failure({
          message: 'Domain mismatch. Verification token is for a different domain.'
        });
      }

    } catch (tokenError) {
      console.error('Token validation error:', tokenError);
      return res.failure({
        message: 'Invalid verification token. Please verify your IP again.'
      });
    }
    
    // Check for duplicate phone number
    const existingPhone = await dbService.findOne(model.user, {
      mobileNo: data.MobileNo,
      isDeleted: false
    });
    
    if (existingPhone) {
      return res.failure({
        message: 'Phone number already exists',
        data: {
          mobileNo: data.MobileNo
        }
      });
    }
    
    // Check for duplicate email
    const existingEmail = await dbService.findOne(model.user, {
      email: data.email,
      isDeleted: false
    });
    
    if (existingEmail) {
      return res.failure({
        message: 'Email already exists',
        data: {
          email: data.email
        }
      });
    }
    
    // Check for duplicate domain name
    const existingDomain = await dbService.findOne(model.company, {
      customDomain: data.customDomain,
      isDeleted: false
    });
    
    if (existingDomain) {
      return res.failure({
        message: 'Domain name already exists',
        data: {
          customDomain: data.customDomain
        }
      });
    }
    
    // Check for duplicate company name
    const existingCompany = await dbService.findOne(model.company, {
      companyName: data.companyName,
      isDeleted: false
    });
    
    if (existingCompany) {
      return res.failure({
        message: 'Company name already exists',
        data: {
          companyName: data.companyName
        }
      });
    }
    
    // Check for duplicate PAN number
    // First try direct query (in case PAN is stored as plain text)
    const existingPanCompany = await dbService.findOne(model.company, {
      companyPan: data.PanNumber,
      isDeleted: false
    });
    
    if (existingPanCompany) {
      return res.failure({
        message: 'PAN number already exists',
        data: {
          panNumber: data.PanNumber
        }
      });
    }
    
    // Also check if PAN is stored encrypted by fetching all companies and decrypting
    // This handles the case where PAN might be encrypted in the database
    try {
      const allCompanies = await dbService.findAll(
        model.company,
        { isDeleted: false },
        { attributes: ['id', 'companyPan'] }
      );
      
      for (const company of allCompanies) {
        let decryptedPan = null;
        try {
          // Try to parse as JSON (encrypted format)
          const panData = typeof company.companyPan === 'string' 
            ? JSON.parse(company.companyPan) 
            : company.companyPan;
          
          if (panData && panData.encrypted) {
            // It's encrypted, decrypt it
            decryptedPan = decrypt(panData, key);
          } else {
            // It's plain text
            decryptedPan = company.companyPan;
          }
        } catch (e) {
          // If parsing fails, assume it's plain text
          decryptedPan = company.companyPan;
        }
        
        // Compare with input PAN (case-insensitive)
        if (decryptedPan && decryptedPan.toLowerCase().trim() === data.PanNumber.toLowerCase().trim()) {
          return res.failure({
            message: 'PAN number already exists',
            data: {
              panNumber: data.PanNumber
            }
          });
        }
      }
    } catch (panCheckError) {
      console.error('Error checking duplicate PAN:', panCheckError);
      // Don't fail the entire request if PAN check fails, but log it
    }
    
  const encryptedPanNumber = doubleEncrypt(data.PanNumber, key);

  // Declare panNameFromAPI outside the if block so it's accessible throughout the function
  let panNameFromAPI = null;

  // PAN verification logic
  try {
    // Check if PAN already exists in eKycHub table
    const existingPan = await dbService.findOne(model.ekycHub, {
      identityNumber1: data.PanNumber,
      identityType: 'PAN'
    });

    if (existingPan) {
      // Decrypt the cached response
      let panVerificationResult = null;
      try {
        const encryptedData = JSON.parse(existingPan.response);
        if (encryptedData && encryptedData.encrypted) {
          const decryptedResponse = decrypt(encryptedData, key);
          if (decryptedResponse) {
            panVerificationResult = JSON.parse(decryptedResponse);
          } else {
            panVerificationResult = encryptedData;
          }
        } else {
          panVerificationResult = JSON.parse(existingPan.response);
        }
      } catch (e) {
        // If not encrypted or not JSON, return as is
        panVerificationResult = existingPan.response;
      }
      console.log('panVerificationResult', panVerificationResult);

      // Check if PAN name matches
      if (panVerificationResult && panVerificationResult.status === 'Success') {
        panNameFromAPI = panVerificationResult.registered_name || panVerificationResult.data?.name || panVerificationResult.name;
        if (panNameFromAPI && panNameFromAPI.toLowerCase().trim() === data.PanName.toLowerCase().trim()) {
          // PAN name matches, continue with company creation
          console.log('PAN verification successful - name matches');
        } else {
          // PAN name doesn't match
          return res.failure({
            message: 'PAN name mismatch. Please verify your PAN name.',
            data: {
              providedPanName: data.PanName,
            }
          });
        }
      } else {
        // PAN verification failed
        return res.failure({
          message: 'PAN verification failed. Please fetch PAN verification first.',
          data: {
            panNumber: data.PanNumber,
            status: panVerificationResult?.status || 'Failed'
          }
        });
      }
    } else {
      // PAN not found in eKycHub table
      return res.failure({
        message: 'PAN not found in verification records. Please fetch PAN verification first.',
        data: {
          panNumber: data.PanNumber
        }
      });
    }

  } catch (panError) {
    console.error('PAN verification error:', panError);
    return res.failure({
      message: 'PAN verification failed. Please try again.',
      error: panError.message
    });
  }

  // Handle profile image upload - will be done after user creation to get userId
  let profileImageKey = data.profileImage;

  // Prepare company data
    const companyData = {
      companyName: data.companyName,
      companyPan: data.PanNumber,
      BussinessEntity: data.BussinessEntity,
      fullAddress: data.address,
      city: data.city,
      state: data.state,
      postalCode: data.postalCode,
      customDomain: data.customDomain,
      remark: data.Remarks,
      companyGst: data.companyGst,
      isActive: true
    };

    // Create company first
    const company = await dbService.createOne(model.company, companyData);

    // Generate unique refer code for the company admin user
    const referCode = await generateUniqueReferCode(data.companyName);

    const userData = {
      mobileNo: data.MobileNo,
      email: data.email,
      profileImage: profileImageKey,
      userRole: 2,
      companyId: company.id,
      userType: 1,
      name: panNameFromAPI || data.PanName, 
      fullAddress: data.address,
      city: data.city,
      state: data.state,
      zipcode: data.postalCode,
      referCode: referCode,
      isActive: true,
      companyName: data.companyName, // Pass company name for userId generation (temporary field, not saved to DB)
    };

    let user = await dbService.createOne(model.user, userData);

    // Upload profile image if file is provided (after user creation to get userId)
    if (req.file && !data.profileImage) {
      try {
        // Upload profile image with path pattern: images/{userId}/{companyId}/profile/
        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;
        const uploadResult = await uploadImageToS3(
          fileBuffer,
          fileName,
          'profile',
          company.id, // companyId
          null, // subtype not needed
          user.id // userId for path pattern: images/{userId}/{companyId}/profile/
        );
        profileImageKey = uploadResult.key;
        
        // Update user with profile image
        await dbService.update(model.user, { id: user.id }, { profileImage: profileImageKey });
        // Reload user to get updated profileImage
        user = await dbService.findOne(model.user, { id: user.id });
      } catch (uploadError) {
        console.error('Profile image upload error:', uploadError);
        return res.failure({
          message: 'Failed to upload profile image. Please try again.',
          error: uploadError.message
        });
      }
    }

    // Create wallet for the user
    const walletData = {
      refId: user.id,
      companyId: company.id,
      mainWallet: 0,
      apesWallet: 0,
      roleType: 2
    };

    const wallet = await dbService.createOne(model.wallet, walletData);

    // Generate onboarding token
    const onboardingExpiry = process.env.ON_BOARDING_EXPIRY || '6d';
    const tokenData = generateOnboardingToken({
      userId: user.id,
      name: user.name,
      companyId: company.id,
      userRole: user.userRole
    }, onboardingExpiry);

    // Save onboarding token to database
    const onboardingTokenData = {
      userId: user.id,
      companyId: company.id,
      token: tokenData.token,
      expiresAt: tokenData.expiresAt,
      isUsed: false
    };

    await dbService.createOne(model.onboardingToken, onboardingTokenData);

    // Construct onboarding URL
    const frontendUrl = process.env.FRONTEND_URL || 'https://app.gmaxepay.in';
    const onboardingLink = `${frontendUrl}/onboarding/${tokenData.token}`;

    // Get company logo URL (from company.logo or default)
    let logoUrl = company.logo ? getImageUrl(company.logo) : null;
    if (!logoUrl) {
      // Use default logo from public folder
      const backendUrl = process.env.BASE_URL;
      logoUrl = `${backendUrl}/gmaxepay.png`;
    }

    // Get mail icons URL
    const backendUrl = process.env.BASE_URL;
    const iconUrl = `${backendUrl}/mailicons.png`;

    // Send welcome email with onboarding link
    try {
      await sendWelcomeEmail({
        to: user.email,
        userName: user.name,
        onboardingLink: onboardingLink,
        logoUrl: logoUrl,
        iconUrl: iconUrl,
        expiryTime: tokenData.expiryDisplay
      });
      console.log('Welcome email sent successfully to:', user.email);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail the entire request if email fails, just log it
    }

    return res.success({
      message: 'Company created successfully',
      data: {
        company: companyData,
        user: {
          id: user.id,
          userId: user.userId,
          mobileNo: user.mobileNo,
          email: user.email,
          referCode: user.referCode, // Refer code (already decrypted by model hooks)
          profileImageUrl: user.profileImage ? (() => {
            // For profile images, use simple CDN URL (no secure proxy)
            const cdnUrl = process.env.AWS_CDN_URL || 'https://assets.gmaxepay.in';
            // Extract plain key (already decrypted by model hooks)
            let plainKey = user.profileImage;
            if (typeof plainKey === 'string' && !plainKey.startsWith('images/')) {
              try {
                const { decrypt } = require('../../../utils/encryption');
                plainKey = decrypt(plainKey);
              } catch (e) {
                // If decryption fails, use as is
              }
            }
            return plainKey ? `${cdnUrl}/${plainKey}` : null;
          })() : null
        }
      }
    });
  } catch (error) {
    console.error(error);
    return res.failure({ message: error.message });
  }
};


const getPincodeByCity = async (req, res) => {
  try {
    const { city } = req.body;
    const user = await dbService.findOne(model.user, { id: req.user.id });
    if(!req.user.id){
      return res.failure({ message: 'User is not found required' });
    }
    
    if(!user) return res.failure({ message: 'User is not found' });
    
    if (!city) return res.failure({ message: 'City is required' });
    
    // Fetch pincode using postal pincode service
    const result = await postalPincode.getPincodeByCity(city);
    
    return res.success({ 
      message: 'Pincode fetched successfully', 
      data: result.data 
    });
  } catch (error) {
    console.error(error);
    return res.failure({ message: error.message });
  }
};

const getCityByPincode = async (req, res) => {
  try {
    const { pincode } = req.body;
    
    if (!pincode) return res.failure({ message: 'Pincode is required' });
    
    // Fetch city details using postal pincode service
    const result = await postalPincode.getCityByPincode(pincode);
    
    return res.success({ 
      message: 'City fetched successfully', 
      data: result.data
    });
  } catch (error) {
    console.error(error);
    return res.failure({ message: error.message });
  }
};


const getCompanyById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.failure({ message: 'Company ID is required' });

    const company = await dbService.findOne(model.company, { id });
    if (!company) return res.failure({ message: 'Company not found' });

    // Convert to JSON and add image URLs
    const companyData = company.toJSON();
    if (companyData.logo) {
      companyData.logoUrl = getImageUrl(companyData.logo);
    }
    if (companyData.favicon) {
      companyData.faviconUrl = getImageUrl(companyData.favicon);
    }

    return res.success({
      message: 'Company fetched successfully',
      data: companyData
    });
  } catch (error) {
    console.error(error);
    return res.failure({ message: error.message });
  }
};

const getAllCompanies = async (req, res) => {
  try {
    let dataToFind = req.body;
    let query = {};
    let options = {};

    if (dataToFind && dataToFind.query) {
      query = { ...query, ...dataToFind.query };
    }

    // Count-only response
    if (dataToFind?.isCountOnly) {
      const count = await dbService.count(model.company, query);
      if (!count) return res.recordNotFound();
      return res.success({ data: { totalRecords: count } });
    }

    if (dataToFind?.options !== undefined) {
      options = dataToFind.options;
    }

    if (dataToFind?.customSearch) {
      const keys = Object.keys(dataToFind.customSearch);
      const orConditions = [];

      keys.forEach((key) => {
        if (typeof dataToFind.customSearch[key] === 'number') {
          orConditions.push(
            where(cast(col(key), 'varchar'), {
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
        query[Op.or] = orConditions;
      }
    }

    const foundCompanies = await dbService.findAll(
      model.company,
      query,
      options
    );
    console.log('Found Companies:', foundCompanies);
    if (!foundCompanies || foundCompanies.length === 0) {
      return res.recordNotFound({ message: 'No companies found.' });
    }

    // Add image URLs to all companies
    const companiesWithUrls = foundCompanies.map(company => {
      const companyData = company.toJSON();
      if (companyData.logo) {
        companyData.logoUrl = getImageUrl(companyData.logo);
      }
      if (companyData.favicon) {
        companyData.faviconUrl = getImageUrl(companyData.favicon);
      }
      return companyData;
    });

    return res.success({
      message: 'Companies fetched successfully!',
      data: companiesWithUrls
    });
  } catch (error) {
    console.error(error);
    return res.failure({ message: error.message });
  }
};

const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    let updateData = req.body;
    
    // Only allow specific fields to be updated
    const allowedFields = [
      'primaryColor',
      'secondaryColor',
      'singupPageDesign',
      'navigationBar',
      'supportPhoneNumbers',
      'customerSupportEmail',
      'companyName',
      'companyPan',
      'companyGst',
      'contactName',
      'contactEmail',
      'mobileNo',
      'BussinessEntity',
      'billingAddress',
      'shippingAddress',
      'modulesEnabled',
      'remark'
    ];
    
    // Filter only allowed fields
    const filteredData = {};
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    });
    
    // Handle modulesEnabled array parsing
    if (
      filteredData.modulesEnabled &&
      typeof filteredData.modulesEnabled === 'string'
    ) {
      filteredData.modulesEnabled = JSON.parse(
        filteredData.modulesEnabled.replace(/'/g, '"')
      );
    }
    
    // Handle supportPhoneNumbers array parsing
    if (
      filteredData.supportPhoneNumbers &&
      typeof filteredData.supportPhoneNumbers === 'string'
    ) {
      try {
        filteredData.supportPhoneNumbers = JSON.parse(filteredData.supportPhoneNumbers);
      } catch (e) {
        // If it's not JSON, split by comma
        filteredData.supportPhoneNumbers = filteredData.supportPhoneNumbers.split(',').map(s => s.trim());
      }
    }
    
    const company = await dbService.findOne(model.company, { id });
    if (!company) return res.failure({ message: 'Company not found' });
    
    const updated = await dbService.update(model.company, { id }, filteredData);
    
    // Fetch updated company to return with image URLs
    const updatedCompany = await dbService.findOne(model.company, { id });
    const companyData = updatedCompany.toJSON();
    if (companyData.logo) {
      companyData.logoUrl = getImageUrl(companyData.logo);
    }
    if (companyData.favicon) {
      companyData.faviconUrl = getImageUrl(companyData.favicon);
    }
    
    return res.success({
      message: 'Company updated successfully',
      data: companyData
    });
  } catch (error) {
    console.error(error);
    return res.failure({ message: error.message });
  }
};

const updateCompanyLogoAndFavicon = async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body; // 'logo' or 'favicon'
    
    if (!req.file) {
      return res.failure({ message: 'Image file is required' });
    }
    
    if (!type || !['logo', 'favicon'].includes(type)) {
      return res.failure({ message: 'Type must be either "logo" or "favicon"' });
    }
    
    const company = await dbService.findOne(model.company, { id });
    if (!company) return res.failure({ message: 'Company not found' });
    
    // Upload new image to S3
    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;
    const uploadResult = await uploadImageToS3(
      fileBuffer,
      fileName,
      'company',
      id,
      type
    );
    
    // Delete old image from S3 if exists
    const oldImageKey = type === 'logo' ? company.logo : company.favicon;
    if (oldImageKey) {
      try {
        await deleteImageFromS3(oldImageKey);
      } catch (error) {
        console.error(`Error deleting old ${type}:`, error);
        // Continue even if deletion fails
      }
    }
    
    // Update company with new image
    const updateData = {
      [type]: uploadResult.key
    };
    
    const updated = await dbService.update(model.company, { id }, updateData);
    
    return res.success({
      message: `${type.charAt(0).toUpperCase() + type.slice(1)} updated successfully`,
      data: {
        ...updated.toJSON(),
        [`${type}Url`]: getImageUrl(uploadResult.key)
      }
    });
  } catch (error) {
    console.error(error);
    return res.failure({ message: error.message });
  }
};

const uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.failure({ message: 'Image file is required' });
    }
    
    // Get user and company info for path pattern
    const { userId, companyId } = req.body;
    if (!userId || !companyId) {
      return res.failure({ message: 'userId and companyId are required' });
    }
    
    // Upload image to S3 with path pattern: images/{userId}/{companyId}/profile/
    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;
    const uploadResult = await uploadImageToS3(
      fileBuffer,
      fileName,
      'profile',
      companyId, // companyId
      null, // subtype not needed
      userId // userId for path pattern: images/{userId}/{companyId}/profile/
    );
    
    // Return simple CDN URL (no secure proxy for profile images)
    const cdnUrl = process.env.AWS_CDN_URL || 'https://assets.gmaxepay.in';
    const profileImageUrl = `${cdnUrl}/${uploadResult.key}`;
    
    return res.success({
      message: 'Profile image uploaded successfully',
      data: {
        profileImage: uploadResult.key,
        profileImageUrl: profileImageUrl
      }
    });
  } catch (error) {
    console.error(error);
    return res.failure({ message: error.message });
  }
};

const deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;

    const company = await dbService.findOne(model.company, { id });
    if (!company) return res.failure({ message: 'Company not found' });

    await dbService.destroy(model.company, { id });
    return res.success({
      message: 'Company deleted successfully',
      data: company
    });
  } catch (error) {
    console.error(error);
    return res.failure({ message: error.message });
  }
};


const getIpCheck = async (req, res)=>{
  try{
    const { domain } = req.body;
    
    if (!domain) {
      return res.failure({
        message: 'Domain is required'
      });
    }

    // Use the helper function to check IP
    try {
      const ipCheckResult = await checkDomainIP(domain);
      
      // Store IP info in database
      for (const ip of ipCheckResult.matchedIPs) {
        const existingIp = await dbService.findOne(model.ipInfo, {
          ipAddress: ip,
          ipType: 'WHITELIST'
        });

        if (!existingIp) {
          await dbService.createOne(model.ipInfo, {
            ipAddress: ip,
            ipType: 'WHITELIST'
          });
        }
      }

      // Generate verification token with encrypted data
      const tokenData = {
        domain: domain,
        timestamp: Date.now(),
        verified: true
      };

      // Encrypt the token
      const encryptedToken = doubleEncrypt(JSON.stringify(tokenData), key);

      // Convert encrypted token object to string for easier handling
      const verificationToken = Buffer.from(JSON.stringify(encryptedToken)).toString('base64');

      return res.success({
        message: 'IP verified successfully',
        data: {
          domain: domain,
          status: 'VERIFIED',
          verificationToken: verificationToken
        }
      });
    } catch (ipError) {
      return res.failure({
        message: 'IP verification failed - please check your IP',
        data: {
          domain: domain,
          status: 'FAILED'
        }
      });
    }
  } catch(error){
    console.error('IP check error:', error);
    return res.failure({
      message: error.message || 'IP verification failed'
    });
  }
}

const testCompletedAddress = async (req, res) => {
  try {
    const { ip, latitude, longitude } = req.body || {};
    if (!ip || !latitude || !longitude) {
      return res.failure({ message: 'IP, latitude and longitude are required' });
    }

    // Use Google Maps service for reverse geocoding
    const addressData = await googleMap.reverseGeocode(latitude, longitude);

    // Add IP and address field to response
    const response = {
      ...addressData,
      address: addressData.complete_address || addressData.formatted_address,
      ip: ip
    };

    return res.success({ 
      message: 'Complete address retrieved successfully', 
      data: response 
    });
  } catch (error) {
    console.error('Error in test completed address:', error);
    return res.failure({ 
      message: error.message || 'Failed to get complete address', 
      error: error.response?.data?.error_message || error.message 
    });
  }
}

const testMappplesMap = async (req, res) => {
  try {
    const { ip, latitude, longitude } = req.body;
    if (!ip || !latitude || !longitude) {
      return res.failure({ message: 'IP, latitude and longitude are required' });
    }

    // Use Mappls service for reverse geocoding
    const addressData = await mapplesMap.reverseGeocode(latitude, longitude);

    // Add IP and address field to response
    const response = {
      ...addressData,
      address: addressData.complete_address || addressData.formatted_address,
      ip: ip
    };

    return res.success({ 
      message: 'Complete address retrieved successfully from Mappls', 
      data: response 
    });
  } catch (error) {
    console.error('Error in test mappples modules:', error);
    return res.failure({ 
      message: error.message || 'Failed to get complete address from Mappls', 
      error: error.response?.data?.error_message || error.message 
    });
  }
}

// Deactivate an onboarding token by token string
const deactivateOnboarding = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.failure({ message: 'Token is required' });
    }

    const existing = await dbService.findOne(model.onboardingToken, {
      token: token
    });

    if (!existing) {
      return res.failure({ message: 'Onboarding token not found' });
    }

    if (existing.isUsed) {
      return res.failure({ message: 'Onboarding link is already deactivated' });
    }

    await dbService.update(
      model.onboardingToken,
      { id: existing.id },
      { isDeactivated: true, isUsed: true, usedAt: new Date() }
    );

    return res.success({ message: 'Onboarding link deactivated successfully' });
  } catch (error) {
    console.error('deactivateOnboarding error:', error);
    return res.failure({ message: error.message || 'Failed to deactivate onboarding link' });
  }
};

// Resend onboarding link for a company (generates a new token and emails it)
const resendOnboardingLink = async (req, res) => {
  try {
    const { companyid } = req.params;
    if (!companyid) {
      return res.failure({ message: 'Company ID is required' });
    }

    const company = await dbService.findOne(model.company, { id: companyid });
    if (!company) {
      return res.failure({ message: 'Company not found' });
    }

    // Find primary admin user for the company (role 2)
    const user = await dbService.findOne(model.user, {
      companyId: company.id,
      userRole: 2,
      isDeleted: false
    });

    console.log('user', user);

    if (!user) {
      return res.failure({ message: 'Primary user not found for this company' });
    }

    // Deactivate any existing active tokens for this user/company
    try {
      const existingActive = await dbService.findAll(
        model.onboardingToken,
        { userId: user.id, companyId: company.id, isUsed: false },
        {}
      );
      if (Array.isArray(existingActive)) {
        for (const t of existingActive) {
          await dbService.update(
            model.onboardingToken,
            { id: t.id },
            { isUsed: true, usedAt: new Date() }
          );
        }
      }
    } catch (ignore) {
      // best effort; continue even if listing/updating old tokens fails
    }

    // Generate a fresh token
    const onboardingExpiry = process.env.ON_BOARDING_EXPIRY || '6d';
    const tokenData = generateOnboardingToken({
      userId: user.id,
      name: user.name,
      companyId: company.id,
      userRole: user.userRole
    }, onboardingExpiry);

    // Save the new token
    await dbService.createOne(model.onboardingToken, {
      userId: user.id,
      companyId: company.id,
      token: tokenData.token,
      expiresAt: tokenData.expiresAt,
      isUsed: false
    });

    // Build URLs for email
    const frontendUrl = process.env.FRONTEND_URL || 'https://app.gmaxepay.in';
    const onboardingLink = `${frontendUrl}/onboarding/${tokenData.token}`;

    let logoUrl = company.logo ? getImageUrl(company.logo) : null;
    if (!logoUrl) {
      const backendUrl = process.env.BASE_URL;
      logoUrl = `${backendUrl}/gmaxepay.png`;
    }
    const backendUrl = process.env.BASE_URL;
    const iconUrl = `${backendUrl}/mailicons.png`;

    // Send email
    try {
      await sendWelcomeEmail({
        to: user.email,
        userName: user.name,
        onboardingLink: onboardingLink,
        logoUrl: logoUrl,
        iconUrl: iconUrl,
        expiryTime: tokenData.expiryDisplay
      });
    } catch (emailError) {
      console.error('Failed to send onboarding email:', emailError);
      // proceed; email failure shouldn't block token generation
    }

    return res.success({
      message: 'Onboarding link resent successfully',
      data: {
        onboardingLink,
        expiresAt: tokenData.expiresAt,
        expiryDisplay: tokenData.expiryDisplay
      }
    });
  } catch (error) {
    console.error('resendOnboardingLink error:', error);
    return res.failure({ message: error.message || 'Failed to resend onboarding link' });
  }
};


module.exports = {
  createCompany,
  getCompanyById,
  getAllCompanies,
  updateCompany,
  updateCompanyLogoAndFavicon,
  uploadProfileImage,
  deleteCompany,
  getPincodeByCity,
  getCityByPincode,
  getIpCheck,
  testCompletedAddress,
  testMappplesMap,
  deactivateOnboarding,
  resendOnboardingLink
};
