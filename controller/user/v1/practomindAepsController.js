const sharp = require('sharp');
const axios = require('axios');
const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const practomindService = require('../../../services/practomind');
const aepsDailyLoginService = require('../../../services/aepsDailyLoginService');
const { generateTransactionID } = require('../../../utils/transactionID');
const imageService = require('../../../services/imageService');
const { Op, Transaction } = require('sequelize');
const sequelize = require('../../../config/dbConnection');

const convertImageToBase64 = async (imageData, compress = false) => {
    try {
        if (!imageData) return null;

        const s3Key = imageService.extractS3Key(imageData);
        if (!s3Key) return null;

        let imageBuffer;
        const baseCdnUrl = process.env.AWS_CDN_URL ? process.env.AWS_CDN_URL.replace(/\/$/, '') : 'https://assets.gmaxepay.in';
        const imageUrl = `${baseCdnUrl}/${s3Key.replace(/^\//, '')}`;
        console.log(`Image URL for ${s3Key}: ${imageUrl}`);

        try {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            imageBuffer = Buffer.from(response.data);
        } catch (fetchError) {
            console.error(`Error fetching image from CDN: ${imageUrl}, falling back to S3 direct.`, fetchError.message);
            imageBuffer = await imageService.getImageFromS3(s3Key);
        }

        if (!imageBuffer) return null;

        if (compress) {
            try {
                imageBuffer = await sharp(imageBuffer, { failOn: 'none' })
                    .resize(800, 800, {
                        fit: 'inside',
                        withoutEnlargement: true
                    })
                    .jpeg({
                        quality: 60,
                        chromaSubsampling: '4:2:0'
                    })
                    .withMetadata(false)
                    .toBuffer();
                console.log(`Compressed image: ${s3Key}, size: ${imageBuffer.length} bytes`);
            } catch (sharpError) {
                console.error('Error compressing image with sharp:', sharpError);
                return null;
            }
        }

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
            convertImageToBase64(existingUser.aadharBackImage, true),
            convertImageToBase64(existingOutlet.shopImage, true),
            convertImageToBase64(existingUser.panCardFrontImage, true)
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

        console.log("onboardingData", onboardingData);
        const response = await practomindService.practomindAepsOnboarding(onboardingData, merchantLoginId);
        const isSuccess = response?.status === true || response?.status === 'true' ||
            (response?.result && (response.result.status === true || response.result.status === 'true'));

        if (!isSuccess) {
            return res.failure({
                message: response?.message || 'Practomind AEPS onboarding failed',
                data: response
            });
        }

        // Only save to database on success
        const dbData = {
            userId: existingUser.id,
            companyId: existingUser.companyId,
            merchantLoginId: response?.merchantLoginId || merchantLoginId,
            merchantLoginPin: response?.merchantLoginPin || null,
            merchantPhoneNumber: onboardingData.merchantPhoneNumber,
            aadhaarNumber: onboardingData.aadhaarNumber,
            userPan: onboardingData.userPan,
            onboardingStatus: 'COMPLETED',
            status: 'success',
            message: response?.message || 'Onboarding successful',
            errorMessage: null,
            // Reset EKYC fields when re-onboarding (for retry scenarios)
            isAepsOnboardingCompleted: true,
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

        return res.success({
            message: 'Practomind AEPS onboarding successful',
            data: response
        });

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
        console.log("txtPidData", txtPidData);

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
        const practomindBank = await dbService.findOne(model.practomindBankList, {
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
            nationalBankIdenticationNumber: practomindBank.iinno,
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
        const { latitude, longitude, txtPidData, transactionAmount, aadhaarNumber, customerNumber, bankIIN } = req.body;

        const round4 = (num) => { const n = Number(num); return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 10000) / 10000 : 0; };

        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) return res.failure({ message: 'User not found' });


        const existingCompany = await dbService.findOne(model.company, { id: req.user.companyId });
        if (!existingCompany) return res.failure({ message: 'Company not found' });

        const todayDateStr = aepsDailyLoginService.getIndianDateOnly();
        const existingDaily2FA = await dbService.findOne(model.practomindAepsDailyLogin, { refId: req.user.id, companyId: req.user.companyId, loginDate: todayDateStr, isLoggedIn: true });
        if (!existingDaily2FA) return res.failure({ message: 'Please complete daily authentication first' });

        const existingOnboarding = await dbService.findOne(model.practomindAepsOnboarding, { userId: existingUser.id, companyId: existingUser.companyId });
        if (!existingOnboarding || existingOnboarding.onboardingStatus !== 'COMPLETED') return res.failure({ message: 'Onboarding not completed' });

        if (!bankIIN) return res.failure({ message: 'Bank IIN is required' });
        if (!aadhaarNumber) return res.failure({ message: 'Aadhaar number is required' });
        if (!customerNumber) return res.failure({ message: 'Customer number is required' });
        if (!txtPidData) return res.failure({ message: 'Biometric data is required' });
        if (!transactionAmount || transactionAmount <= 0) return res.failure({ message: 'Valid transaction amount is required' });

        const practomindBank = await dbService.findOne(model.practomindBankList, { iinno: bankIIN, isActive: true });
        if (!practomindBank) return res.failure({ message: 'Bank Is Not Supported For Cash Withdrawal' });

        const amountNumber = round4(transactionAmount || 0);
        const transactionId = generateTransactionID(existingCompany?.companyName);

        // ── AEPS2 operator lookup (amount-range based) ─────────────────────────
        const operator = await dbService.findOne(model.operator, {
            operatorType: 'AEPS2',
            minValue: { [Op.lte]: amountNumber },
            maxValue: { [Op.gte]: amountNumber }
        });
        const operatorType = operator?.operatorType || 'AEPS2';

        const calcSlabAmount = (slab, base) => {
            if (!slab) return 0;
            const b = Number(base || 0), rc = Number(slab.commAmt || 0);
            if (!Number.isFinite(b) || !Number.isFinite(rc)) return 0;
            return (slab.amtType || 'fix').toLowerCase() === 'per' ? round4((b * rc) / 100) : round4(rc);
        };

        const commData = { users: {}, wallets: {}, slabs: {}, amounts: { retailerComm: 0, distComm: 0, mdComm: 0, companyComm: 0, superAdminComm: 0, wlShortfall: 0, mdShortfall: 0, distShortfall: 0, saShortfall: 0 }, scenario: '' };
        const user = req.user;

        if (operator && [4, 5].includes(user.userRole)) {
            const [companyAdmin, superAdmin] = await Promise.all([
                dbService.findOne(model.user, { companyId: user.companyId, userRole: 2, isActive: true }),
                dbService.findOne(model.user, { id: 1, companyId: 1, userRole: 1, isActive: true })
            ]);
            if (companyAdmin && superAdmin) {
                commData.users.companyAdmin = companyAdmin;
                commData.users.superAdmin = superAdmin;
                const [companyWallet, superAdminWallet] = await Promise.all([
                    dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                    dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 })
                ]);
                commData.wallets.companyWallet = companyWallet;
                commData.wallets.superAdminWallet = superAdminWallet;

                if (user.userRole === 4) {
                    const distributor = await dbService.findOne(model.user, { id: user.id, companyId: user.companyId, isActive: true });
                    commData.users.distributor = distributor;
                    commData.wallets.distributorWallet = await model.wallet.findOne({ where: { refId: user.id, companyId: user.companyId } });
                    if (distributor.reportingTo === companyAdmin.id || distributor.reportingTo === null) {
                        commData.scenario = 'DIST_DIRECT';
                        const [saSlab, coSlab] = await Promise.all([
                            dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                        ]);
                        commData.slabs.saSlab = saSlab?.find(c => c.roleType === 1 || c.roleName === 'AD');
                        commData.slabs.wlSlab = saSlab?.find(c => c.roleType === 2 || c.roleName === 'WU');
                        commData.slabs.distSlab = coSlab?.find(c => c.roleType === 4 || c.roleName === 'DI');
                    } else {
                        commData.scenario = 'DIST_MD';
                        const md = await dbService.findOne(model.user, { id: distributor.reportingTo, companyId: user.companyId, isActive: true });
                        if (md) {
                            commData.users.masterDistributor = md;
                            commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: md.id, companyId: user.companyId });
                            const [saSlab, coSlab, mdSlab] = await Promise.all([
                                dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: md.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                            ]);
                            commData.slabs.saSlab = saSlab?.find(c => c.roleType === 1 || c.roleName === 'AD');
                            commData.slabs.wlSlab = saSlab?.find(c => c.roleType === 2 || c.roleName === 'WU');
                            commData.slabs.mdSlab = coSlab?.find(c => c.roleType === 3);
                            commData.slabs.distSlab = mdSlab?.find(c => c.roleType === 4);
                        }
                    }
                } else if (user.userRole === 5) {
                    const retailer = await dbService.findOne(model.user, { id: user.id, companyId: user.companyId, isActive: true });
                    commData.users.retailer = retailer;
                    commData.wallets.retailerWallet = await model.wallet.findOne({ where: { refId: user.id, companyId: user.companyId } });
                    let reportingUser = null;
                    if (retailer.reportingTo && retailer.reportingTo !== companyAdmin.id) {
                        reportingUser = await dbService.findOne(model.user, { id: retailer.reportingTo, companyId: user.companyId, isActive: true });
                    }
                    if (!reportingUser || retailer.reportingTo === companyAdmin.id || retailer.reportingTo === null) {
                        commData.scenario = 'RET_DIRECT';
                        const [saSlab, coSlab] = await Promise.all([
                            dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                        ]);
                        commData.slabs.saSlab = saSlab?.find(c => c.roleType === 1 || c.roleName === 'AD');
                        commData.slabs.wlSlab = saSlab?.find(c => c.roleType === 2 || c.roleName === 'WU');
                        commData.slabs.retSlab = coSlab?.find(c => c.roleType === 5);
                    } else if (reportingUser.userRole === 3) {
                        commData.scenario = 'RET_MD';
                        commData.users.masterDistributor = reportingUser;
                        commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: reportingUser.id, companyId: user.companyId });
                        const [saSlab, coSlab, mdSlab] = await Promise.all([
                            dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: reportingUser.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                        ]);
                        commData.slabs.saSlab = saSlab?.find(c => c.roleType === 1 || c.roleName === 'AD');
                        commData.slabs.wlSlab = saSlab?.find(c => c.roleType === 2 || c.roleName === 'WU');
                        commData.slabs.mdSlab = coSlab?.find(c => c.roleType === 3);
                        commData.slabs.retSlab = mdSlab?.find(c => c.roleType === 5);
                    } else if (reportingUser.userRole === 4) {
                        commData.users.distributor = reportingUser;
                        commData.wallets.distributorWallet = await dbService.findOne(model.wallet, { refId: reportingUser.id, companyId: user.companyId });
                        if (reportingUser.reportingTo === companyAdmin.id || reportingUser.reportingTo === null) {
                            commData.scenario = 'RET_DIST_CO';
                            const [saSlab, coSlab, distSlab] = await Promise.all([
                                dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: reportingUser.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                            ]);
                            commData.slabs.saSlab = saSlab?.find(c => c.roleType === 1 || c.roleName === 'AD');
                            commData.slabs.wlSlab = saSlab?.find(c => c.roleType === 2 || c.roleName === 'WU');
                            commData.slabs.distSlab = coSlab?.find(c => c.roleType === 4);
                            commData.slabs.retSlab = distSlab?.find(c => c.roleType === 5);
                        } else {
                            commData.scenario = 'RET_DIST_MD';
                            const md = await dbService.findOne(model.user, { id: reportingUser.reportingTo, companyId: user.companyId, isActive: true });
                            if (md) {
                                commData.users.masterDistributor = md;
                                commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: md.id, companyId: user.companyId });
                                const [saSlab, coSlab, mdSlab, distSlab] = await Promise.all([
                                    dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                    dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                    dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: md.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                    dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: reportingUser.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                                ]);
                                commData.slabs.saSlab = saSlab?.find(c => c.roleType === 1 || c.roleName === 'AD');
                                commData.slabs.wlSlab = saSlab?.find(c => c.roleType === 2 || c.roleName === 'WU');
                                commData.slabs.mdSlab = coSlab?.find(c => c.roleType === 3);
                                commData.slabs.distSlab = mdSlab?.find(c => c.roleType === 4);
                                commData.slabs.retSlab = distSlab?.find(c => c.roleType === 5);
                            }
                        }
                    }
                }

                // Calculate amounts
                const operatorCommissionAmount = operator?.comm ? calcSlabAmount({ amtType: operator.amtType, commAmt: operator.comm }, amountNumber) : 0;
                const saSlabAmount = commData.slabs.saSlab ? calcSlabAmount(commData.slabs.saSlab, amountNumber) : 0;
                const wlSlabAmount = commData.slabs.wlSlab ? calcSlabAmount(commData.slabs.wlSlab, amountNumber) : 0;
                let mdSlabAmount = commData.slabs.mdSlab ? calcSlabAmount(commData.slabs.mdSlab, amountNumber) : 0;
                let distSlabAmount = commData.slabs.distSlab ? calcSlabAmount(commData.slabs.distSlab, amountNumber) : 0;
                let retSlabAmount = commData.slabs.retSlab ? calcSlabAmount(commData.slabs.retSlab, amountNumber) : 0;

                let companyCost = 0;
                if (commData.users.masterDistributor) companyCost = mdSlabAmount;
                else if (commData.users.distributor) companyCost = distSlabAmount;
                else companyCost = retSlabAmount;

                // Super Admin
                commData.amounts.superAdminComm = Math.max(0, round4(operatorCommissionAmount - wlSlabAmount));
                if (wlSlabAmount > operatorCommissionAmount) {
                    commData.amounts.saShortfall = round4(wlSlabAmount - operatorCommissionAmount);
                } else {
                    commData.amounts.saShortfall = 0;
                }

                // Company (WL)
                commData.amounts.companyComm = Math.max(0, round4(wlSlabAmount - companyCost));
                if (companyCost > wlSlabAmount) {
                    commData.amounts.wlShortfall = round4(companyCost - wlSlabAmount);
                }

                // Master Distributor
                if (commData.users.masterDistributor) {
                    let mdCost = commData.users.distributor ? distSlabAmount : retSlabAmount;
                    commData.amounts.mdComm = Math.max(0, round4(mdSlabAmount - mdCost));
                    if (mdCost > mdSlabAmount) {
                        commData.amounts.mdShortfall = round4(mdCost - mdSlabAmount);
                    }
                }

                // Distributor
                if (commData.users.distributor) {
                    commData.amounts.distComm = Math.max(0, round4(distSlabAmount - retSlabAmount));
                    if (retSlabAmount > distSlabAmount) {
                        commData.amounts.distShortfall = round4(retSlabAmount - distSlabAmount);
                    }
                }

                commData.amounts.retailerComm = retSlabAmount;

                const currentRole = user.userRole;
                let currentComm = 0;
                let currentSlabId = null;

                if (currentRole === 5) {
                    currentComm = retSlabAmount;
                    currentSlabId = commData.slabs.retSlab?.id;
                } else if (currentRole === 4) {
                    currentComm = distSlabAmount;
                    currentSlabId = commData.slabs.distSlab?.id;
                }

                if (!currentSlabId) {
                    return res.failure({ message: `Slab  not found  pls subscribe to the  schems` });
                }

                const TDS_RATE = Number(process.env.AEPS_TDS_PERCENT || 2) / 100;
                const tds = g => round4(g * TDS_RATE);
                commData.tds = { superAdminTDS: tds(operatorCommissionAmount), whitelabelTDS: tds(wlSlabAmount), masterDistributorTDS: tds(mdSlabAmount), distributorTDS: tds(distSlabAmount), retailerTDS: tds(retSlabAmount) };
                commData.avail = { superAdminAvail: Boolean(commData.users.superAdmin), whitelabelAvail: Boolean(commData.users.companyAdmin), masterDistributorAvail: Boolean(commData.users.masterDistributor), distributorAvail: Boolean(commData.users.distributor), retailerAvail: Boolean(commData.users.retailer) };
                console.log('[AEPS2 CW] Scenario:', commData.scenario, '| Amounts:', JSON.stringify(commData.amounts));
            }
        }
        const statementData = {
            mobileNumber: customerNumber,
            merchantLoginId: existingOnboarding.merchantLoginId,
            latitude,
            longitude,
            aadhaarNumber,
            nationalBankIdenticationNumber: bankIIN || practomindBank.iinno,
            transactionAmount: amountNumber,
            transactionId,
            txtPidData
        }

        // Call Practomind API
        const response = await practomindService.practomindCashWithdrawal(statementData);
        // const response = {
        //     status: true,
        //     message: 'Request Completed',
        //     result: {
        //         transactionAmount: 100,
        //         device: 'MANTRA.MSIPL',
        //         requestTransactionTime: '22/02/2026 07:46:34',
        //         transactionStatus: 'successful',
        //         balanceAmount: 1227.94,
        //         bankRRN: '605307015185',
        //         transactionType: 'CW',
        //         fpTransactionId: 'CWB75592226053074634909I',
        //         merchantTransactionId: 'PUNJI65689214372138'
        //     },
        //     ministatement: '',
        //     outletname: '',
        //     outletmobile: '',
        //     url: 'https://v2.punjikendra.in/api/cashwithdrawalaeps_print/16415',
        //     partnerTxnid: 'ZPAY2602220216495E8E'
        // }
        console.log('[AEPS2 CW] response', response);

        const isSuccess = response.status === true || response.status === 'true';
        const paymentStatus = isSuccess ? 'SUCCESS' : 'FAILED';
        const merchantTransactionId = isSuccess ? (response?.result?.merchantTransactionId || null) : null;

        const retailerCommAmt = commData.amounts.retailerComm || 0, distCommAmt = commData.amounts.distComm || 0;
        const mdCommAmt = commData.amounts.mdComm || 0, companyCommAmt = commData.amounts.companyComm || 0, superAdminCommAmt = commData.amounts.superAdminComm || 0;
        const distShortfallAmt = commData.amounts.distShortfall || 0, mdShortfallAmt = commData.amounts.mdShortfall || 0;
        const wlShortfallAmt = commData.amounts.wlShortfall || 0, saShortfallAmt = commData.amounts.saShortfall || 0;
        const retailerTDS = commData.tds?.retailerTDS || 0, distributorTDS = commData.tds?.distributorTDS || 0;
        const masterDistTDS = commData.tds?.masterDistributorTDS || 0, whitelabelTDS = commData.tds?.whitelabelTDS || 0, superAdminTDS = commData.tds?.superAdminTDS || 0;
        const retailerNetAmt = round4(retailerCommAmt - retailerTDS), distNetAmt = round4(distCommAmt - distributorTDS);
        const mdNetAmt = round4(mdCommAmt - masterDistTDS), companyNetAmt = round4(companyCommAmt - whitelabelTDS), superAdminNetAmt = round4(superAdminCommAmt - superAdminTDS);
        const aepsAvail = commData.avail || { superAdminAvail: false, whitelabelAvail: false, masterDistributorAvail: false, distributorAvail: false, retailerAvail: false };

        let wallet = await model.wallet.findOne({ where: { refId: req.user.id, companyId: req.user.companyId } });
        if (!wallet) wallet = await model.wallet.create({ refId: req.user.id, companyId: req.user.companyId, roleType: req.user.userType, mainWallet: 0, apes1Wallet: 0, apes2Wallet: 0, addedBy: req.user.id, updatedBy: req.user.id });
        const openingAeps2Wallet = round4(wallet.apes2Wallet || 0);
        // Correct wallet credit: amount + (commission - TDS)
        const initiatorCredit = [4, 5].includes(user.userRole) ? (user.userRole === 5 ? round4(amountNumber + retailerNetAmt) : round4(amountNumber + distNetAmt)) : 0;
        const closingAeps2Wallet = isSuccess ? round4(openingAeps2Wallet + initiatorCredit) : openingAeps2Wallet;

        if (isSuccess) {
            const remarkText = `AEPS2 CW-${operator?.operatorName || practomindBank.bankName || bankIIN}`;
            const walletUpdates = [], historyPromises = [];
            if ([4, 5].includes(user.userRole) && commData.users.companyAdmin) {
                if (initiatorCredit > 0) walletUpdates.push(dbService.update(model.wallet, { id: wallet.id }, { apes2Wallet: closingAeps2Wallet, updatedBy: req.user.id }));
                historyPromises.push(dbService.createOne(model.walletHistory, { refId: req.user.id, companyId: req.user.companyId, walletType: 'AEPS2', operator: operator?.operatorName || bankIIN, amount: amountNumber, comm: [4, 5].includes(user.userRole) ? (user.userRole === 5 ? retailerCommAmt : distCommAmt) : 0, surcharge: 0, openingAmt: openingAeps2Wallet, closingAmt: closingAeps2Wallet, credit: initiatorCredit, debit: 0, merchantTransactionId, transactionId, paymentStatus, remark: remarkText, aepsTxnType: 'CW', bankiin: bankIIN, superadminComm: superAdminCommAmt, whitelabelComm: companyCommAmt, masterDistributorCom: mdCommAmt, distributorCom: distCommAmt, retailerCom: retailerCommAmt, superadminCommTDS: superAdminTDS, whitelabelCommTDS: whitelabelTDS, masterDistributorComTDS: masterDistTDS, distributorComTDS: distributorTDS, retailerComTDS: retailerTDS, addedBy: req.user.id, updatedBy: req.user.id, userDetails: { id: existingUser.id, userType: existingUser.userType, mobileNo: existingUser.mobileNo } }));
                if (commData.users.distributor && commData.wallets.distributorWallet && user.userRole === 5) {
                    const dW = commData.wallets.distributorWallet, dO = round4(dW.apes2Wallet || 0), dC = round4(dO + distNetAmt - distShortfallAmt);
                    walletUpdates.push(dbService.update(model.wallet, { id: dW.id }, { apes2Wallet: dC, updatedBy: commData.users.distributor.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.distributor.id, companyId: user.companyId, walletType: 'AEPS2', operator: operator?.operatorName || bankIIN, remark: `${remarkText} - dist comm`, amount: amountNumber, comm: distCommAmt, surcharge: 0, openingAmt: dO, closingAmt: dC, credit: distNetAmt, debit: distShortfallAmt + distributorTDS, merchantTransactionId, transactionId, paymentStatus, aepsTxnType: 'CW', bankiin: bankIIN, distributorCom: distCommAmt, distributorComTDS: distributorTDS, addedBy: commData.users.distributor.id, updatedBy: commData.users.distributor.id }));
                }
                if (commData.users.masterDistributor && commData.wallets.masterDistributorWallet) {
                    const mW = commData.wallets.masterDistributorWallet, mO = round4(mW.apes2Wallet || 0), mC = round4(mO + mdNetAmt - mdShortfallAmt);
                    walletUpdates.push(dbService.update(model.wallet, { id: mW.id }, { apes2Wallet: mC, updatedBy: commData.users.masterDistributor.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.masterDistributor.id, companyId: user.companyId, walletType: 'AEPS2', operator: operator?.operatorName || bankIIN, remark: `${remarkText} - md comm`, amount: amountNumber, comm: mdCommAmt, surcharge: 0, openingAmt: mO, closingAmt: mC, credit: mdNetAmt, debit: mdShortfallAmt + masterDistTDS, merchantTransactionId, transactionId, paymentStatus, aepsTxnType: 'CW', bankiin: bankIIN, masterDistributorCom: mdCommAmt, masterDistributorComTDS: masterDistTDS, addedBy: commData.users.masterDistributor.id, updatedBy: commData.users.masterDistributor.id }));
                }
                if (commData.wallets.companyWallet) {
                    const cW = commData.wallets.companyWallet, cO = round4(cW.apes2Wallet || 0), cC = round4(cO + companyNetAmt - wlShortfallAmt);
                    walletUpdates.push(dbService.update(model.wallet, { id: cW.id }, { apes2Wallet: cC, updatedBy: commData.users.companyAdmin.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.companyAdmin.id, companyId: user.companyId, walletType: 'AEPS2', operator: operator?.operatorName || bankIIN, remark: `${remarkText} - company comm`, amount: amountNumber, comm: companyCommAmt, surcharge: 0, openingAmt: cO, closingAmt: cC, credit: companyNetAmt, debit: wlShortfallAmt + whitelabelTDS, merchantTransactionId, transactionId, paymentStatus, aepsTxnType: 'CW', bankiin: bankIIN, whitelabelComm: companyCommAmt, whitelabelCommTDS: whitelabelTDS, addedBy: commData.users.companyAdmin.id, updatedBy: commData.users.companyAdmin.id }));
                }
                if (commData.wallets.superAdminWallet) {
                    const sW = commData.wallets.superAdminWallet, sO = round4(sW.apes2Wallet || 0), sC = round4(sO + superAdminNetAmt - saShortfallAmt);
                    walletUpdates.push(dbService.update(model.wallet, { id: sW.id }, { apes2Wallet: sC, updatedBy: commData.users.superAdmin.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.superAdmin.id, companyId: 1, walletType: 'AEPS2', operator: operator?.operatorName || bankIIN, remark: `${remarkText} - admin comm`, amount: amountNumber, comm: superAdminCommAmt, surcharge: 0, openingAmt: sO, closingAmt: sC, credit: superAdminNetAmt, debit: saShortfallAmt + superAdminTDS, merchantTransactionId, transactionId, paymentStatus, aepsTxnType: 'CW', bankiin: bankIIN, superadminComm: superAdminCommAmt, superadminCommTDS: superAdminTDS, addedBy: commData.users.superAdmin.id, updatedBy: commData.users.superAdmin.id }));
                }
                await Promise.all([...walletUpdates, ...historyPromises]);
            } else {
                if (initiatorCredit > 0) walletUpdates.push(dbService.update(model.wallet, { id: wallet.id }, { apes2Wallet: closingAeps2Wallet, updatedBy: req.user.id }));
                historyPromises.push(dbService.createOne(model.walletHistory, { refId: req.user.id, companyId: req.user.companyId, walletType: 'AEPS2', operator: operator?.operatorName || bankIIN, amount: amountNumber, comm: 0, surcharge: 0, openingAmt: openingAeps2Wallet, closingAmt: closingAeps2Wallet, credit: initiatorCredit, debit: 0, merchantTransactionId, transactionId, paymentStatus, remark: `AEPS2 CW-${bankIIN}`, aepsTxnType: 'CW', bankiin: bankIIN, addedBy: req.user.id, updatedBy: req.user.id, userDetails: { id: existingUser.id, userType: existingUser.userType, mobileNo: existingUser.mobileNo } }));
                await Promise.all([...walletUpdates, ...historyPromises]);
            }
        }

        // Save to practomindAepsHistory (always)
        const creditToApply = isSuccess ? initiatorCredit : 0;

        console.log('[AEPS2 CW] Preparing to save history. Data to insert:', {
            refId: existingUser.id, companyId: existingUser.companyId,
            transactionId, merchantTransactionId, transactionStatus: response?.result?.transactionStatus || (isSuccess ? 'successful' : 'failed'),
            openingAeps2Wallet, closingAeps2Wallet, credit: creditToApply,
            commissions: {
                superAdminCommAmt, companyCommAmt, mdCommAmt, distCommAmt, retailerCommAmt
            },
            tds: {
                superAdminTDS, whitelabelTDS, masterDistTDS, distributorTDS, retailerTDS
            },
            shortfalls: {
                saShortfallAmt, wlShortfallAmt, mdShortfallAmt, distShortfallAmt
            },
            availability: aepsAvail
        });

        try {
            await dbService.createOne(model.practomindAepsHistory, {
                refId: existingUser.id, companyId: existingUser.companyId, merchantLoginId: existingOnboarding.merchantLoginId,
                transactionType: 'CW', transactionAmount: amountNumber, balanceAmount: response?.result?.balanceAmount || null,
                transactionId, merchantTransactionId, bankRRN: response?.result?.bankRRN || null, fpTransactionId: response?.result?.fpTransactionId || null,
                partnerTxnid: response?.partnerTxnid || null, transactionStatus: response?.result?.transactionStatus || (isSuccess ? 'successful' : 'failed'),
                status: isSuccess, paymentStatus, message: response.message || '', device: response?.result?.device || null,
                requestTransactionTime: response?.result?.requestTransactionTime || null, consumerAadhaarNumber: aadhaarNumber,
                mobileNumber: existingUser.mobileNo, bankIin: practomindBank.aeps_bank_id, latitude: latitude || null, longitude: longitude || null,
                receiptUrl: response?.url || null, outletname: response?.outletname || null, outletmobile: response?.outletmobile || null,
                ministatement: response?.ministatement ? (typeof response.ministatement === 'string' ? response.ministatement : JSON.stringify(response.ministatement)) : null,
                requestPayload: { mobileNumber: customerNumber, latitude, longitude, adhaarNumber: aadhaarNumber, nationalBankIdenticationNumber: bankIIN || practomindBank.iinno, transactionAmount: amountNumber, transactionId },
                responsePayload: response, ipAddress: req.ip || req.connection?.remoteAddress,
                openingAeps2Wallet, closingAeps2Wallet, credit: creditToApply,
                superadminComm: superAdminCommAmt, whitelabelComm: companyCommAmt, masterDistributorCom: mdCommAmt, distributorCom: distCommAmt, retailerCom: retailerCommAmt,
                superadminCommTDS: superAdminTDS, whitelabelCommTDS: whitelabelTDS, masterDistributorComTDS: masterDistTDS, distributorComTDS: distributorTDS, retailerComTDS: retailerTDS,
                ...aepsAvail, addedBy: existingUser.id
            });
        } catch (historyError) {
            console.error('Failed to save cash withdrawal transaction history:', historyError?.message, historyError?.errors);
        }

        if (isSuccess) return res.success({ message: response.message || 'Cash withdrawal successful', data: response });
        return res.failure({ message: response.message || 'Cash withdrawal failed', data: response });
    } catch (err) {
        console.error('Cash Withdrawal error:', err);
        return res.failure({ message: err.message || 'Failed to process cash withdrawal' });
    }
};

const balanceEnquiry = async (req, res) => {
    try {
        const { latitude, longitude, txtPidData, bankIIN, aadhaarNumber, customerNumber } = req.body;
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

        // Validate required fields
        if (!bankIIN) {
            return res.failure({ message: 'Bank IIN is required' });
        }
        if (!aadhaarNumber) {
            return res.failure({ message: 'Aadhaar number is required' });
        }
        if (!customerNumber) {
            return res.failure({ message: 'Customer number is required' });
        }
        if (!txtPidData) {
            return res.failure({ message: 'Biometric data is required' });
        }

        const existingCompany = await dbService.findOne(model.company, {
            id: req.user.companyId
        });

        const practomindBank = await dbService.findOne(model.practomindBankList, {
            iinno: bankIIN,
            isActive: true
        });
        if (!practomindBank) {
            return res.failure({ message: 'Bank Is Not Supported For Balance Enquiry' });
        }

        // Generate unique transaction ID
        const transactionId = generateTransactionID(existingCompany?.companyName);

        // Prepare enquiry data
        const enquiryData = {
            mobileNumber: customerNumber,
            merchantLoginId: existingOnboarding.merchantLoginId,
            latitude: latitude,
            longitude: longitude,
            aadhaarNumber: aadhaarNumber,
            nationalBankIdenticationNumber: bankIIN || practomindBank.iinno,
            transactionId: transactionId,
            txtPidData: txtPidData
        };

        // Call Practomind API
        const result = await practomindService.practomindBalanceEnquiry(enquiryData);
        // const result = {
        //     "status": true,
        //     "message": "Request Completed",
        //     "data": {
        //       "transactionAmount": 0,
        //       "terminalId": "AB076108",
        //       "device": "MANTRA.MSIPL",
        //       "requestTransactionTime": "13/02/2026 11:01:20",
        //       "transactionStatus": "successful",
        //       "balanceAmount": 7999.16,
        //       "bankRRN": "604411091471",
        //       "transactionType": "BE",
        //       "fpTransactionId": "BEM75598526044110120925I",
        //       "merchantTransactionId": "PUNJI641680656303",
        //       "ministatement": "",
        //       "receiptUrl": "https://v2.punjikendra.in/api/cashwithdrawalaeps_print/16189"
        //     }
        //   }
        const response = {
            ...result,
            transactionId
        }
        console.log('response', response);
        // Parse response
        const isSuccess = response.status === true || response.status === 'true' || response.result?.result?.status === true || response.result?.result?.status === 'true';

        // Save transaction to practomindAepsHistory
        const historyData = {
            refId: existingUser.id,
            companyId: existingUser.companyId,
            merchantLoginId: existingOnboarding.merchantLoginId,
            transactionType: 'BE',
            transactionAmount: 0,
            balanceAmount: response?.result?.result?.balanceAmount || response?.result?.balanceAmount || null,
            transactionId: transactionId,
            merchantTransactionId: response?.result?.merchantTransactionId || response?.result?.result?.merchantTransactionId || null,
            bankRRN: response?.result?.bankRRN || response?.result?.result?.bankRRN || null,
            fpTransactionId: response?.result?.fpTransactionId || response?.result?.result?.fpTransactionId || null,
            partnerTxnid: response?.partnerTxnid || response?.result?.result?.partnerTxnid || null,
            transactionStatus: response?.result?.transactionStatus || response?.result?.result?.transactionStatus || (isSuccess ? 'successful' : 'failed'),
            status: isSuccess,
            message: response.message || response?.result?.message || response?.result?.result?.message || '',
            device: response?.result?.device || response?.result?.result?.device || null,
            requestTransactionTime: response?.result?.requestTransactionTime || response?.result?.result?.requestTransactionTime || null,
            consumerAadhaarNumber: aadhaarNumber,
            mobileNumber: existingUser.mobileNo,
            bankIin: practomindBank.aeps_bank_id,
            latitude: latitude || null,
            longitude: longitude || null,
            receiptUrl: response?.url || response?.result?.url || response?.result?.result?.url || null,
            outletname: response?.outletname || response?.result?.outletname || response?.result?.result?.outletname || null,
            outletmobile: response?.outletmobile || response?.result?.outletname || response?.result?.result?.outletmobile || null,
            ministatement: response?.ministatement || response?.result?.ministatement ? (typeof response.ministatement === 'string' ? response.ministatement : JSON.stringify(response.ministatement)) : null,
            requestPayload: {
                mobileNumber: enquiryData.mobileNumber,
                latitude: enquiryData.latitude,
                longitude: enquiryData.longitude,
                adhaarNumber: enquiryData.aadhaarNumber || aadhaarNumber,
                nationalBankIdenticationNumber: bankIIN || practomindBank.iinno,
                transactionId: enquiryData.transactionId
            },
            responsePayload: response,
            ipAddress: req.ip || req.connection?.remoteAddress,
            addedBy: existingUser.id
        };

        try {
            await dbService.createOne(model.practomindAepsHistory, historyData);
        } catch (historyError) {
            console.error('Failed to save balance enquiry transaction history:', historyError);
        }

        if (isSuccess) {
            return res.success({
                message: response.message || response?.result?.message || response?.result?.result?.message || 'Balance enquiry successful',
                data: response
            });
        } else {
            return res.failure({
                message: response.message || response?.result?.message || response?.result?.result?.message || 'Balance enquiry failed',
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
        const { latitude, longitude, txtPidData, bankIIN, aadhaarNumber, customerNumber } = req.body;

        const round4 = (num) => { const n = Number(num); return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 10000) / 10000 : 0; };

        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) return res.failure({ message: 'User not found' });

        const todayDateStr = aepsDailyLoginService.getIndianDateOnly();
        const existingDaily2FA = await dbService.findOne(model.practomindAepsDailyLogin, { refId: req.user.id, companyId: req.user.companyId, loginDate: todayDateStr, isLoggedIn: true });
        if (!existingDaily2FA) return res.failure({ message: 'Please complete daily authentication first' });

        const existingOnboarding = await dbService.findOne(model.practomindAepsOnboarding, { userId: existingUser.id, companyId: existingUser.companyId });
        if (!existingOnboarding || existingOnboarding.onboardingStatus !== 'COMPLETED') return res.failure({ message: 'Onboarding not completed' });

        if (!bankIIN) return res.failure({ message: 'Bank IIN is required' });
        if (!aadhaarNumber) return res.failure({ message: 'Aadhaar number is required' });
        if (!customerNumber) return res.failure({ message: 'Customer number is required' });
        if (!txtPidData) return res.failure({ message: 'Biometric data is required' });

        const existingCompany = await dbService.findOne(model.company, { id: req.user.companyId });
        const practomindBank = await dbService.findOne(model.practomindBankList, { iinno: bankIIN, isActive: true });
        if (!practomindBank) return res.failure({ message: 'Bank Is Not Supported For Mini Statement' });

        const transactionId = generateTransactionID(existingCompany?.companyName || 'GMAXPAY');

        const operator = await dbService.findOne(model.operator, { operatorName: 'AEPS2_MS' });
        const operatorType = operator?.operatorType || 'AEPS2_MS';
        const calcSlabAmount = (slab, base) => {
            if (!slab) return 0;
            const b = Number(base || 0), rc = Number(slab.commAmt || 0);
            if (!Number.isFinite(b) || !Number.isFinite(rc)) return 0;
            return (slab.amtType || 'fix').toLowerCase() === 'per' ? round4((b * rc) / 100) : round4(rc);
        };

        const commData = { users: {}, wallets: {}, slabs: {}, amounts: { retailerComm: 0, distComm: 0, mdComm: 0, companyComm: 0, superAdminComm: 0, wlShortfall: 0, mdShortfall: 0, distShortfall: 0, saShortfall: 0 }, scenario: '' };
        const user = req.user;
        const msBase = 0;

        if (operator && [4, 5].includes(user.userRole)) {
            const [companyAdmin, superAdmin] = await Promise.all([
                dbService.findOne(model.user, { companyId: user.companyId, userRole: 2, isActive: true }),
                dbService.findOne(model.user, { id: 1, companyId: 1, userRole: 1, isActive: true })
            ]);
            if (companyAdmin && superAdmin) {
                commData.users.companyAdmin = companyAdmin;
                commData.users.superAdmin = superAdmin;
                const [companyWallet, superAdminWallet] = await Promise.all([
                    dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                    dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 })
                ]);
                commData.wallets.companyWallet = companyWallet;
                commData.wallets.superAdminWallet = superAdminWallet;

                if (user.userRole === 4) {
                    const distributor = await dbService.findOne(model.user, { id: user.id, companyId: user.companyId, isActive: true });
                    commData.users.distributor = distributor;
                    commData.wallets.distributorWallet = await model.wallet.findOne({ where: { refId: user.id, companyId: user.companyId } });
                    if (distributor.reportingTo === companyAdmin.id || distributor.reportingTo === null) {
                        commData.scenario = 'DIST_DIRECT';
                        const [saSlab, coSlab] = await Promise.all([
                            dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                        ]);
                        commData.slabs.saSlab = saSlab?.find(c => c.roleType === 1 || c.roleName === 'AD');
                        commData.slabs.wlSlab = saSlab?.find(c => c.roleType === 2 || c.roleName === 'WU');
                        commData.slabs.distSlab = coSlab?.find(c => c.roleType === 4 || c.roleName === 'DI');
                    } else {
                        commData.scenario = 'DIST_MD';
                        const md = await dbService.findOne(model.user, { id: distributor.reportingTo, companyId: user.companyId, isActive: true });
                        if (md) {
                            commData.users.masterDistributor = md;
                            commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: md.id, companyId: user.companyId });
                            const [saSlab, coSlab, mdSlab] = await Promise.all([
                                dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: md.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                            ]);
                            commData.slabs.saSlab = saSlab?.find(c => c.roleType === 1 || c.roleName === 'AD');
                            commData.slabs.wlSlab = saSlab?.find(c => c.roleType === 2 || c.roleName === 'WU');
                            commData.slabs.mdSlab = coSlab?.find(c => c.roleType === 3);
                            commData.slabs.distSlab = mdSlab?.find(c => c.roleType === 4);
                        }
                    }
                } else if (user.userRole === 5) {
                    const retailer = await dbService.findOne(model.user, { id: user.id, companyId: user.companyId, isActive: true });
                    commData.users.retailer = retailer;
                    commData.wallets.retailerWallet = await model.wallet.findOne({ where: { refId: user.id, companyId: user.companyId } });
                    let reportingUser = null;
                    if (retailer.reportingTo && retailer.reportingTo !== companyAdmin.id) {
                        reportingUser = await dbService.findOne(model.user, { id: retailer.reportingTo, companyId: user.companyId, isActive: true });
                    }
                    if (!reportingUser || retailer.reportingTo === companyAdmin.id || retailer.reportingTo === null) {
                        commData.scenario = 'RET_DIRECT';
                        const [saSlab, coSlab] = await Promise.all([
                            dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                        ]);
                        commData.slabs.saSlab = saSlab?.find(c => c.roleType === 1 || c.roleName === 'AD');
                        commData.slabs.wlSlab = saSlab?.find(c => c.roleType === 2 || c.roleName === 'WU');
                        commData.slabs.retSlab = coSlab?.find(c => c.roleType === 5);
                    } else if (reportingUser.userRole === 3) {
                        commData.scenario = 'RET_MD';
                        commData.users.masterDistributor = reportingUser;
                        commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: reportingUser.id, companyId: user.companyId });
                        const [saSlab, coSlab, mdSlab] = await Promise.all([
                            dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                            dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: reportingUser.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                        ]);
                        commData.slabs.saSlab = saSlab?.find(c => c.roleType === 1 || c.roleName === 'AD');
                        commData.slabs.wlSlab = saSlab?.find(c => c.roleType === 2 || c.roleName === 'WU');
                        commData.slabs.mdSlab = coSlab?.find(c => c.roleType === 3);
                        commData.slabs.retSlab = mdSlab?.find(c => c.roleType === 5);
                    } else if (reportingUser.userRole === 4) {
                        commData.users.distributor = reportingUser;
                        commData.wallets.distributorWallet = await dbService.findOne(model.wallet, { refId: reportingUser.id, companyId: user.companyId });
                        if (reportingUser.reportingTo === companyAdmin.id || reportingUser.reportingTo === null) {
                            commData.scenario = 'RET_DIST_CO';
                            const [saSlab, coSlab, distSlab] = await Promise.all([
                                dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: reportingUser.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                            ]);
                            commData.slabs.saSlab = saSlab?.find(c => c.roleType === 1 || c.roleName === 'AD');
                            commData.slabs.wlSlab = saSlab?.find(c => c.roleType === 2 || c.roleName === 'WU');
                            commData.slabs.distSlab = coSlab?.find(c => c.roleType === 4);
                            commData.slabs.retSlab = distSlab?.find(c => c.roleType === 5);
                        } else {
                            commData.scenario = 'RET_DIST_MD';
                            const md = await dbService.findOne(model.user, { id: reportingUser.reportingTo, companyId: user.companyId, isActive: true });
                            if (md) {
                                commData.users.masterDistributor = md;
                                commData.wallets.masterDistributorWallet = await dbService.findOne(model.wallet, { refId: md.id, companyId: user.companyId });
                                const [saSlab, coSlab, mdSlab, distSlab] = await Promise.all([
                                    dbService.findAll(model.commSlab, { companyId: 1, addedBy: superAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                    dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: companyAdmin.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                    dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: md.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] }),
                                    dbService.findAll(model.commSlab, { companyId: user.companyId, addedBy: reportingUser.id, operatorId: operator.id, operatorType }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName', 'operatorId'] })
                                ]);
                                commData.slabs.saSlab = saSlab?.find(c => c.roleType === 1 || c.roleName === 'AD');
                                commData.slabs.wlSlab = saSlab?.find(c => c.roleType === 2 || c.roleName === 'WU');
                                commData.slabs.mdSlab = coSlab?.find(c => c.roleType === 3);
                                commData.slabs.distSlab = mdSlab?.find(c => c.roleType === 4);
                                commData.slabs.retSlab = distSlab?.find(c => c.roleType === 5);
                            }
                        }
                    }
                }

                const operatorCommissionAmount = operator?.comm ? calcSlabAmount({ amtType: operator.amtType, commAmt: operator.comm }, msBase) : 0;
                const saSlabAmount = commData.slabs.saSlab ? calcSlabAmount(commData.slabs.saSlab, msBase) : 0;
                const wlSlabAmount = commData.slabs.wlSlab ? calcSlabAmount(commData.slabs.wlSlab, msBase) : 0;
                let mdSlabAmount = commData.slabs.mdSlab ? calcSlabAmount(commData.slabs.mdSlab, msBase) : 0;
                let distSlabAmount = commData.slabs.distSlab ? calcSlabAmount(commData.slabs.distSlab, msBase) : 0;
                let retSlabAmount = commData.slabs.retSlab ? calcSlabAmount(commData.slabs.retSlab, msBase) : 0;

                let companyCost = 0;
                if (commData.users.masterDistributor) companyCost = mdSlabAmount;
                else if (commData.users.distributor) companyCost = distSlabAmount;
                else companyCost = retSlabAmount;

                // Super Admin
                commData.amounts.superAdminComm = Math.max(0, round4(operatorCommissionAmount - wlSlabAmount));
                if (wlSlabAmount > operatorCommissionAmount) {
                    commData.amounts.saShortfall = round4(wlSlabAmount - operatorCommissionAmount);
                } else {
                    commData.amounts.saShortfall = 0;
                }

                // Company (WL)
                commData.amounts.companyComm = Math.max(0, round4(wlSlabAmount - companyCost));
                if (companyCost > wlSlabAmount) {
                    commData.amounts.wlShortfall = round4(companyCost - wlSlabAmount);
                }

                // Master Distributor
                if (commData.users.masterDistributor) {
                    let mdCost = commData.users.distributor ? distSlabAmount : retSlabAmount;
                    commData.amounts.mdComm = Math.max(0, round4(mdSlabAmount - mdCost));
                    if (mdCost > mdSlabAmount) {
                        commData.amounts.mdShortfall = round4(mdCost - mdSlabAmount);
                    }
                }

                // Distributor
                if (commData.users.distributor) {
                    commData.amounts.distComm = Math.max(0, round4(distSlabAmount - retSlabAmount));
                    if (retSlabAmount > distSlabAmount) {
                        commData.amounts.distShortfall = round4(retSlabAmount - distSlabAmount);
                    }
                }

                // Retailer (User)
                commData.amounts.retailerComm = retSlabAmount;

                const TDS_RATE = Number(process.env.AEPS_TDS_PERCENT || 2) / 100;
                const tds = g => round4(g * TDS_RATE);
                commData.tds = { superAdminTDS: tds(operatorCommissionAmount), whitelabelTDS: tds(wlSlabAmount), masterDistributorTDS: tds(mdSlabAmount), distributorTDS: tds(distSlabAmount), retailerTDS: tds(retSlabAmount) };
                commData.avail = { superAdminAvail: Boolean(commData.users.superAdmin), whitelabelAvail: Boolean(commData.users.companyAdmin), masterDistributorAvail: Boolean(commData.users.masterDistributor), distributorAvail: Boolean(commData.users.distributor), retailerAvail: Boolean(commData.users.retailer) };
                console.log('[AEPS2 MS] Scenario:', commData.scenario, '| Amounts:', JSON.stringify(commData.amounts));
            }
        }
        const statementData = {
            mobileNumber: customerNumber,
            merchantLoginId: existingOnboarding.merchantLoginId,
            latitude: latitude,
            longitude: longitude,
            aadhaarNumber: aadhaarNumber,
            nationalBankIdenticationNumber: bankIIN || practomindBank.iinno,
            transactionId: transactionId,
            txtPidData: txtPidData
        };
        // Call Practomind API
        const response = await practomindService.practomindMiniStatement(statementData);
        // const response = {
        //     "status": true,
        //     "message": "Request Completed",
        //     "transactionStatus": "successful",
        //     "ministatement": [
        //       {
        //         "date": "13/02/2026",
        //         "txnType": "Dr",
        //         "amount": "20.0",
        //         "narration": "UPI:60445011118"
        //       },
        //       {
        //         "date": "13/02/2026",
        //         "txnType": "Dr",
        //         "amount": "60.0",
        //         "narration": "UPI:10113977679"
        //       },
        //       {
        //         "date": "13/02/2026",
        //         "txnType": "Dr",
        //         "amount": "10.0",
        //         "narration": "UPI:64108299511"
        //       },
        //       {
        //         "date": "13/02/2026",
        //         "txnType": "Dr",
        //         "amount": "5.0",
        //         "narration": "UPI:64100599965"
        //       },
        //       {
        //         "date": "12/02/2026",
        //         "txnType": "Cr",
        //         "amount": "100.0",
        //         "narration": "IMPS/P2A-604322"
        //       },
        //       {
        //         "date": "12/02/2026",
        //         "txnType": "Cr",
        //         "amount": "100.0",
        //         "narration": "IMPS/P2A-604322"
        //       },
        //       {
        //         "date": "12/02/2026",
        //         "txnType": "Dr",
        //         "amount": "39.0",
        //         "narration": "UPI:64094138362"
        //       },
        //       {
        //         "date": "12/02/2026",
        //         "txnType": "Dr",
        //         "amount": "60.0",
        //         "narration": "UPI:20554525141"
        //       },
        //       {
        //         "date": "12/02/2026",
        //         "txnType": "Dr",
        //         "amount": "100.0",
        //         "narration": "ISOF-CW/6043203"
        //       }
        //     ],
        //     "url": "https://v2.punjikendra.in/api/ministmtaeps_print/16191",
        //     "balanceAmount": 7999.16,
        //     "partnerTxnid": "ZPAY2602130537E7EE11",
        //     "utr": "604411127454"
        //   }


        // Parse response
        const isSuccess = response.status === true || response.status === 'true';
        const paymentStatus = isSuccess ? 'SUCCESS' : 'FAILED';
        const merchantTransactionId = response?.result?.merchantTransactionId || null;

        const retailerCommAmt = commData.amounts.retailerComm || 0, distCommAmt = commData.amounts.distComm || 0;
        const mdCommAmt = commData.amounts.mdComm || 0, companyCommAmt = commData.amounts.companyComm || 0, superAdminCommAmt = commData.amounts.superAdminComm || 0;
        const distShortfallAmt = commData.amounts.distShortfall || 0, mdShortfallAmt = commData.amounts.mdShortfall || 0;
        const wlShortfallAmt = commData.amounts.wlShortfall || 0, saShortfallAmt = commData.amounts.saShortfall || 0;
        const retailerTDS = commData.tds?.retailerTDS || 0, distributorTDS = commData.tds?.distributorTDS || 0;
        const masterDistTDS = commData.tds?.masterDistributorTDS || 0, whitelabelTDS = commData.tds?.whitelabelTDS || 0, superAdminTDS = commData.tds?.superAdminTDS || 0;

        const retailerNetAmt = round4(retailerCommAmt - retailerTDS), distNetAmt = round4(distCommAmt - distributorTDS);
        const mdNetAmt = round4(mdCommAmt - masterDistTDS), companyNetAmt = round4(companyCommAmt - whitelabelTDS), superAdminNetAmt = round4(superAdminCommAmt - superAdminTDS);
        const aepsAvail = commData.avail || { superAdminAvail: false, whitelabelAvail: false, masterDistributorAvail: false, distributorAvail: false, retailerAvail: false };

        let wallet = await model.wallet.findOne({ where: { refId: req.user.id, companyId: req.user.companyId } });
        if (!wallet) wallet = await model.wallet.create({ refId: req.user.id, companyId: req.user.companyId, roleType: req.user.userType, mainWallet: 0, apes1Wallet: 0, apes2Wallet: 0, addedBy: req.user.id, updatedBy: req.user.id });
        const openingAeps2Wallet = round4(wallet.apes2Wallet || 0);
        const initiatorCredit = [4, 5].includes(user.userRole) ? (user.userRole === 5 ? retailerNetAmt : distNetAmt) : 0;
        const closingAeps2Wallet = isSuccess ? round4(openingAeps2Wallet + initiatorCredit) : openingAeps2Wallet;

        if (isSuccess) {
            const remarkText = `AEPS2 MS-${operator?.operatorName || practomindBank.bankName || bankIIN}`;
            const walletUpdates = [], historyPromises = [];
            if ([4, 5].includes(user.userRole) && commData.users.companyAdmin) {
                if (initiatorCredit > 0) walletUpdates.push(dbService.update(model.wallet, { id: wallet.id }, { apes2Wallet: closingAeps2Wallet, updatedBy: req.user.id }));
                historyPromises.push(dbService.createOne(model.walletHistory, { refId: req.user.id, companyId: req.user.companyId, walletType: 'AEPS2', operator: operator?.operatorName || bankIIN, amount: 0, comm: initiatorCredit, surcharge: 0, openingAmt: openingAeps2Wallet, closingAmt: closingAeps2Wallet, credit: initiatorCredit, debit: 0, merchantTransactionId, transactionId, paymentStatus, remark: remarkText, aepsTxnType: 'MS', bankiin: bankIIN, superadminComm: superAdminCommAmt, whitelabelComm: companyCommAmt, masterDistributorCom: mdCommAmt, distributorCom: distCommAmt, retailerCom: retailerCommAmt, superadminCommTDS: superAdminTDS, whitelabelCommTDS: whitelabelTDS, masterDistributorComTDS: masterDistTDS, distributorComTDS: distributorTDS, retailerComTDS: retailerTDS, addedBy: req.user.id, updatedBy: req.user.id, userDetails: { id: existingUser.id, userType: existingUser.userType, mobileNo: existingUser.mobileNo } }));
                if (commData.users.distributor && commData.wallets.distributorWallet && user.userRole === 5) {
                    const dW = commData.wallets.distributorWallet, dO = round4(dW.apes2Wallet || 0), dC = round4(dO + distNetAmt - distShortfallAmt);
                    walletUpdates.push(dbService.update(model.wallet, { id: dW.id }, { apes2Wallet: dC, updatedBy: commData.users.distributor.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.distributor.id, companyId: user.companyId, walletType: 'AEPS2', operator: operator?.operatorName || bankIIN, remark: `${remarkText} - dist comm`, amount: 0, comm: distCommAmt, surcharge: 0, openingAmt: dO, closingAmt: dC, credit: distNetAmt, debit: distShortfallAmt + distributorTDS, merchantTransactionId, transactionId, paymentStatus, aepsTxnType: 'MS', bankiin: bankIIN, distributorCom: distCommAmt, distributorComTDS: distributorTDS, addedBy: commData.users.distributor.id, updatedBy: commData.users.distributor.id }));
                }
                if (commData.users.masterDistributor && commData.wallets.masterDistributorWallet) {
                    const mW = commData.wallets.masterDistributorWallet, mO = round4(mW.apes2Wallet || 0), mC = round4(mO + mdNetAmt - mdShortfallAmt);
                    walletUpdates.push(dbService.update(model.wallet, { id: mW.id }, { apes2Wallet: mC, updatedBy: commData.users.masterDistributor.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.masterDistributor.id, companyId: user.companyId, walletType: 'AEPS2', operator: operator?.operatorName || bankIIN, remark: `${remarkText} - md comm`, amount: 0, comm: mdCommAmt, surcharge: 0, openingAmt: mO, closingAmt: mC, credit: mdNetAmt, debit: mdShortfallAmt + masterDistTDS, merchantTransactionId, transactionId, paymentStatus, aepsTxnType: 'MS', bankiin: bankIIN, masterDistributorCom: mdCommAmt, masterDistributorComTDS: masterDistTDS, addedBy: commData.users.masterDistributor.id, updatedBy: commData.users.masterDistributor.id }));
                }
                if (commData.wallets.companyWallet) {
                    const cW = commData.wallets.companyWallet, cO = round4(cW.apes2Wallet || 0), cC = round4(cO + companyNetAmt - wlShortfallAmt);
                    walletUpdates.push(dbService.update(model.wallet, { id: cW.id }, { apes2Wallet: cC, updatedBy: commData.users.companyAdmin.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.companyAdmin.id, companyId: user.companyId, walletType: 'AEPS2', operator: operator?.operatorName || bankIIN, remark: `${remarkText} - company comm`, amount: 0, comm: companyCommAmt, surcharge: 0, openingAmt: cO, closingAmt: cC, credit: companyNetAmt, debit: wlShortfallAmt + whitelabelTDS, merchantTransactionId, transactionId, paymentStatus, aepsTxnType: 'MS', bankiin: bankIIN, whitelabelComm: companyCommAmt, whitelabelCommTDS: whitelabelTDS, addedBy: commData.users.companyAdmin.id, updatedBy: commData.users.companyAdmin.id }));
                }
                if (commData.wallets.superAdminWallet) {
                    const sW = commData.wallets.superAdminWallet, sO = round4(sW.apes2Wallet || 0), sC = round4(sO + superAdminNetAmt - saShortfallAmt);
                    walletUpdates.push(dbService.update(model.wallet, { id: sW.id }, { apes2Wallet: sC, updatedBy: commData.users.superAdmin.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.superAdmin.id, companyId: 1, walletType: 'AEPS2', operator: operator?.operatorName || bankIIN, remark: `${remarkText} - admin comm`, amount: 0, comm: superAdminCommAmt, surcharge: 0, openingAmt: sO, closingAmt: sC, credit: superAdminNetAmt, debit: saShortfallAmt + superAdminTDS, merchantTransactionId, transactionId, paymentStatus, aepsTxnType: 'MS', bankiin: bankIIN, superadminComm: superAdminCommAmt, superadminCommTDS: superAdminTDS, addedBy: commData.users.superAdmin.id, updatedBy: commData.users.superAdmin.id }));
                }
                await Promise.all([...walletUpdates, ...historyPromises]);
            } else {
                if (initiatorCredit > 0) walletUpdates.push(dbService.update(model.wallet, { id: wallet.id }, { apes2Wallet: closingAeps2Wallet, updatedBy: req.user.id }));
                historyPromises.push(dbService.createOne(model.walletHistory, { refId: req.user.id, companyId: req.user.companyId, walletType: 'AEPS2', operator: operator?.operatorName || bankIIN, amount: 0, comm: 0, surcharge: 0, openingAmt: openingAeps2Wallet, closingAmt: closingAeps2Wallet, credit: initiatorCredit, debit: 0, merchantTransactionId, transactionId, paymentStatus, remark: `AEPS2 MS-${bankIIN}`, aepsTxnType: 'MS', bankiin: bankIIN, addedBy: req.user.id, updatedBy: req.user.id, userDetails: { id: existingUser.id, userType: existingUser.userType, mobileNo: existingUser.mobileNo } }));
                await Promise.all([...walletUpdates, ...historyPromises]);
            }
        }

        const creditToApply = isSuccess ? initiatorCredit : 0;

        console.log('[AEPS2 MS] Preparing to save history. Data to insert:', {
            refId: existingUser.id, companyId: existingUser.companyId,
            transactionId, merchantTransactionId, transactionStatus: response?.transactionStatus || response?.result?.transactionStatus || (isSuccess ? 'successful' : 'failed'),
            openingAeps2Wallet, closingAeps2Wallet, credit: creditToApply,
            commissions: {
                superAdminCommAmt, companyCommAmt, mdCommAmt, distCommAmt, retailerCommAmt
            },
            tds: {
                superAdminTDS, whitelabelTDS, masterDistTDS, distributorTDS, retailerTDS
            },
            shortfalls: {
                saShortfallAmt, wlShortfallAmt, mdShortfallAmt, distShortfallAmt
            },
            availability: aepsAvail
        });

        try {
            await dbService.createOne(model.practomindAepsHistory, {
                refId: existingUser.id, companyId: existingUser.companyId, merchantLoginId: existingOnboarding.merchantLoginId,
                transactionType: 'MS', transactionAmount: 0, balanceAmount: response?.balanceAmount || response?.result?.balanceAmount || null,
                transactionId, merchantTransactionId, bankRRN: response?.result?.bankRRN || response?.utr || null,
                fpTransactionId: response?.result?.fpTransactionId || null, partnerTxnid: response?.partnerTxnid || null,
                transactionStatus: response?.transactionStatus || response?.result?.transactionStatus || (isSuccess ? 'successful' : 'failed'),
                status: isSuccess, paymentStatus, message: response.message || '',
                device: response?.result?.device || null, requestTransactionTime: response?.result?.requestTransactionTime || null,
                consumerAadhaarNumber: aadhaarNumber, mobileNumber: existingUser.mobileNo,
                bankIin: practomindBank.aeps_bank_id, latitude: latitude || null, longitude: longitude || null,
                receiptUrl: response?.url || null, outletname: response?.outletname || null, outletmobile: response?.outletmobile || null,
                ministatement: response?.ministatement ? (typeof response.ministatement === 'string' ? response.ministatement : JSON.stringify(response.ministatement)) : null,
                requestPayload: { mobileNumber: customerNumber, latitude, longitude, adhaarNumber: aadhaarNumber, nationalBankIdenticationNumber: bankIIN || practomindBank.iinno, transactionId },
                responsePayload: response, ipAddress: req.ip || req.connection?.remoteAddress,
                openingAeps2Wallet, closingAeps2Wallet, credit: creditToApply,
                superadminComm: superAdminCommAmt, whitelabelComm: companyCommAmt, masterDistributorCom: mdCommAmt, distributorCom: distCommAmt, retailerCom: retailerCommAmt,
                superadminCommTDS: superAdminTDS, whitelabelCommTDS: whitelabelTDS, masterDistributorComTDS: masterDistTDS, distributorComTDS: distributorTDS, retailerComTDS: retailerTDS,
                ...aepsAvail, addedBy: existingUser.id
            });
        } catch (historyError) {
            console.error('Failed to save mini statement transaction history:', historyError?.message, historyError?.errors);
        }

        if (isSuccess) return res.success({ message: response.message || 'Mini statement retrieved successfully', data: response });
        return res.failure({ message: response.message || 'Failed to retrieve mini statement', data: response });
    } catch (err) {
        console.error('Mini Statement error:', err);
        return res.failure({ message: err.message || 'Failed to retrieve mini statement' });
    }
};

const bankList = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const banks = await dbService.findAll(model.practomindBankList, {
            isActive: true
        });

        // Map to response format with CDN URLs for logos
        const formattedBankList = banks.map(bank => {
            const bankData = bank.toJSON ? bank.toJSON() : bank;
            return {
                bankIIN: bankData.iinno,
                bankName: bankData.bankName,
                bankLogo: imageService.getImageUrl(bankData.bankLogo, false)
            };
        });

        return res.success({
            message: 'Bank list retrieved successfully',
            data: formattedBankList
        });
    }
    catch (err) {
        console.error('Bank List error:', err);
        return res.failure({ message: err.message || 'Failed to retrieve bank list' });
    }
};

const recentBanks = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        const aepsTransactions = await dbService.findAll(
            model.practomindAepsHistory,
            {
                refId: req.user.id,
                companyId: req.user.companyId,
                bankIin: { [Op.ne]: null }
            },
            {
                attributes: ['bankIin', 'createdAt'],
                sort: { createdAt: -1 }
            }
        );
        const uniqueBankIINs = [];
        const seenBankIINs = new Set();
        for (const txn of aepsTransactions) {
            const bankIIN = txn.bankIin ? String(txn.bankIin).trim() : null;
            if (bankIIN && !seenBankIINs.has(bankIIN)) {
                seenBankIINs.add(bankIIN);
                uniqueBankIINs.push(bankIIN);
                if (uniqueBankIINs.length >= 4) break;
            }
        }
        console.log('uniqueBankIINs', uniqueBankIINs);

        if (uniqueBankIINs.length === 0) {
            return res.success({
                message: 'Recent banks retrieved successfully',
                data: []
            });
        }

        const banks = await dbService.findAll(
            model.practomindBankList,
            {
                aeps_bank_id: { [Op.in]: uniqueBankIINs },
                isActive: true
            }
        );

        const bankMap = new Map();
        banks.forEach((bank) => {
            const bankData = bank.toJSON ? bank.toJSON() : bank;
            bankMap.set(bankData.aeps_bank_id, {
                bankIIN: bankData.iinno,
                bankName: bankData.bankName,
                bankLogo: imageService.getImageUrl(bankData.bankLogo, false)
            });
        });

        const recentBanksData = uniqueBankIINs
            .map((bankIIN) => bankMap.get(bankIIN))
            .filter(Boolean);

        return res.success({
            message: 'Recent banks retrieved successfully',
            data: recentBanksData
        });
    }
    catch (err) {
        console.error('Recent Banks error:', err);
        console.error('Error stack:', err.stack);
        return res.failure({ message: err.message || 'Failed to retrieve recent banks' });
    }
};

const aepsTransactionHistory = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId,
            isActive: true
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        const userRole = existingUser.userRole;
        const userId = existingUser.id;
        const companyId = existingUser.companyId;

        if (![3, 4, 5].includes(userRole)) {
            return res.failure({
                message:
                    'Access denied. Only Master Distributor, Distributor, and Retailer can access transaction history.'
            });
        }

        const dataToFind = req.body || {};
        let options = {};
        let query = { companyId: companyId };

        if (userRole === 4 || userRole === 5) {
            query.refId = userId;
            query.companyId = companyId;
        } else if (userRole === 3) {
            const reportingUsers = await dbService.findAll(
                model.user,
                {
                    reportingTo: userId,
                    companyId: companyId,
                    isDeleted: false,
                    userRole: { [Op.in]: [4, 5] }
                },
                {
                    attributes: ['id']
                }
            );
            const reportingUserIds = reportingUsers.map((user) => user.id);
            query.refId = { [Op.in]: [userId, ...reportingUserIds] };
        }

        if (dataToFind && dataToFind.query) {
            query = { ...query, ...dataToFind.query };
        }

        if (dataToFind && dataToFind.options !== undefined) {
            options = { ...dataToFind.options };
        }

        if (dataToFind?.customSearch && typeof dataToFind.customSearch === 'object') {
            const keys = Object.keys(dataToFind.customSearch);
            const orConditions = [];

            keys.forEach((key) => {
                const value = dataToFind.customSearch[key];
                if (value === undefined || value === null || String(value).trim() === '') return;

                orConditions.push({
                    [key]: {
                        [Op.iLike]: `%${String(value).trim()}%`
                    }
                });
            });

            if (orConditions.length > 0) {
                query = {
                    ...query,
                    [Op.or]: orConditions
                };
            }
        }

        const result = await dbService.paginate(model.practomindAepsHistory, query, options);

        return res.success({
            message: 'AEPS2 transaction history retrieved successfully',
            data: result?.data || [],
            total: result?.total || 0,
            paginator: result?.paginator
        });
    } catch (error) {
        console.error('AEPS2 transaction history error', error);
        return res.failure({ message: error.message || 'Unable to retrieve AEPS2 transaction history' });
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
    miniStatement,
    bankList,
    recentBanks,
    aepsTransactionHistory
};
