
const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const practomindService = require('../../../services/practomind');
const aepsDailyLoginService = require('../../../services/aepsDailyLoginService');
const { generateTransactionID} = require('../../../utils/transactionID');
const imageService = require('../../../services/imageService');
const { Op, Transaction } = require('sequelize');
const sequelize = require('../../../config/dbConnection');

const convertImageToBase64 = async (imageData) => {
    try {
        if (!imageData) return null;

        // Extract S3 key
        const s3Key = imageService.extractS3Key(imageData);
        if (!s3Key) return null;

        // Get image buffer from S3
        const imageBuffer = await imageService.getImageFromS3(s3Key);
        
        // Convert buffer to base64
        return imageBuffer.toString('base64');
    } catch (error) {
        console.error('Error converting image to base64:', error);
        return null;
    }
};

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

        const isOnboardingComplete = existingPractomindAepsOnboarding.isAepsOnboardingCompleted;
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
                isCompleted: isBioMetricValidated,
                ekycResponseCode: existingPractomindAepsOnboarding.ekycResponseCode || null,
                retryRequired: existingPractomindAepsOnboarding.ekycResponseCode ? true : false,
                retryCount: existingPractomindAepsOnboarding.ekycRetryCount || 0,
                lastRetryAt: existingPractomindAepsOnboarding.lastRetryAt || null,
                nextStep: existingPractomindAepsOnboarding.ekycResponseCode ? 'onboarding' : null
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


const createPractomindAepsOnboarding = async (req, res) => {
    try {
        const [existingUser, existingOnboarding] = await Promise.all([
            dbService.findOne(model.user, { 
                id: req.user.id, 
                companyId: req.user.companyId 
            }),
            dbService.findOne(model.practomindAepsOnboarding, { 
                userId: req.user.id, 
                companyId: req.user.companyId 
            })
        ]);

        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }


        // OPTIMIZATION: Fetch all dependent data in parallel (Second batch)
        const [
            existingCompany,
            existingOutlet,
            bankDetails,
            existingUserStateCode
        ] = await Promise.all([
            dbService.findOne(model.company, { 
                id: existingUser.companyId 
            }),
            dbService.findOne(model.outlet, { 
                refId: existingUser.id, 
                companyId: existingUser.companyId 
            }),
            dbService.findOne(model.customerBank, { 
                refId: existingUser.id, 
                companyId: existingUser.companyId 
            }),
            dbService.findOne(model.practomindState, {
                state: existingUser?.state
            })
        ]);

        if (!existingCompany) {
            return res.failure({ message: 'Company not found' });
        }

        if (!existingOutlet) {
            return res.failure({ message: 'Outlet not found' });
        }
        
        if (!bankDetails) {
            return res.failure({ message: 'Bank details not found' });
        }

        const [
            existingCompanyAdmin,
            existingCompanyCode,
            existingShopStateCode
        ] = await Promise.all([
            dbService.findOne(model.user, { 
                userRole: 2,
                companyId: existingCompany.id 
            }),
            dbService.findOne(model.practomindCompanyCode, { 
                id: existingOutlet.shopCategoryId
            }),
            dbService.findOne(model.practomindState, {
                state: existingOutlet?.shopState
            })
        ]);

        if (!existingCompanyAdmin) {
            return res.failure({ message: 'Company admin not found' });
        }

        if (!existingCompanyCode) {
            return res.failure({ message: 'Company code not found. Please configure MCC code in outlet settings.' });
        }

        const existingCompanyAdminBankDetails = await dbService.findOne(model.customerBank, { 
            refId: existingCompanyAdmin.id, 
            companyId: existingCompany.id 
        });

        if (!existingCompanyAdminBankDetails) {
            return res.failure({ message: 'Company admin bank details not found' });
        }


        let merchantLoginId;
        if (existingOnboarding?.merchantLoginId) {
            merchantLoginId = existingOnboarding.merchantLoginId;
        } else {
            const transaction = await sequelize.transaction({
                isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE
            });
            
            try {
                const lastOnboarding = await model.practomindAepsOnboarding.findOne({
                    where: {
                        merchantLoginId: {
                            [Op.like]: 'GMAX%',
                            [Op.ne]: null
                        }
                    },
                    order: [['id', 'DESC']],
                    attributes: ['merchantLoginId'],
                    lock: transaction.LOCK.UPDATE,
                    transaction
                });

                let nextNumber = 1;
                if (lastOnboarding?.merchantLoginId) {
                    const lastNumber = parseInt(lastOnboarding.merchantLoginId.replace('GMAX', ''), 10);
                    nextNumber = isNaN(lastNumber) ? 1 : lastNumber + 1;
                }
                merchantLoginId = `GMAX${nextNumber.toString().padStart(6, '0')}`;
                
                await transaction.commit();
            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        }

        const [maskedAadharImageBase64, backgroundImageOfShopBase64, merchantPanImageBase64] = await Promise.all([
            convertImageToBase64(existingUser.aadharBackImage),
            convertImageToBase64(existingOutlet.shopImage),
            convertImageToBase64(existingUser.panCardFrontImage)
        ]);
        
        const onboardingData = {
            merchantLoginId: merchantLoginId,
            merchantFirstName: existingUser?.name,
            merchantPhoneNumber: existingUser?.mobileNo,
            companyLegalName: existingCompany?.companyName,
            emailId: existingUser?.email,
            merchantPinCode: existingUser?.zipcode,
            merchantCityName: existingUser?.city,
            merchantDistrictName: existingUser?.district,
            merchantState: existingUserStateCode?.stateId,
            merchantAddress: existingUser?.fullAddress,
            userPan: existingUser?.panDetails?.data?.pan_number,
            aadhaarNumber: existingUser?.aadharDetails?.aadhaarNumber,
            companyBankAccountNumber: bankDetails?.accountNumber,
            bankIfscCode: bankDetails?.ifsc,
            companyBankName: bankDetails?.bankName,
            bankAccountName: bankDetails?.beneficiaryName,
            bankBranchName: bankDetails?.branch,
            c_code: existingCompanyCode?.mccCode,
            shopAddress: existingOutlet?.shopAddress,
            shopCity: existingOutlet?.shopCity,
            shopDistrict: existingOutlet?.shopDistrict,
            shopState: existingShopStateCode?.stateId,
            shopPincode: existingOutlet?.shopPincode,
            latitude: existingOutlet?.shopLatitude,
            longitude: existingOutlet?.shopLongitude,
            maskedAadharImage: maskedAadharImageBase64,
            backgroundImageOfShop: backgroundImageOfShopBase64,
            merchantPanImage: merchantPanImageBase64
        };
        const response = await practomindService.practomindAepsOnboarding(onboardingData, merchantLoginId);
        console.log("response", response);
        console.log("response.result.status", response.result.status);
        const isSuccess = response.result.status === true || response.result.status === 'true';
        console.log("isSuccess", isSuccess);

        const dbData = {
            userId: existingUser.id,
            companyId: existingUser.companyId,
            merchantLoginId: response.merchantLoginId || merchantLoginId,
            merchantLoginPin: response.merchantLoginPin,
            merchantPhoneNumber: onboardingData.merchantPhoneNumber,
            aadhaarNumber: onboardingData.aadhaarNumber,
            userPan: onboardingData.userPan,
            onboardingStatus: isSuccess == true || isSuccess == 'true' ? 'COMPLETED' : 'PENDING',
            status: isSuccess ? 'success' : 'failed',
            message: response.message,
            errorMessage: isSuccess ? null : JSON.stringify(response),
            // Reset EKYC fields when re-onboarding (for retry scenarios)
            isAepsOnboardingCompleted: isSuccess == true || isSuccess == 'true' ? true : false,
            isOtpSent: false,
            isOtpValidated: false,
            isBioMetricValidated: false,
            KeyID: null,
            TxnId: null,
            primaryKeyId: null,
            encodeFPTxnId: null,
            ekycResponseCode: null,
            ekycRetryCount: 0,
            lastRetryAt: null
        };

        try {
            if (existingOnboarding) {
                await dbService.update(model.practomindAepsOnboarding, { id: existingOnboarding.id }, dbData);
            } else {
                await dbService.createOne(model.practomindAepsOnboarding, dbData);
            }
        } catch (dbError) {
            if (dbError.name === 'SequelizeUniqueConstraintError') {
                console.error('Duplicate merchantLoginId detected:', merchantLoginId);
                return res.failure({ message: 'Merchant ID already exists. Please try again.' });
            }
            throw dbError;
        }

        return isSuccess 
            ? res.success({ message: 'Practomind AEPS onboarding successful', data: response })
            : res.failure({ message: response.message || 'Practomind AEPS onboarding failed', data: response });

    } catch (err) {
        console.error('Create Practomind AEPS onboarding error:', err);
        return res.failure({ message: err.message || 'Failed to create onboarding' });
    }
};

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

        if (!existingOnboarding) {
            return res.failure({ message: 'Please complete onboarding first' });
        }

        // Validate required fields from onboarding
        if (!existingOnboarding.userPan || !existingOnboarding.aadhaarNumber) {
            return res.failure({ message: 'PAN and Aadhaar details are required from onboarding' });
        }
        
        const shopDetails = await dbService.findOne(model.outlet, { 
            refId: existingUser.id, 
            companyId: existingUser.companyId 
        });

        const otpData = {
            merchantPhoneNumber: existingUser.mobileNo,
            panNumber: existingUser.panDetails?.data?.pan_number,
            aadhaarNumber: existingUser.aadharDetails?.aadhaarNumber,
            latitude: shopDetails.shopLatitude,
            longitude: shopDetails.shopLongitude,
            merchantLoginId: existingOnboarding.merchantLoginId
        };

        const response = await practomindService.practomindSendEkycOtp(otpData);

        const isSuccess = response.status === true || response.status === 'true';

        if (isSuccess && response.result) {
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

const validateEkycOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        const existingUser = await dbService.findOne(model.user, { 
            id: req.user.id, 
            companyId: req.user.companyId 
        });
        
        if (!otp) {
            return res.failure({ message: 'OTP is required' });
        }
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
            TxnId: existingOnboarding.TxnId,
            otp: otp
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
            merchantPhoneNumber: existingUser.mobileNo,
            merchantLoginId: existingOnboarding.merchantLoginId,
            KeyID: existingOnboarding.KeyID,
            TxnId: existingOnboarding.TxnId,
            latitude: existingUser.latitude,
            longitude: existingUser.longitude
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

const ekycSubmit = async (req, res) => {
    try {
        const { txtPidData } = req.body;
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
            txtPidData: txtPidData
        };

        // Call Practomind API
        const response = await practomindService.practomindEkycSubmit(ekycData);

        // Parse response
        const isSuccess = response.status === true || response.status === 'true';

        if (isSuccess) {
            // Check if kycResponseCode exists (means need to repeat the process from onboarding)
            const hasKycResponseCode = response.kycResponseCode && response.kycResponseCode !== '';
            
            if (hasKycResponseCode) {
                // Increment retry count
                const retryCount = (existingOnboarding.ekycRetryCount || 0) + 1;
                
                // Reset onboarding and biometric flags - user must restart from onboarding
                await dbService.update(
                    model.practomindAepsOnboarding,
                    { id: existingOnboarding.id },
                    {
                        ekycResponseCode: response.kycResponseCode,
                        ekycRetryCount: retryCount,
                        isAepsOnboardingCompleted: false,
                        isBioMetricValidated: false,
                        status: 'ekyc_retry_required',
                        message: response.message,
                        lastRetryAt: new Date()
                    }
                );

                return res.failure({ 
                    message: `EKYC verification failed with code ${response.kycResponseCode}. Please repeat the entire process from onboarding to EKYC. Attempt: ${retryCount}`, 
                    data: response,
                    kycResponseCode: response.kycResponseCode,
                    retryCount: retryCount,
                    requiresRetry: true,
                    nextStep: 'onboarding'
                });
            } else {
                // EKYC completed successfully without any response code
                await dbService.update(
                    model.practomindAepsOnboarding,
                    { id: existingOnboarding.id },
                    {
                        isBioMetricValidated: true,
                        onboardingStatus: 'COMPLETED',
                        status: 'ekyc_completed',
                        message: response.message,
                        ekycResponseCode: null,
                        ekycRetryCount: 0
                    }
                );

                return res.success({ 
                    message: response.message || 'EKYC completed successfully', 
                    data: response 
                });
            }
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


const dailyAuthentication = async (req, res) => {
    try {
        const { txtPidData, latitude, longitude } = req.body;
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

        const existingCustomerBank = await dbService.findOne(model.customerBank, { 
            refId: existingUser.id, 
            companyId: existingUser.companyId,
            isPrimary: true
        });

        if (!existingCustomerBank) {
            return res.failure({ message: 'Please add primary bank details first' });
        }
        const practomindBank =  await dbService.findOne(model.practomindBankList, { 
           bankName: existingCustomerBank.bankName,
           isActive: true
        });
        if (!practomindBank) {
            return res.failure({ message: 'Practomind bank not found' });
        }

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

        if (!txtPidData) {
            return res.failure({ message: 'Biometric data is required' });
        }

        // Prepare 2FA data
        const authData = {
            mobileNumber: existingUser.mobileNo,
            merchantLoginId: existingOnboarding.merchantLoginId,
            latitude: latitude,
            longitude: longitude,
            userPan: existingOnboarding.userPan,
            aadhaarNumber: existingOnboarding.aadhaarNumber,
            nationalBankIdenticationNumber: practomindBank.aeps_bank_id,
            txtPidData: txtPidData
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

const cashWithdrawal = async (req, res) => {
    try {
        const { latitude, longitude, txtPidData, transactionAmount } = req.body;
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

        const existingCustomerBank = await dbService.findOne(model.customerBank, { 
            refId: existingUser.id, 
            companyId: existingUser.companyId,
            isPrimary: true
        });

        const practomindBank =  await dbService.findOne(model.practomindBankList, { 
            bankName: existingCustomerBank.bankName,
            isActive: true
         });
        if (!practomindBank) {
            return res.failure({ message: 'Bank Is Not Supported For Cash Withdrawal' });
        }
        // Validate required fields
       if (!txtPidData) {
            return res.failure({ message: 'Biometric data is required' });
        }
        if (!transactionAmount || transactionAmount <= 0) {
            return res.failure({ message: 'Valid transaction amount is required' });
        }

        // Generate unique transaction ID
        const transactionId = generateTransactionID(existingCompany?.companyName);

        // Prepare transaction data
        const transactionData = {
            mobileNumber: existingUser.mobileNo,
            merchantLoginId: existingOnboarding.merchantLoginId,
            latitude: latitude,
            longitude: longitude,
            adhaarNumber: existingOnboarding.aadhaarNumber,
            nationalBankIdenticationNumber: practomindBank.aeps_bank_id,
            transactionAmount: transactionAmount,
            transactionId: transactionId,
            txtPidData: txtPidData
        };

        // Call Practomind API
        const response = await practomindService.practomindCashWithdrawal(transactionData);
        console.log('response', response);

        // Parse response
        const isSuccess = response.status === true || response.status === 'true';

        // Save transaction to practomindAepsHistory
        const historyData = {
            refId: existingUser.id,
            companyId: existingUser.companyId,
            merchantLoginId: existingOnboarding.merchantLoginId,
            transactionType: 'CW',
            transactionAmount: transactionAmount || 0,
            balanceAmount: response?.result?.balanceAmount || null,
            transactionId: transactionId,
            merchantTransactionId: response?.result?.merchantTransactionId || null,
            bankRRN: response?.result?.bankRRN || null,
            fpTransactionId: response?.result?.fpTransactionId || null,
            partnerTxnid: response?.partnerTxnid || null,
            transactionStatus: response?.result?.transactionStatus || (isSuccess ? 'successful' : 'failed'),
            status: isSuccess,
            message: response.message || '',
            device: response?.result?.device || null,
            requestTransactionTime: response?.result?.requestTransactionTime || null,
            consumerAadhaarNumber: existingOnboarding.aadhaarNumber,
            mobileNumber: existingUser.mobileNo,
            bankIin: practomindBank.aeps_bank_id,
            latitude: latitude || null,
            longitude: longitude || null,
            receiptUrl: response?.url || null,
            outletname: response?.outletname || null,
            outletmobile: response?.outletmobile || null,
            ministatement: response?.ministatement || null,
            requestPayload: {
                mobileNumber: transactionData.mobileNumber,
                latitude: transactionData.latitude,
                longitude: transactionData.longitude,
                adhaarNumber: transactionData.adhaarNumber,
                nationalBankIdurationNumber: transactionData.nationalBankIdurationNumber,
                transactionAmount: transactionData.transactionAmount,
                transactionId: transactionData.transactionId
            },
            responsePayload: response,
            ipAddress: req.ip || req.connection?.remoteAddress,
            addedBy: existingUser.id
        };

        try {
            await dbService.createOne(model.practomindAepsHistory, historyData);
        } catch (historyError) {
            console.error('Failed to save cash withdrawal transaction history:', historyError);
        }

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

const balanceEnquiry = async (req, res) => {
    try {
        const { latitude, longitude, txtPidData } = req.body;
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
            return res.failure({ message: 'Biometric data is required' });
        }

        const existingCompany = await dbService.findOne(model.company, { 
            id: req.user.companyId 
        });
        const existingCustomerBank = await dbService.findOne(model.customerBank, { 
            refId: existingUser.id, 
            companyId: existingUser.companyId,
            isPrimary: true
        });
        const practomindBank =  await dbService.findOne(model.practomindBankList, { 
            bankName: existingCustomerBank.bankName,
            isActive: true
         });
        if (!practomindBank) {
            return res.failure({ message: 'Bank Is Not Supported For Balance Enquiry' });
        }

        // Generate unique transaction ID
        const transactionId = generateTransactionID(existingCompany?.companyName);

        // Prepare enquiry data
        const enquiryData = {
            mobileNumber: existingUser.mobileNo,
            merchantLoginId: existingOnboarding.merchantLoginId,
            latitude: latitude,
            longitude: longitude,
            adhaarNumber: existingOnboarding.aadhaarNumber,
            nationalBankIdurationNumber: practomindBank.aeps_bank_id,
            transactionId: transactionId,
            txtPidData: txtPidData
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

const miniStatement = async (req, res) => {
    try {
        const { latitude, longitude, txtPidData } = req.body;
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
            return res.failure({ message: 'Biometric data is required' });
        }

        const existingCompany = await dbService.findOne(model.company, { 
            id: req.user.companyId 
        });
        const existingCustomerBank = await dbService.findOne(model.customerBank, { 
            refId: existingUser.id, 
            companyId: existingUser.companyId,
            isPrimary: true
        });
        const practomindBank =  await dbService.findOne(model.practomindBankList, { 
            bankName: existingCustomerBank.bankName,
            isActive: true
         });    
        if (!practomindBank) {
            return res.failure({ message: 'Bank Is Not Supported For Mini Statement' });
        }

        // Generate unique transaction ID
        const transactionId = generateTransactionID(existingCompany?.companyName || 'PRACTOMIND');

        // Prepare statement data
        const statementData = {
            mobileNumber: existingUser.mobileNo,
            merchantLoginId: existingOnboarding.merchantLoginId,
            latitude: latitude,
            longitude: longitude,
            adhaarNumber: existingOnboarding.aadhaarNumber,
            nationalBankIdurationNumber: practomindBank.aeps_bank_id,
            transactionId: transactionId,
            txtPidData: txtPidData
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
