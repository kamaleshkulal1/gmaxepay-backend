const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const { decryptOnboardingToken } = require('../../../utils/onboardingToken');

/**
 * Verify onboarding token and return user details
 * @route GET /company/onboarding/:token
 */
const verifyOnboardingLink = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.failure({
        message: 'Onboarding token is required'
      });
    }

    // Check if token exists in database
    const tokenRecord = await dbService.findOne(model.onboardingToken, {
      token: token,
      isDeleted: false
    });

    if (!tokenRecord) {
      return res.failure({
        message: 'Invalid or expired onboarding link'
      });
    }

    // Check if token is already used
    if (tokenRecord.isUsed) {
      return res.failure({
        message: 'This onboarding link has already been used'
      });
    }

    // Check if token is expired
    if (new Date() > tokenRecord.expiresAt) {
      return res.failure({
        message: 'This onboarding link has expired'
      });
    }

    // Decrypt token to get user details
    const userData = decryptOnboardingToken(token);
    
    if (!userData) {
      return res.failure({
        message: 'Invalid or corrupted onboarding token'
      });
    }

    // Verify token matches the database record
    if (userData.userId !== tokenRecord.userId || userData.companyId !== tokenRecord.companyId) {
      return res.failure({
        message: 'Token validation failed'
      });
    }

    // Get user details
    const user = await dbService.findOne(model.user, {
      id: userData.userId,
      isDeleted: false
    });

    if (!user) {
      return res.failure({
        message: 'User not found'
      });
    }

    // Check onboarding status
    // You can customize this based on your business logic
    // For example, check signupStep or any other field
    const isOnboardingCompleted = user.signupStep >= 5; // Adjust based on your logic
    
    // Get company details
    const company = await dbService.findOne(model.company, {
      id: userData.companyId,
      isDeleted: false
    });

    if (!company) {
      return res.failure({
        message: 'Company not found'
      });
    }

    // Return user details
    return res.success({
      message: isOnboardingCompleted ? 'Onboarding is completed' : 'Onboarding is pending',
      data: {
        userId: userData.userId,
        name: userData.name,
        companyId: userData.companyId,
        mobileNo: userData.mobileNo,
        userRole: userData.userRole,
        email: user.email,
        isOnboardingCompleted: isOnboardingCompleted,
        signupStep: user.signupStep,
        companyName: company.companyName,
        companyLogo: company.logo,
        message: isOnboardingCompleted 
          ? 'Onboarding is completed. Please proceed to login.' 
          : 'Please complete your eKYC to finish onboarding.'
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
    const { token } = req.params;

    if (!token) {
      return res.failure({
        message: 'Onboarding token is required'
      });
    }

    // Find token record
    const tokenRecord = await dbService.findOne(model.onboardingToken, {
      token: token,
      isDeleted: false
    });

    if (!tokenRecord) {
      return res.failure({
        message: 'Invalid onboarding token'
      });
    }

    if (tokenRecord.isUsed) {
      return res.failure({
        message: 'This onboarding link has already been used'
      });
    }

    // Mark token as used
    await dbService.update(
      model.onboardingToken,
      { id: tokenRecord.id },
      { 
        isUsed: true,
        usedAt: new Date()
      }
    );

    return res.success({
      message: 'Onboarding token marked as completed'
    });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    return res.failure({
      message: 'Failed to complete onboarding',
      error: error.message
    });
  }
};

module.exports = {
  verifyOnboardingLink,
  completeOnboarding
};

