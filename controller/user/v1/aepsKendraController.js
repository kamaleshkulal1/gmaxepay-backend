const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const { kendraAepsOnboarding } = require('../../../services/kendraService');

const createAepsKendra = async (req, res) => {
    try {
        const userId = req.user.id;
        const companyId = req.user.companyId;
        const existingUser = await dbService.findOne(model.user, { id: userId, companyId: companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const customer = await dbService.findOne(model.customer, { refId: userId, companyId: companyId });
        if (!customer) {
            return res.failure({ message: 'Customer not found' });
        }
        const customerBank = await dbService.findOne(model.customerBank, { refId: customer.id, companyId: companyId });
        if (!customerBank) {
            return res.failure({ message: 'Customer bank not found' });
        }
        const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, { userId: userId, companyId: companyId });
        if (!existingAepsOnboarding) {
            return res.failure({ message: 'Aeps onboarding not found' });
        }
        if(existingAepsOnboarding.onboardingStatus !== 'COMPLETED') {
            return res.failure({ message: 'Aeps onboarding not completed' });
        }
        const {
            merchantLoginId,
            merchantFirstName,
            merchantPhoneNumber,
            companyLegalName,
            emailId,
            merchantPinCode,
            merchantCityName,
            merchantDistrictName,
            merchantState,
            merchantAddress,
            userPan,
            aadhaarNumber,
            companyBankAccountNumber,
            bankIfscCode,
            companyBankName,
            bankAccountName,
            bankBranchName,
            c_code,
            shopAddress,
            shopCity,
            shopDistrict,
            shopState,
            shopPincode,
            latitude,
            longitude,
            maskedAadharImage,
            backgroundImageOfShop,
            merchantPanImage
        } = req.body;

        // Validate required fields
        if (!merchantLoginId) {
            return res.validationError({ message: 'merchantLoginId is required' });
        }

        if (!merchantAddress || merchantAddress.length < 11) {
            return res.validationError({ message: 'merchantAddress is required and must be at least 11 characters' });
        }

        if (!shopAddress || shopAddress.length < 11) {
            return res.validationError({ message: 'shopAddress is required and must be at least 11 characters' });
        }

        // Generate timestamps
        const now = Math.floor(Date.now() / 1000);
        const iat = now;
        const nbf = now;
        const exp = now + 3600; // 1 hour expiry

        // Call Kendra API
        const kendraResponse = await kendraAepsOnboarding({
            merchantLoginId,
            merchantFirstName,
            merchantPhoneNumber,
            companyLegalName,
            emailId,
            merchantPinCode,
            merchantCityName,
            merchantDistrictName,
            merchantState,
            merchantAddress,
            userPan,
            aadhaarNumber,
            companyBankAccountNumber,
            bankIfscCode,
            companyBankName,
            bankAccountName,
            bankBranchName,
            c_code,
            shopAddress,
            shopCity,
            shopDistrict,
            shopState,
            shopPincode,
            latitude,
            longitude,
            maskedAadharImage,
            backgroundImageOfShop,
            merchantPanImage,
            iat,
            nbf,
            exp
        });

        // Store or update Kendra onboarding record
        const onboardingData = {
            userId: userId,
            companyId: companyId,
            status: kendraResponse.status || false,
            message: kendraResponse.message || null,
            merchantLoginId: kendraResponse.merchantLoginId || merchantLoginId,
            merchantLoginPin: kendraResponse.merchantLoginPin || null,
            onboardingStatus: kendraResponse.status ? 'COMPLETED' : 'FAILED',
            apiResponse: kendraResponse,
            addedBy: userId,
            updatedBy: userId
        };

        // Check if record exists
        const existingKendraOnboarding = await dbService.findOne(
            model.kendraAepsOnboarding,
            { userId: userId, companyId: companyId }
        );

        let kendraOnboardingRecord;
        if (existingKendraOnboarding) {
            // Update existing record
            await dbService.update(
                model.kendraAepsOnboarding,
                { userId: userId, companyId: companyId },
                onboardingData
            );
            kendraOnboardingRecord = await dbService.findOne(
                model.kendraAepsOnboarding,
                { userId: userId, companyId: companyId }
            );
        } else {
            // Create new record
            kendraOnboardingRecord = await dbService.createOne(
                model.kendraAepsOnboarding,
                onboardingData
            );
        }

        if (!kendraResponse.status) {
            return res.failure({ 
                message: kendraResponse.message || 'Kendra onboarding failed',
                data: kendraResponse
            });
        }

        return res.success({
            message: 'Kendra AEPS onboarding successful',
            data: {
                status: kendraResponse.status,
                message: kendraResponse.message,
                merchantLoginId: kendraResponse.merchantLoginId,
                merchantLoginPin: kendraResponse.merchantLoginPin,
                onboardingRecord: kendraOnboardingRecord
            }
        });

    } catch (error) {
        console.log('Kendra AEPS onboarding error:', error);
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

/**
 * Get Kendra AEPS Onboarding Status
 * GET /api/v1/user/aeps-kendra/onboarding-status
 * Returns stored onboarding data: status, message, merchantLoginId, merchantLoginPin
 */
const getAepsKendraOnboarding = async (req, res) => {
    try {
        const userId = req.user.id;
        const companyId = req.user.companyId;

        const kendraOnboarding = await dbService.findOne(
            model.kendraAepsOnboarding,
            { userId: userId, companyId: companyId }
        );

        if (!kendraOnboarding) {
            return res.notFound({ message: 'Kendra AEPS onboarding not found' });
        }

        // Return data in the same format as Kendra API response
        return res.success({
            message: 'Kendra AEPS onboarding status retrieved successfully',
            data: {
                status: kendraOnboarding.status,
                message: kendraOnboarding.message || null,
                merchantLoginId: kendraOnboarding.merchantLoginId || null,
                merchantLoginPin: kendraOnboarding.merchantLoginPin || null,
                onboardingStatus: kendraOnboarding.onboardingStatus,
                createdAt: kendraOnboarding.createdAt,
                updatedAt: kendraOnboarding.updatedAt
            }
        });

    } catch (error) {
        console.log('Get Kendra AEPS onboarding error:', error);
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

module.exports = {
    createAepsKendra,
    getAepsKendraOnboarding
};
