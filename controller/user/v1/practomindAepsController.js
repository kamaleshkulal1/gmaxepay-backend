const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const practomindService = require('../../../services/practomindService');
const aepsDailyLoginService = require('../../../services/aepsDailyLoginService');
const { generateTransactionID } = require('../../../utils/transactionID');
const { Op } = require('sequelize');

/**
 * Get Practomind AEPS Onboarding Status
 * @route POST /api/user/aeps2/onboarding-status
 */
const getPractomindAepsOnboardingStatus = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { 
            id: req.user.id, 
            companyId: req.user.companyId 
        });
        
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        const existingPractomindAepsOnboarding = await dbService.findOne(model.practomindAepsOnboarding, {
            userId: existingUser.id,
            companyId: existingUser.companyId
        });

        // Daily 2FA status (IST date based)
        await aepsDailyLoginService.logoutPreviousDaySessions(req.user.id, req.user.companyId);
        const todayDateStr = aepsDailyLoginService.getIndianDateOnly();
        
        const existingDaily2FA = await dbService.findOne(model.practomindAepsDailyLogin, {
            refId: req.user.id,
            companyId: req.user.companyId,
            loginDate: todayDateStr,
            isLoggedIn: true
        });
        
        const isDaily2FACompleted = Boolean(existingDaily2FA);
        const nextEligibleAt = aepsDailyLoginService.getNextMidnightIST();

        // Handle case when onboarding doesn't exist yet (pending)
        if (!existingPractomindAepsOnboarding) {
            const statusData = {
                onboardingStatus: 'PENDING',
                aepsOnboarding: {
                    status: 'pending',
                    isCompleted: false
                },
                ekycOtp: {
                    status: 'pending',
                    isCompleted: false
                },
                ekycBiometric: {
                    status: 'pending',
                    isCompleted: false
                },
                daily2FAAuthentication: {
                    status: isDaily2FACompleted ? 'completed' : 'pending',
                    isCompleted: isDaily2FACompleted,
                    loginDate: todayDateStr,
                    nextEligibleAt: nextEligibleAt ? nextEligibleAt.toISOString() : null
                }
            };
            return res.success({ message: 'Practomind AEPS onboarding status', data: statusData });
        }

        const isOnboardingComplete = existingPractomindAepsOnboarding.onboardingStatus === 'COMPLETED';
        const isOtpValidated = Boolean(existingPractomindAepsOnboarding.isOtpValidated);
        const isBioMetricValidated = Boolean(existingPractomindAepsOnboarding.isBioMetricValidated);

        const isAllCompleted = isOnboardingComplete && isOtpValidated && isBioMetricValidated;
        const overallStatus = isAllCompleted ? 'COMPLETED' : 'PENDING';

        // Update onboardingStatus in database if it needs to be updated
        if (existingPractomindAepsOnboarding.onboardingStatus !== overallStatus) {
            await dbService.update(
                model.practomindAepsOnboarding,
                { id: existingPractomindAepsOnboarding.id },
                { onboardingStatus: overallStatus }
            );
        }

        const statusData = {
            ...existingPractomindAepsOnboarding.toJSON ? existingPractomindAepsOnboarding.toJSON() : existingPractomindAepsOnboarding,
            onboardingStatus: overallStatus,
            aepsOnboarding: {
                status: isOnboardingComplete ? 'completed' : 'pending',
                isCompleted: isOnboardingComplete
            },
            ekycOtp: {
                status: isOtpValidated ? 'completed' : 'pending',
                isCompleted: isOtpValidated
            },
            ekycBiometric: {
                status: isBioMetricValidated ? 'completed' : 'pending',
                isCompleted: isBioMetricValidated
            },
            daily2FAAuthentication: {
                status: isDaily2FACompleted ? 'completed' : 'pending',
                isCompleted: isDaily2FACompleted,
                loginDate: todayDateStr,
                nextEligibleAt: nextEligibleAt ? nextEligibleAt.toISOString() : null
            }
        };

        return res.success({ message: 'Practomind AEPS onboarding status', data: statusData });
    } catch (err) {
        console.error('Get Practomind AEPS onboarding status error:', err);
        return res.failure({ message: err.message || 'Failed to get onboarding status' });
    }
};

/**
 * Create Practomind AEPS Onboarding
 * @route POST /api/user/aeps2/onboarding
 */
const createPractomindAepsOnboarding = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { 
            id: req.user.id, 
            companyId: req.user.companyId 
        });
        
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        // Check if onboarding already exists
        const existingOnboarding = await dbService.findOne(model.practomindAepsOnboarding, { 
            userId: existingUser.id, 
            companyId: existingUser.companyId 
        });

        if (existingOnboarding && existingOnboarding.onboardingStatus === 'COMPLETED') {
            return res.failure({ message: 'Practomind AEPS onboarding already completed' });
        }

        // Generate unique merchant login ID
        const merchantLoginId = generateTransactionID(existingUser.mobileNo || 'PRACTOMIND');

        // Prepare onboarding data
        const onboardingData = {
            merchantLoginId: merchantLoginId,
            merchantFirstName: req.body.merchantFirstName || existingUser.firstName,
            merchantPhoneNumber: req.body.merchantPhoneNumber || existingUser.mobileNo,
            companyLegalName: req.body.companyLegalName,
            emailId: req.body.emailId || existingUser.email,
            merchantPinCode: req.body.merchantPinCode,
            merchantCityName: req.body.merchantCityName,
            merchantDistrictName: req.body.merchantDistrictName,
            merchantState: req.body.merchantState,
            merchantAddress: req.body.merchantAddress,
            userPan: req.body.userPan,
            aadhaarNumber: req.body.aadhaarNumber,
            companyBankAccountNumber: req.body.companyBankAccountNumber,
            bankIfscCode: req.body.bankIfscCode,
            companyBankName: req.body.companyBankName,
            bankAccountName: req.body.bankAccountName,
            bankBranchName: req.body.bankBranchName,
            c_code: req.body.c_code,
            shopAddress: req.body.shopAddress,
            shopCity: req.body.shopCity,
            shopDistrict: req.body.shopDistrict,
            shopState: req.body.shopState,
            shopPincode: req.body.shopPincode,
            latitude: req.body.latitude,
            longitude: req.body.longitude,
            maskedAadharImage: req.body.maskedAadharImage,
            backgroundImageOfShop: req.body.backgroundImageOfShop,
            merchantPanImage: req.body.merchantPanImage
        };

        // Call Practomind API
        const response = await practomindService.practomindAepsOnboarding(onboardingData);

        // Parse response
        const isSuccess = response.status === true || response.status === 'true';
        const dbData = {
            userId: existingUser.id,
            companyId: existingUser.companyId,
            merchantLoginId: response.merchantLoginId || merchantLoginId,
            merchantLoginPin: response.merchantLoginPin,
            merchantPhoneNumber: onboardingData.merchantPhoneNumber,
            aadhaarNumber: onboardingData.aadhaarNumber,
            userPan: onboardingData.userPan,
            onboardingStatus: isSuccess ? 'COMPLETED' : 'PENDING',
            status: response.status ? 'success' : 'failed',
            message: response.message,
            errorMessage: isSuccess ? null : JSON.stringify(response)
        };

        // Update or create onboarding record
        if (existingOnboarding) {
            await dbService.update(
                model.practomindAepsOnboarding,
                { id: existingOnboarding.id },
                dbData
            );
        } else {
            await dbService.createOne(model.practomindAepsOnboarding, dbData);
        }

        if (isSuccess) {
            return res.success({ 
                message: 'Practomind AEPS onboarding successful', 
                data: response 
            });
        } else {
            return res.failure({ 
                message: response.message || 'Practomind AEPS onboarding failed', 
                data: response 
            });
        }
    } catch (err) {
        console.error('Create Practomind AEPS onboarding error:', err);
        return res.failure({ message: err.message || 'Failed to create onboarding' });
    }
};

/**
 * Send EKYC OTP
 * @route POST /api/user/aeps2/send-ekyc-otp
 */
const sendEkycOtp = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { 
            id: req.user.id, 
            companyId: req.user.companyId 
        });
        
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        const existingOnboarding = await dbService.findOne(model.practomindAepsOnboarding, { 
            userId: existingUser.id, 
            companyId: existingUser.companyId 
        });

        if (!existingOnboarding || existingOnboarding.onboardingStatus !== 'COMPLETED') {
            return res.failure({ message: 'Please complete onboarding first' });
        }

        // Prepare OTP data
        const otpData = {
            merchantPhoneNumber: existingOnboarding.merchantPhoneNumber || existingUser.mobileNo,
            panNumber: existingOnboarding.userPan || req.body.panNumber,
            aadhaarNumber: existingOnboarding.aadhaarNumber || req.body.aadhaarNumber,
            latitude: req.body.latitude,
            longitude: req.body.longitude,
            merchantLoginId: existingOnboarding.merchantLoginId
        };

        // Call Practomind API
        const response = await practomindService.practomindSendEkycOtp(otpData);

        // Parse response
        const isSuccess = response.status === true || response.status === 'true';

        if (isSuccess && response.result) {
            // Update onboarding record with OTP details
            await dbService.update(
                model.practomindAepsOnboarding,
                { id: existingOnboarding.id },
                {
                    KeyID: response.result.KeyID,
                    TxnId: response.result.TxnId,
                    isOtpSent: true,
                    status: 'otp_sent',
                    message: response.message
                }
            );

            return res.success({ 
                message: response.message || 'OTP sent successfully', 
                data: response.result 
            });
        } else {
            return res.failure({ 
                message: response.message || 'Failed to send OTP', 
                data: response 
            });
        }
    } catch (err) {
        console.error('Send EKYC OTP error:', err);
        return res.failure({ message: err.message || 'Failed to send OTP' });
    }
};

/**
 * Validate EKYC OTP
 * @route POST /api/user/aeps2/validate-ekyc-otp
 */
const validateEkycOtp = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { 
            id: req.user.id, 
            companyId: req.user.companyId 
        });
        
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        const existingOnboarding = await dbService.findOne(model.practomindAepsOnboarding, { 
            userId: existingUser.id, 
            companyId: existingUser.companyId 
        });

        if (!existingOnboarding || !existingOnboarding.isOtpSent) {
            return res.failure({ message: 'Please send OTP first' });
        }

        // Prepare validation data
        const validationData = {
            merchantPhoneNumber: existingOnboarding.merchantPhoneNumber || existingUser.mobileNo,
            merchantLoginId: existingOnboarding.merchantLoginId,
            KeyID: existingOnboarding.KeyID,
            TxnId: existingOnboarding.TxnId
        };

        // Call Practomind API
        const response = await practomindService.practomindValidateEkycOtp(validationData);

        // Parse response
        const isSuccess = response.status === true || response.status === 'true';

        if (isSuccess) {
            // Update onboarding record
            await dbService.update(
                model.practomindAepsOnboarding,
                { id: existingOnboarding.id },
                {
                    primaryKeyId: response.primaryKeyId,
                    encodeFPTxnId: response.encodeFPTxnId,
                    isOtpValidated: true,
                    status: 'otp_validated',
                    message: response.message
                }
            );

            return res.success({ 
                message: response.message || 'OTP validated successfully', 
                data: response 
            });
        } else {
            return res.failure({ 
                message: response.message || 'OTP validation failed', 
                data: response 
            });
        }
    } catch (err) {
        console.error('Validate EKYC OTP error:', err);
        return res.failure({ message: err.message || 'Failed to validate OTP' });
    }
};

/**
 * Resend EKYC OTP
 * @route POST /api/user/aeps2/resend-ekyc-otp
 */
const resendEkycOtp = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { 
            id: req.user.id, 
            companyId: req.user.companyId 
        });
        
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        const existingOnboarding = await dbService.findOne(model.practomindAepsOnboarding, { 
            userId: existingUser.id, 
            companyId: existingUser.companyId 
        });

        if (!existingOnboarding || !existingOnboarding.isOtpSent) {
            return res.failure({ message: 'Please send OTP first' });
        }

        // Prepare resend data
        const resendData = {
            merchantPhoneNumber: existingOnboarding.merchantPhoneNumber || existingUser.mobileNo,
            merchantLoginId: existingOnboarding.merchantLoginId,
            KeyID: existingOnboarding.KeyID,
            TxnId: existingOnboarding.TxnId,
            latitude: req.body.latitude,
            longitude: req.body.longitude
        };

        // Call Practomind API
        const response = await practomindService.practomindResendEkycOtp(resendData);

        // Parse response
        const isSuccess = response.status === true || response.status === 'true';

        if (isSuccess) {
            return res.success({ 
                message: response.message || 'OTP resent successfully', 
                data: response 
            });
        } else {
            return res.failure({ 
                message: response.message || 'Failed to resend OTP', 
                data: response 
            });
        }
    } catch (err) {
        console.error('Resend EKYC OTP error:', err);
        return res.failure({ message: err.message || 'Failed to resend OTP' });
    }
};

/**
 * EKYC Submit (Biometric verification)
 * @route POST /api/user/aeps2/ekyc-submit
 */
const ekycSubmit = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { 
            id: req.user.id, 
            companyId: req.user.companyId 
        });
        
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        const existingOnboarding = await dbService.findOne(model.practomindAepsOnboarding, { 
            userId: existingUser.id, 
            companyId: existingUser.companyId 
        });

        if (!existingOnboarding || !existingOnboarding.isOtpValidated) {
            return res.failure({ message: 'Please validate OTP first' });
        }

        if (!req.body.txtPidData) {
            return res.failure({ message: 'Fingerprint data is required' });
        }

        // Prepare EKYC data
        const ekycData = {
            merchantPhoneNumber: existingOnboarding.merchantPhoneNumber || existingUser.mobileNo,
            merchantLoginId: existingOnboarding.merchantLoginId,
            KeyID: existingOnboarding.KeyID,
            TxnId: existingOnboarding.TxnId,
            userPan: existingOnboarding.userPan,
            aadhaarNumber: existingOnboarding.aadhaarNumber,
            txtPidData: req.body.txtPidData
        };

        // Call Practomind API
        const response = await practomindService.practomindEkycSubmit(ekycData);

        // Parse response
        const isSuccess = response.status === true || response.status === 'true';

        if (isSuccess) {
            // Update onboarding record
            await dbService.update(
                model.practomindAepsOnboarding,
                { id: existingOnboarding.id },
                {
                    isBioMetricValidated: true,
                    onboardingStatus: 'COMPLETED',
                    status: 'ekyc_completed',
                    message: response.message
                }
            );

            return res.success({ 
                message: response.message || 'EKYC completed successfully', 
                data: response 
            });
        } else {
            return res.failure({ 
                message: response.message || 'EKYC submission failed', 
                data: response 
            });
        }
    } catch (err) {
        console.error('EKYC Submit error:', err);
        return res.failure({ message: err.message || 'Failed to submit EKYC' });
    }
};

/**
 * Daily Authentication (2FA)
 * @route POST /api/user/aeps2/daily-authentication
 */
const dailyAuthentication = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { 
            id: req.user.id, 
            companyId: req.user.companyId 
        });
        
        if (!existingUser) {
        return res.failure({ message: 'User not found' });
        }

        const existingOnboarding = await dbService.findOne(model.practomindAepsOnboarding, { 
            userId: existingUser.id, 
            companyId: existingUser.companyId 
        });

        if (!existingOnboarding || existingOnboarding.onboardingStatus !== 'COMPLETED') {
            return res.failure({ message: 'Please complete onboarding and EKYC first' });
        }

        // Check if already logged in today
        const todayDateStr = aepsDailyLoginService.getIndianDateOnly();
        const existingDaily2FA = await dbService.findOne(model.practomindAepsDailyLogin, {
            refId: req.user.id,
            companyId: req.user.companyId,
            loginDate: todayDateStr,
            isLoggedIn: true
        });

        if (existingDaily2FA) {
            return res.failure({ message: 'Already authenticated for today' });
        }

        if (!req.body.txtPidData) {
            return res.failure({ message: 'Fingerprint data is required' });
        }

        // Prepare 2FA data
        const authData = {
            mobileNumber: existingUser.mobileNo,
            merchantLoginId: existingOnboarding.merchantLoginId,
            latitude: req.body.latitude,
            longitude: req.body.longitude,
            userPan: existingOnboarding.userPan,
            aadhaarNumber: existingOnboarding.aadhaarNumber,
            nationalBankIdenticationNumber: req.body.nationalBankIdurationNumber || req.body.bankIin,
            txtPidData: req.body.txtPidData
        };

        // Call Practomind API
        const response = await practomindService.practomindDailyAuthentication(authData);

        // Parse response
        const isSuccess = response.status === true || response.status === 'true';

        if (isSuccess) {
            // Create daily login record
            const newLoginTime = new Date();
            const logoutTime = aepsDailyLoginService.getNextMidnightIST();

            await dbService.createOne(model.practomindAepsDailyLogin, {
                refId: req.user.id,
                companyId: req.user.companyId,
                loginTime: newLoginTime,
                logoutTime: logoutTime,
                isLoggedIn: true,
                loginDate: todayDateStr,
                responseMessage: response.responseMessage || response.message,
                status: 'success'
            });

            return res.success({ 
                message: response.message || 'Daily authentication successful', 
                data: response 
            });
        } else {
            return res.failure({ 
                message: response.message || 'Daily authentication failed', 
                data: response 
            });
        }
    } catch (err) {
        console.error('Daily Authentication error:', err);
        return res.failure({ message: err.message || 'Failed to authenticate' });
    }
};

/**
 * Cash Withdrawal Transaction
 * @route POST /api/user/aeps2/cash-withdrawal
 */
const cashWithdrawal = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { 
            id: req.user.id, 
            companyId: req.user.companyId 
        });
        
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        const existingCompany = await dbService.findOne(model.company, { 
            id: req.user.companyId 
        });
        
        if (!existingCompany) {
            return res.failure({ message: 'Company not found' });
        }

        // Check if user completed daily authentication
        const todayDateStr = aepsDailyLoginService.getIndianDateOnly();
        const existingDaily2FA = await dbService.findOne(model.practomindAepsDailyLogin, {
            refId: req.user.id,
            companyId: req.user.companyId,
            loginDate: todayDateStr,
            isLoggedIn: true
        });

        if (!existingDaily2FA) {
            return res.failure({ message: 'Please complete daily authentication first' });
        }

        const existingOnboarding = await dbService.findOne(model.practomindAepsOnboarding, { 
            userId: existingUser.id, 
            companyId: existingUser.companyId 
        });

        if (!existingOnboarding || existingOnboarding.onboardingStatus !== 'COMPLETED') {
            return res.failure({ message: 'Onboarding not completed' });
        }

        // Validate required fields
        if (!req.body.txtPidData) {
            return res.failure({ message: 'Customer fingerprint data is required' });
        }

        if (!req.body.transactionAmount || req.body.transactionAmount <= 0) {
            return res.failure({ message: 'Valid transaction amount is required' });
        }

        // Generate unique transaction ID
        const transactionId = generateTransactionID(existingCompany.companyName || 'PRACTOMIND');

        // Prepare transaction data
        const transactionData = {
            mobileNumber: req.body.mobileNumber || req.body.customerMobile,
            merchantLoginId: existingOnboarding.merchantLoginId,
            latitude: req.body.latitude,
            longitude: req.body.longitude,
            adhaarNumber: req.body.adhaarNumber || req.body.aadhaarNumber,
            nationalBankIdenticationNumber: req.body.nationalBankIdurationNumber || req.body.bankIin,
            transactionAmount: req.body.transactionAmount,
            transactionId: transactionId,
            txtPidData: req.body.txtPidData
        };

        // Call Practomind API
        const response = await practomindService.practomindCashWithdrawal(transactionData);

        // Parse response
        const isSuccess = response.status === true || response.status === 'true';

        // TODO: Save transaction to aepsHistory model
        // Similar to ALS AEPS implementation

        if (isSuccess) {
            return res.success({ 
                message: response.message || 'Cash withdrawal successful', 
                data: response 
            });
        } else {
            return res.failure({ 
                message: response.message || 'Cash withdrawal failed', 
                data: response 
            });
        }
    } catch (err) {
        console.error('Cash Withdrawal error:', err);
        return res.failure({ message: err.message || 'Failed to process cash withdrawal' });
    }
};

/**
 * Balance Enquiry
 * @route POST /api/user/aeps2/balance-enquiry
 */
const balanceEnquiry = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { 
            id: req.user.id, 
            companyId: req.user.companyId 
        });
        
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        // Check if user completed daily authentication
        const todayDateStr = aepsDailyLoginService.getIndianDateOnly();
        const existingDaily2FA = await dbService.findOne(model.practomindAepsDailyLogin, {
            refId: req.user.id,
            companyId: req.user.companyId,
            loginDate: todayDateStr,
            isLoggedIn: true
        });

        if (!existingDaily2FA) {
            return res.failure({ message: 'Please complete daily authentication first' });
        }

        const existingOnboarding = await dbService.findOne(model.practomindAepsOnboarding, { 
            userId: existingUser.id, 
            companyId: existingUser.companyId 
        });

        if (!existingOnboarding || existingOnboarding.onboardingStatus !== 'COMPLETED') {
            return res.failure({ message: 'Onboarding not completed' });
        }

        if (!req.body.txtPidData) {
            return res.failure({ message: 'Customer fingerprint data is required' });
        }

        const existingCompany = await dbService.findOne(model.company, { 
            id: req.user.companyId 
        });

        // Generate unique transaction ID
        const transactionId = generateTransactionID(existingCompany?.companyName || 'PRACTOMIND');

        // Prepare enquiry data
        const enquiryData = {
            mobileNumber: req.body.mobileNumber || req.body.customerMobile,
            merchantLoginId: existingOnboarding.merchantLoginId,
            latitude: req.body.latitude,
            longitude: req.body.longitude,
            adhaarNumber: req.body.adhaarNumber || req.body.aadhaarNumber,
            nationalBankIdurationNumber: req.body.nationalBankIdurationNumber || req.body.bankIin,
            transactionId: transactionId,
            txtPidData: req.body.txtPidData
        };

        // Call Practomind API
        const response = await practomindService.practomindBalanceEnquiry(enquiryData);

        // Parse response
        const isSuccess = response.status === true || response.status === 'true';

        if (isSuccess) {
            return res.success({ 
                message: response.message || 'Balance enquiry successful', 
                data: response 
            });
        } else {
            return res.failure({ 
                message: response.message || 'Balance enquiry failed', 
                data: response 
            });
        }
    } catch (err) {
        console.error('Balance Enquiry error:', err);
        return res.failure({ message: err.message || 'Failed to process balance enquiry' });
    }
};

/**
 * Mini Statement
 * @route POST /api/user/aeps2/mini-statement
 */
const miniStatement = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { 
            id: req.user.id, 
            companyId: req.user.companyId 
        });
        
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        // Check if user completed daily authentication
        const todayDateStr = aepsDailyLoginService.getIndianDateOnly();
        const existingDaily2FA = await dbService.findOne(model.practomindAepsDailyLogin, {
            refId: req.user.id,
            companyId: req.user.companyId,
            loginDate: todayDateStr,
            isLoggedIn: true
        });

        if (!existingDaily2FA) {
            return res.failure({ message: 'Please complete daily authentication first' });
        }

        const existingOnboarding = await dbService.findOne(model.practomindAepsOnboarding, { 
            userId: existingUser.id, 
            companyId: existingUser.companyId 
        });

        if (!existingOnboarding || existingOnboarding.onboardingStatus !== 'COMPLETED') {
            return res.failure({ message: 'Onboarding not completed' });
        }

        if (!req.body.txtPidData) {
            return res.failure({ message: 'Customer fingerprint data is required' });
        }

        const existingCompany = await dbService.findOne(model.company, { 
            id: req.user.companyId 
        });

        // Generate unique transaction ID
        const transactionId = generateTransactionID(existingCompany?.companyName || 'PRACTOMIND');

        // Prepare statement data
        const statementData = {
            mobileNumber: req.body.mobileNumber || req.body.customerMobile,
            merchantLoginId: existingOnboarding.merchantLoginId,
            latitude: req.body.latitude,
            longitude: req.body.longitude,
            adhaarNumber: req.body.adhaarNumber || req.body.aadhaarNumber,
            nationalBankIdurationNumber: req.body.nationalBankIdurationNumber || req.body.bankIin,
            transactionId: transactionId,
            txtPidData: req.body.txtPidData
        };

        // Call Practomind API
        const response = await practomindService.practomindMiniStatement(statementData);

        // Parse response
        const isSuccess = response.status === true || response.status === 'true';

        if (isSuccess) {
            return res.success({ 
                message: response.message || 'Mini statement retrieved successfully', 
                data: response 
            });
        } else {
            return res.failure({ 
                message: response.message || 'Failed to retrieve mini statement', 
                data: response 
            });
        }
    } catch (err) {
        console.error('Mini Statement error:', err);
        return res.failure({ message: err.message || 'Failed to retrieve mini statement' });
    }
};

module.exports = {
    getPractomindAepsOnboardingStatus,
    createPractomindAepsOnboarding,
    sendEkycOtp,
    validateEkycOtp,
    resendEkycOtp,
    ekycSubmit,
    dailyAuthentication,
    cashWithdrawal,
    balanceEnquiry,
    miniStatement
};
