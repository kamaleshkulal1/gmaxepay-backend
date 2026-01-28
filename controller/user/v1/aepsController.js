const asl = require('../../../services/asl');
const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const aepsDailyLoginService = require('../../../services/aepsDailyLoginService');
const { generateTransactionID } = require('../../../utils/transactionID');
const googleMap = require('../../../services/googleMap');
const imageService = require('../../../services/imageService');
const { Op } = require('sequelize');


const getOnboardingStatus = async (req, res) => {
    try{
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if(!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
            userId: existingUser.id,
            companyId: existingUser.companyId,
        });
        
        // Daily 2FA status (IST date based)
        await aepsDailyLoginService.logoutPreviousDaySessions(req.user.id, req.user.companyId);
        const todayDateStr = aepsDailyLoginService.getIndianDateOnly();
        const existingDaily2FA = await dbService.findOne(model.aepsDailyLogin, {
            refId: req.user.id,
            companyId: req.user.companyId,
            loginDate: todayDateStr
        });
        const isDaily2FACompleted = Boolean(existingDaily2FA);
        const nextEligibleAt = aepsDailyLoginService.getNextMidnightIST();
        
        // Handle case when onboarding doesn't exist yet (pending)
        if (!existingAepsOnboarding) {
            const statusData = {
                onboardingStatus: 'PENDING',
                currentStep: 'aepsOnboarding',
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
                bankKycOtp: {
                    status: 'pending',
                    isCompleted: false
                },
                bankKycBiometric: {
                    status: 'pending',
                    isCompleted: false
                },
                '2faAuthentication': {
                    status: isDaily2FACompleted ? 'success' : 'pending',
                    isCompleted: isDaily2FACompleted,
                    loginDate: todayDateStr,
                    nextEligibleAt: nextEligibleAt ? nextEligibleAt.toISOString() : null
                }
            };
            return res.success({ message: 'AEPS onboarding status', data: statusData });
        }
        
        const isAepsOnboardingComplete = Boolean(existingAepsOnboarding.merchantStatus);
        const isOtpValidated = Boolean(existingAepsOnboarding.isOtpValidated);
        const isBioMetricValidated = Boolean(existingAepsOnboarding.isBioMetricValidated);
        const isBankKycOtpValidated = Boolean(existingAepsOnboarding.isBankKycOtpValidated);
        const isBankKycBiometricValidated = Boolean(existingAepsOnboarding.isBankKycBiometricValidated);
        
        // Determine current step and overall status
        let currentStep = 'aepsOnboarding';
        if (!isAepsOnboardingComplete) {
            currentStep = 'aepsOnboarding';
        } else if (!isOtpValidated) {
            currentStep = 'ekycOtp';
        } else if (!isBioMetricValidated) {
            currentStep = 'ekycBiometric';
        } else if (!isBankKycOtpValidated) {
            currentStep = 'bankKycOtp';
        } else if (!isBankKycBiometricValidated) {
            currentStep = 'bankKycBiometric';
        } else if (!isDaily2FACompleted) {
            currentStep = '2faAuthentication';
        } else {
            currentStep = 'aepsTransaction';
        }
        
        const isAllCompleted = isAepsOnboardingComplete && isOtpValidated && isBioMetricValidated && 
                              isBankKycOtpValidated && isBankKycBiometricValidated;
        const overallStatus = isAllCompleted ? 'COMPLETED' : 'PENDING';
        
        // Update onboardingStatus in database if it needs to be updated
        if (existingAepsOnboarding.onboardingStatus !== overallStatus) {
            await dbService.update(
                model.aepsOnboarding,
                { id: existingAepsOnboarding.id },
                { onboardingStatus: overallStatus }
            );
        }
        
        const statusData = {
            ...existingAepsOnboarding.toJSON ? existingAepsOnboarding.toJSON() : existingAepsOnboarding,
            onboardingStatus: overallStatus,
            currentStep: currentStep,
            aepsOnboarding: {
                status: isAepsOnboardingComplete ? 'success' : 'pending',
                isCompleted: isAepsOnboardingComplete
            },
            ekycOtp: {
                status: isOtpValidated ? 'success' : 'pending',
                isCompleted: isOtpValidated
            },
            ekycBiometric: {
                status: isBioMetricValidated ? 'success' : 'pending',
                isCompleted: isBioMetricValidated
            },
            bankKycOtp: {
                status: isBankKycOtpValidated ? 'success' : 'pending',
                isCompleted: isBankKycOtpValidated
            },
            bankKycBiometric: {
                status: isBankKycBiometricValidated ? 'success' : 'pending',
                isCompleted: isBankKycBiometricValidated
            },
            aeps2FaAuthentication: {
                status: isDaily2FACompleted ? 'success' : 'pending',
                isCompleted: isDaily2FACompleted,
                loginDate: todayDateStr,
                nextEligibleAt: nextEligibleAt ? nextEligibleAt.toISOString() : null
            }
        };
        
        return res.success({ message: 'AEPS onboarding status', data: statusData });
    }
    catch (error) {
        console.error('AEPS onboarding status error', error);
        return res.failure({ message: error.message || 'Unable to process AEPS onboarding status' });
    }
}

// Onboarding Agent
const aepsOnboarding = async (req, res) => {
    try {
        const REQUIRED_FIELD_ERRORS = {
            retailerFirstName: 'Enter your first name [PAR001]',
            retailerLastName: 'Enter your last name [PAR001]',
            retailerEmail: 'Enter your email [PAR002]',
            phone: 'Enter your phone [PAR003]',
            retailerDob: 'Enter your date of birth [PAR004]',
            retailerCity: 'Enter your city [PAR005]',
            retailerState: 'Enter your state [PAR006]',
            retailerCountry: 'Enter your country [PAR007]',
            retailerPincode: 'Enter your pincode [PAR008]',
            aadharNo: 'Enter your aadhaar no [PAR009]',
            panNo: 'Enter your pancard no [PAR010]',
            retailerAadhaarFrontImage: 'Enter aadhaar front image [PAR011]',
            retailerAadhaarBackImage: 'Enter aadhaar back image [PAR012]',
            retailerPanFrontImage: 'Enter pan card front image [PAR013]',
            retailerPanBackImage: 'Enter pancard back image [PAR014]',
            retailerShopImage: 'Enter your shop image [PAR015]',
            bankAccountNo: 'Enter your bank account no [PAR016]',
            bankIfsc: 'Enter your bank IFSC [PAR017]',
            latitude: 'Enter your latitude [PAR018]',
            longitude: 'Enter your longitude [PAR019]',
            retailerShopName: 'Enter your shop name [PAR020]',
            shopAddress: 'Enter your shop address [PAR021]',
            shopCity: 'Enter your shop city [PAR022]',
            shopDistrict: 'Enter your shop district [PAR023]',
            shopState: 'Enter your shop state [PAR024]',
            shopPincode: 'Enter your shop pincode [PAR025]'
        };

        const pickValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

        const formatDob = (dob) => {
            if (!dob) {
                return undefined;
            }
            if (/^\d{2}-\d{2}-\d{4}$/.test(dob)) {
                return dob;
            }
            const parsed = new Date(dob);
            if (Number.isNaN(parsed.getTime())) {
                return dob;
            }
            const day = `${parsed.getDate()}`.padStart(2, '0');
            const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
            return `${day}-${month}-${parsed.getFullYear()}`;
        };

        const buildImageUrl = (image) => {
            if (!image) {
                return undefined;
            }
            const key = typeof image === 'string' ? image : image.key || image.path || image.Location;
            if (!key) {
                return undefined;
            }
            const baseCdnUrl = process.env.AWS_CDN_URL ? process.env.AWS_CDN_URL.replace(/\/$/, '') : '';
            const normalizedKey = key.replace(/^\//, '');
            return baseCdnUrl ? `${baseCdnUrl}/${normalizedKey}` : normalizedKey;
        };

        const validatePayload = (payload) => {
            for (const [field, message] of Object.entries(REQUIRED_FIELD_ERRORS)) {
                const value = payload[field];
                const isEmpty = value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
                if (isEmpty) {
                    return message;
                }
            }
            return null;
        };
        const [
            existingUser,
            existingCompany,
            outletDetails,
            customerBankDetails,
            existingAepsOnboarding
        ] = await Promise.all([
            dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId }),
            dbService.findOne(model.company, { id: req.user.companyId }),
            dbService.findOne(model.outlet, { refId: req.user.id }),
            dbService.findOne(model.customerBank, { refId: req.user.id }),
            dbService.findOne(model.aepsOnboarding, {
                userId: req.user.id,
                companyId: req.user.companyId,
                merchantStatus: true
            })
        ]);

        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        if (!existingCompany) {
            return res.failure({ message: 'Company not found' });
        }

        if (!outletDetails) {
            return res.failure({ message: 'Outlet not found' });
        }
        if (!customerBankDetails) {
            return res.failure({ message: 'Customer bank not found' });
        }
        if(existingAepsOnboarding && existingAepsOnboarding.onboardingStatus === 'COMPLETED') {
            return res.failure({ message: 'AEPS onboarding already completed' });
        }

        const retailerLatitude = pickValue(existingUser.latitude, outletDetails.latitude);
        const retailerLongitude = pickValue(existingUser.longitude, outletDetails.longitude);
        const retailerCountry = pickValue(existingUser.country, outletDetails.shopCountry, 'India');

        const safeName = (existingUser.name || '').trim();
        const nameParts = safeName ? safeName.split(/\s+/).filter(Boolean) : [];
        const retailerFirstName = existingUser.firstName || nameParts[0];
        const retailerLastName = existingUser.lastName || (nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0]);
        const retailerMiddleName = existingUser.middleName || (nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : undefined);

        console.log("existingiUser", existingUser.aadharDetails);
        const payload = {
            retailerFirstName,
            retailerMiddleName,
            retailerLastName,
            retailerEmail: existingUser.email,
            phone: existingUser.mobileNo,
            retailerDob: formatDob(existingUser.dob),
            retailerCity: existingUser.city || outletDetails.shopCity,
            retailerState: existingUser.state || outletDetails.shopState,
            retailerCountry,
            retailerPincode: existingUser.zipcode || outletDetails.shopPincode,
            aadharNo: existingUser.aadharDetails?.aadhaarNumber || '829763289274',
            panNo: existingUser.panDetails?.data?.pan_number || existingCompany.companyPan,
            bankAccountNo: customerBankDetails.accountNumber,
            bankIfsc: customerBankDetails.ifsc,
            bankName: customerBankDetails.bankName,
            bankAccHolderName: customerBankDetails.beneficiaryName,
            latitude: retailerLatitude,
            longitude: retailerLongitude,
            retailerShopName: outletDetails.shopName || existingUser.outletName,
            companyOrShopPan: existingUser.panDetails?.data?.pan_number || existingCompany.companyPan,
            shopAddress: outletDetails.shopAddress,
            gstinNumber: outletDetails.gstNo || '',
            shopCity: outletDetails.shopCity || existingUser.city,
            shopDistrict: outletDetails.shopDistrict,
            shopState: outletDetails.shopState || existingUser.state,
            shopPincode: outletDetails.shopPincode || existingUser.zipcode,
            shopLatitude: pickValue(outletDetails.shopLatitude),
            shopLongitude: pickValue(outletDetails.shopLongitude),
            retailerAddress: outletDetails.shopAddress || existingUser.fullAddress,
            retailerAadhaarFrontImage: buildImageUrl(existingUser.aadharFrontImage),
            retailerAadhaarBackImage: buildImageUrl(existingUser.aadharBackImage),
            retailerPanFrontImage: buildImageUrl(existingUser.panFrontImage || existingUser.panCardFrontImage),
            retailerPanBackImage: buildImageUrl(existingUser.panBackImage || existingUser.panCardBackImage),
            retailerShopImage: buildImageUrl(outletDetails.shopImage || existingUser.profileImage)
        };
        console.log('payload', payload);

        const validationError = validatePayload(payload);
        if (validationError) {
            return res.failure({ message: validationError });
        }

        const aepsOnboardingDetails = await asl.aslAepsOnboarding(payload);

        console.log("aepsOnboardingDetails",aepsOnboardingDetails);

        const normalizedStatus = aepsOnboardingDetails?.status ? String(aepsOnboardingDetails.status).toLowerCase() : null;
        const nestedStatus = aepsOnboardingDetails?.data?.status ? String(aepsOnboardingDetails.data.status).toLowerCase() : null;
        const merchantStatus = Boolean(aepsOnboardingDetails?.data?.data?.merchantStatus ?? aepsOnboardingDetails?.data?.merchantStatus);
        const isSuccess =
            normalizedStatus === 'success' ||
            nestedStatus === 'success' ||
            nestedStatus === 'transaction successful' ||
            merchantStatus;

        if (isSuccess) {
            await dbService.createOne(model.aepsOnboarding, {
                userId: req.user.id,
                companyId: req.user.companyId,
                status: aepsOnboardingDetails.status || aepsOnboardingDetails.data?.status,
                uniqueID: aepsOnboardingDetails.uniqueID || aepsOnboardingDetails.data?.uniqueID,
                otpReferenceId: aepsOnboardingDetails.otpReferneceId || aepsOnboardingDetails.data?.otpReferneceId,
                hash: aepsOnboardingDetails.hash || aepsOnboardingDetails.data?.hash,
                message: aepsOnboardingDetails.message || aepsOnboardingDetails.data?.message,
                merchantStatus: merchantStatus,
                remarks: aepsOnboardingDetails.data?.data?.remarks || aepsOnboardingDetails.data?.remarks,
                superMerchantId: aepsOnboardingDetails.data?.data?.superMerchantId || aepsOnboardingDetails.data?.superMerchantId,
                merchantLoginId: aepsOnboardingDetails.data?.data?.merchantLoginId || aepsOnboardingDetails.data?.merchantLoginId,
                errorCodes: aepsOnboardingDetails.data?.data?.errorCodes || aepsOnboardingDetails.data?.errorCodes,
                onboardingStatus: 'PENDING'
            });

            const responseData = {
                ...aepsOnboardingDetails,
                phone: existingUser.mobileNo || null
            };

            return res.success({ message: 'AEPS onboarding successful', data: responseData });
        }

        return res.failure({ message: aepsOnboardingDetails?.message || 'AEPS onboarding failed', data: aepsOnboardingDetails });
    } catch (error) {
        return res.failure({ message: error.message || 'Unable to process AEPS onboarding' });
    }
};

// Validate Agent
const validateAgentOtp = async (req, res) => {
   try{
    const { otp } = req.body;
    const  existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
    if(!existingUser) {
        return res.failure({ message: 'User not found' });
    }
    const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
        userId: req.user.id,
        companyId: req.user.companyId,
        merchantStatus: true
    });
    if(!existingAepsOnboarding) {
        return res.failure({ message: 'AEPS onboarding not found' });
    }
    
    if(existingAepsOnboarding.isOtpValidated) {
        return res.failure({ message: 'AEPS OTP already validated' });
    }
    const payload = {
        uniqueID: existingAepsOnboarding.uniqueID,
        aadhaarNo: existingUser.aadharDetails?.aadhaarNumber || '829763289274',
        otpReferenceID: existingAepsOnboarding.otpReferenceId,
        otp,
        hash: existingAepsOnboarding.hash,
        merchantLoginId: existingAepsOnboarding.merchantLoginId,
    }
    const aepsResponse = await asl.aslAepsValidateAgentOtp(payload);

    const status = aepsResponse?.status ? String(aepsResponse.status).toUpperCase() : null;
    const nestedStatus = aepsResponse?.data?.status ? String(aepsResponse.data.status).toUpperCase() : null;
    if(status === 'SUCCESS' || nestedStatus === 'SUCCESS') {
        // Don't mark as COMPLETED yet - need to complete all steps including bank eKYC
        await dbService.update(
            model.aepsOnboarding,
            { id: existingAepsOnboarding.id },
            { isOtpValidated: true, otp: otp }
        );
        return res.success({ message: 'AEPS OTP validation successful', data: aepsResponse });
    }
    return res.failure({ message: aepsResponse?.message || aepsResponse?.data?.message || 'AEPS OTP validation failed', data: aepsResponse });
   } catch (error) {
    console.error('AEPS OTP validation error', error);
    return res.failure({ message: error.message || 'Unable to process AEPS OTP validation' });
   }
};

const resendAgentOtp = async (req, res) => {
    try{
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if(!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
            userId: req.user.id,
            companyId: req.user.companyId,
            merchantStatus: true
        });
        if(!existingAepsOnboarding) {
            return res.failure({ message: 'AEPS onboarding not found' });
        }
        const payload = {
            uniqueID: existingAepsOnboarding.uniqueID,
            otpReferenceId: existingAepsOnboarding.otpReferenceId,
            hash: existingAepsOnboarding.hash,
            merchantLoginId: existingAepsOnboarding.merchantLoginId
        }
        const aepsResponse = await asl.aslAepsResendOtp(payload);
        console.log('aepsResponse', aepsResponse);
        const status = aepsResponse?.status ? String(aepsResponse.status).toUpperCase() : null;
        const nestedStatus = aepsResponse?.data?.status ? String(aepsResponse.data.status).toUpperCase() : null;
        if(status === 'SUCCESS' || nestedStatus === 'SUCCESS') {
            return res.success({ message: 'AEPS OTP resend successful', data: aepsResponse });
        }
    }
    catch (error) {
        console.error('AEPS OTP resend error', error);
        return res.failure({ message: error.message || 'Unable to process AEPS OTP resend' });
    }
}

const bioMetricVerification = async (req, res) => {
    try{
        const { biometricData } = req.body;
        let { captureType } = req.body;
        
        if(!biometricData) {
            return res.failure({ message: 'Biometric data is required' });
        }

        captureType = captureType ? String(captureType).trim().toUpperCase() : null;
        if(!captureType || !['FACE', 'FINGER'].includes(captureType)) {
            return res.failure({ message: 'Invalid capture type. Allowed values are FACE or FINGER' });
        }

        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if(!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
            userId: req.user.id,
            companyId: req.user.companyId,
            merchantStatus: true
        });
        if(!existingAepsOnboarding) {
            return res.failure({ message: 'AEPS onboarding not found' });
        }
        if(existingAepsOnboarding.onboardingStatus === 'COMPLETED') {
            return res.failure({ message: 'AEPS onboarding already completed' });
        }
        if(existingAepsOnboarding.isBioMetricValidated) {
            return res.failure({ message: 'Bio metric verification already validated' });
        }
        
        // Validate that biometricData is a string (PID XML)
        if (typeof biometricData !== 'string' || biometricData.trim() === '') {
            return res.failure({ message: 'Biometric data must be a valid PID XML string' });
        }
        if(!existingAepsOnboarding.otp) {
            return res.failure({ message: 'AEPS OTP is required before bio metric verification' });
        }
        // Ensure biometricData is properly formatted (trim whitespace)
        const formattedBiometricData = biometricData.trim();

        const payload = {
            uniqueID: existingAepsOnboarding.uniqueID,
            aadhaarNo: existingUser.aadharDetails?.aadhaarNumber || '829763289274',
            otpReferenceID: existingAepsOnboarding.otpReferenceId,
            otp: existingAepsOnboarding.otp,
            hash: existingAepsOnboarding.hash,
            biometricData: formattedBiometricData,
            merchantLoginId: existingAepsOnboarding.merchantLoginId,
            captureType
        }

        const aepsResponse = await asl.aslAepsValidateAgentBiometric(payload);

        const status = aepsResponse?.status ? String(aepsResponse.status).toUpperCase() : null;
        const nestedStatus = aepsResponse?.data?.status ? String(aepsResponse.data.status).toUpperCase() : null;
        const normalizedStatus = status || nestedStatus;
        const sanitizedRequestPayload = {
            uniqueID: payload.uniqueID,
            aadhaarNo: payload.aadhaarNo,
            otpReferenceID: payload.otpReferenceID,
            hash: payload.hash,
            merchantLoginId: payload.merchantLoginId
        };

        await dbService.createOne(model.bioMetric, {
            refId: existingUser.id,
            companyId: existingUser.companyId,
            captureType,
            status: normalizedStatus,
            responseMessage: aepsResponse?.message || aepsResponse?.data?.message,
            transactionId: aepsResponse?.data?.aslTransactionId || aepsResponse?.data?.reqId,
            rrn: aepsResponse?.data?.rrn,
            aadhaarNumber: aepsResponse?.data?.aadharNumber,
            authCode: aepsResponse?.data?.authCode,
            requestPayload: sanitizedRequestPayload,
            responsePayload: aepsResponse,
            addedBy: req.user.id,
            updatedBy: req.user.id
        });

        if(status === 'SUCCESS' || nestedStatus === 'SUCCESS') {
            // Don't mark as COMPLETED yet - need to complete bank eKYC steps too
            await dbService.update(
                model.aepsOnboarding,
                { id: existingAepsOnboarding.id },
                { isBioMetricValidated: true }
            );
            return res.success({ message: 'Bio metric verification successful', data: aepsResponse });
        }
        
        // Update isOtpValidated to false on error
        await dbService.update(
            model.aepsOnboarding,
            { id: existingAepsOnboarding.id },
            { isOtpValidated: false }
        );
        
        return res.failure({ message: aepsResponse?.message || aepsResponse?.data?.message || 'Bio metric verification failed', data: aepsResponse });
    }
    catch (error) {
        console.error('Bio metric verification error', error);
        
        // Update isOtpValidated to false on exception
        try {
            const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
                userId: req.user.id,
                companyId: req.user.companyId,
                merchantStatus: true
            });
            if(existingAepsOnboarding) {
                await dbService.update(
                    model.aepsOnboarding,
                    { id: existingAepsOnboarding.id },
                    { isOtpValidated: false }
                );
            }
        } catch (updateError) {
            console.error('Error updating aepsOnboarding on exception:', updateError);
        }
        
        return res.failure({ message: error.message || 'Unable to process Bio metric verification' });
    }
}
const bankKycSendOtp = async (req, res) => {
    try {
        const {latitude, longitude} = req.body;
        const existingUser = await dbService.findOne(model.user, { 
            id: req.user.id, 
            companyId: req.user.companyId 
        });
        const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
            userId: req.user.id,
            companyId: req.user.companyId,
            merchantStatus: true
        });
        
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        
        if (!existingAepsOnboarding) {
            return res.failure({ message: 'AEPS onboarding not found' });
        }
        
        // Validate that eKYC biometric is completed
        if (!existingAepsOnboarding.isBioMetricValidated) {
            return res.failure({ message: 'Please complete eKYC biometric verification before bank eKYC' });
        }
        
        const existingCompany = await dbService.findOne(model.company, { id: req.user.companyId });
        
        const payload = {
            latitude: latitude,
            longitude: longitude,
            uniqueID: existingAepsOnboarding.uniqueID,
            mobileNumber: existingUser.mobileNo,
            aadharNumber:  existingUser.aadharDetails?.aadhaarNumber || '829763289274',
            panNumber: existingUser.panDetails?.data?.pan_number || existingCompany.companyPan,
            merchantLoginId: existingAepsOnboarding.merchantLoginId,
        }
        const bankKycSendOtpResponse = await asl.aslAepsBankKycSendOtp(payload);
        
        // Store OTP reference if present in response
        if (bankKycSendOtpResponse?.otpReferenceId || bankKycSendOtpResponse?.data?.otpReferenceId) {
            await dbService.update(
                model.aepsOnboarding,
                { id: existingAepsOnboarding.id },
                { bankKycOtpReferenceId: bankKycSendOtpResponse.otpReferenceId || bankKycSendOtpResponse.data.otpReferenceId }
            );
        }
        
        return res.success({
            message: 'Bank KYC send OTP successful',
            data: bankKycSendOtpResponse
        });
    } catch (error) {
        console.error('Bank KYC send OTP error', error);
        return res.failure({ message: error.message || 'Unable to send Bank KYC OTP' });
    }
}
const bankKycValidateOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        
        if (!otp) {
            return res.failure({ message: 'OTP is required' });
        }
        
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if(!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
            userId: req.user.id,
            companyId: req.user.companyId,
            merchantStatus: true
        });
        if(!existingAepsOnboarding) {
            return res.failure({ message: 'AEPS onboarding not found' });
        }
        
        // Validate that eKYC biometric is completed
        if (!existingAepsOnboarding.isBioMetricValidated) {
            return res.failure({ message: 'Please complete eKYC biometric verification before bank eKYC' });
        }
        
        if (existingAepsOnboarding.isBankKycOtpValidated) {
            return res.failure({ message: 'Bank eKYC OTP already validated' });
        }
        const payload = {
            uniqueID: existingAepsOnboarding.uniqueID,
            aadhaarNo: existingUser.aadharDetails?.aadhaarNumber || '829763289274',
            otpReferenceID: existingAepsOnboarding.bankKycOtpReferenceId || existingAepsOnboarding.otpReferenceId,
            hash: existingAepsOnboarding.hash,
            merchantLoginId: existingAepsOnboarding.merchantLoginId,
            otp: otp
        }
        console.log('payload', payload);
        const bankKycValidateOtpResponse = await asl.aslAepsBankKycValidateOtp(payload);
        
        const status = bankKycValidateOtpResponse?.status ? String(bankKycValidateOtpResponse.status).toUpperCase() : null;
        const nestedStatus = bankKycValidateOtpResponse?.data?.status ? String(bankKycValidateOtpResponse.data.status).toUpperCase() : null;
        
        if (status === 'SUCCESS' || nestedStatus === 'SUCCESS') {
            await dbService.update(
                model.aepsOnboarding,
                { id: existingAepsOnboarding.id },
                { isBankKycOtpValidated: true }
            );
            return res.success({
                message: 'Bank KYC validate OTP successful',
                data: bankKycValidateOtpResponse
            });
        }
        
        return res.failure({ 
            message: bankKycValidateOtpResponse?.message || bankKycValidateOtpResponse?.data?.message || 'Bank KYC OTP validation failed', 
            data: bankKycValidateOtpResponse 
        });
    } catch (error) {
        console.error('Bank KYC validate OTP error', error);
        return res.failure({ message: error.message || 'Unable to process Bank KYC OTP validation' });
    }
}

const bankKycBiometricValidate= async (req, res) => {
    try {
        const { biometricData } = req.body;
        let { captureType } = req.body;
        
        if (!biometricData) {
            return res.failure({ message: 'Biometric data is required' });
        }
        
        captureType = captureType ? String(captureType).trim().toUpperCase() : null;
        if (!captureType || !['FACE', 'FINGER'].includes(captureType)) {
            return res.failure({ message: 'Invalid capture type. Allowed values are FACE or FINGER' });
        }
        
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if(!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
            userId: req.user.id,
            companyId: req.user.companyId,
            merchantStatus: true
        });
        if(!existingAepsOnboarding) {
            return res.failure({ message: 'AEPS onboarding not found' });
        }
        
        // Validate that bank eKYC OTP is completed
        if (!existingAepsOnboarding.isBankKycOtpValidated) {
            return res.failure({ message: 'Please complete bank eKYC OTP validation before biometric verification' });
        }
        
        if (existingAepsOnboarding.isBankKycBiometricValidated) {
            return res.failure({ message: 'Bank eKYC biometric already validated' });
        }
        
        // Validate that biometricData is a string (PID XML)
        if (typeof biometricData !== 'string' || biometricData.trim() === '') {
            return res.failure({ message: 'Biometric data must be a valid PID XML string' });
        }
        
        const formattedBiometricData = biometricData.trim();
        
        const payload = {
            uniqueID: existingAepsOnboarding.uniqueID,
            aadhaarNo: existingUser.aadharDetails?.aadhaarNumber || '829763289274',
            otpReferenceID: existingAepsOnboarding.bankKycOtpReferenceId || existingAepsOnboarding.otpReferenceId,
            otp: existingAepsOnboarding.otp,
            hash: existingAepsOnboarding.hash,
            merchantLoginId: existingAepsOnboarding.merchantLoginId,
            captureType: captureType,
            biometricData: formattedBiometricData
        }
        const bankKycBiometricValidateResponse = await asl.aslAepsBankKycBiometricValidate(payload);
        
        const status = bankKycBiometricValidateResponse?.status ? String(bankKycBiometricValidateResponse.status).toUpperCase() : null;
        const nestedStatus = bankKycBiometricValidateResponse?.data?.status ? String(bankKycBiometricValidateResponse.data.status).toUpperCase() : null;
        
        // Store biometric attempt in bioMetric table
        const normalizedStatus = status || nestedStatus;
        const sanitizedRequestPayload = {
            uniqueID: payload.uniqueID,
            aadhaarNo: payload.aadhaarNo,
            otpReferenceID: payload.otpReferenceID,
            hash: payload.hash,
            merchantLoginId: payload.merchantLoginId,
            captureType: captureType
        };
        
        await dbService.createOne(model.bioMetric, {
            refId: existingUser.id,
            companyId: existingUser.companyId,
            captureType,
            status: normalizedStatus,
            responseMessage: bankKycBiometricValidateResponse?.message || bankKycBiometricValidateResponse?.data?.message,
            transactionId: bankKycBiometricValidateResponse?.data?.aslTransactionId || bankKycBiometricValidateResponse?.data?.reqId,
            rrn: bankKycBiometricValidateResponse?.data?.rrn,
            aadhaarNumber: bankKycBiometricValidateResponse?.data?.aadharNumber,
            authCode: bankKycBiometricValidateResponse?.data?.authCode,
            requestPayload: sanitizedRequestPayload,
            responsePayload: bankKycBiometricValidateResponse,
            addedBy: req.user.id,
            updatedBy: req.user.id
        });
        
        if (status === 'SUCCESS' || nestedStatus === 'SUCCESS') {
            // Update onboarding status to COMPLETED if all steps are done
            const isAllCompleted = existingAepsOnboarding.merchantStatus && 
                                  existingAepsOnboarding.isOtpValidated && 
                                  existingAepsOnboarding.isBioMetricValidated && 
                                  existingAepsOnboarding.isBankKycOtpValidated;
            const onboardingStatus = isAllCompleted ? 'COMPLETED' : 'PENDING';
            
            await dbService.update(
                model.aepsOnboarding,
                { id: existingAepsOnboarding.id },
                { isBankKycBiometricValidated: true, onboardingStatus }
            );
            return res.success({
                message: 'Bank KYC biometric validate successful',
                data: bankKycBiometricValidateResponse
            });
        }
        
        return res.failure({ 
            message: bankKycBiometricValidateResponse?.message || bankKycBiometricValidateResponse?.data?.message || 'Bank KYC biometric validation failed', 
            data: bankKycBiometricValidateResponse 
        });
    } catch (error) {
        console.error('Bank KYC biometric validate error', error);
        return res.failure({ message: error.message || 'Unable to process Bank KYC biometric validation' });
    }
}
const aeps2FaAuthentication = async (req, res) => {
    try{
        const { biometricData } = req.body;
        let { captureType } = req.body;
        if(!biometricData) {
            return res.failure({ message: 'Biometric data is required' });
        }
        captureType = captureType ? String(captureType).trim().toUpperCase() : null;
        if(!captureType || !['FACE', 'FINGER'].includes(captureType)) {
            return res.failure({ message: 'Invalid capture type. Allowed values are FACE or FINGER' });
        }
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if(!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
            userId: req.user.id,
            companyId: req.user.companyId,
            merchantStatus: true
        });

        if (!existingAepsOnboarding) {
            return res.failure({ message: 'AEPS onboarding not found' });
        }
        
        // Validate that bank eKYC biometric is completed before 2FA
        if (!existingAepsOnboarding.isBankKycBiometricValidated) {
            return res.failure({ message: 'Please complete bank eKYC biometric verification before 2FA authentication' });
        }

        const existingBioMetric = await dbService.findOne(model.bioMetric, {
            refId: req.user.id,
            companyId: req.user.companyId,
            captureType: captureType
        });

        if(!existingBioMetric){
            return res.failure({ message: 'Biometric data is required' });
        }

        // Daily login tracking - logout previous day sessions
        await aepsDailyLoginService.logoutPreviousDaySessions(req.user.id, req.user.companyId);

        // Check if user already logged in today (IST date) - DB read in controller
        const todayDateStr = aepsDailyLoginService.getIndianDateOnly();
        const existingDailyLogin = await dbService.findOne(model.aepsDailyLogin, {
            refId: req.user.id,
            companyId: req.user.companyId,
            loginDate: todayDateStr
        });

        if (existingDailyLogin) {
            const data = {
                status: 'used',
                loginDate: todayDateStr,
                nextEligibleAt: aepsDailyLoginService.getNextMidnightIST()?.toISOString?.() || null
            }
            return res.success({ message: 'Already logged in today. You can login again after midnight (IST).',  data });
        }

        // Fetch company to get company name for transaction ID generation
        const existingCompany = await dbService.findOne(model.company, { id: req.user.companyId });
        const generatedTxnId = generateTransactionID(existingCompany?.companyName);

        const payload = {
            uniqueID: existingAepsOnboarding.uniqueID,
            type: 'DAILY_LOGIN',
            aadhaarNo: existingUser.aadharDetails?.aadhaarNumber || '829763289274',
            serviceType: "CashDeposit",
            latitude: existingUser.latitude,
            longitude: existingUser.longitude,
            transactionId: generatedTxnId,
            captureType: captureType,
            biometricData: biometricData,
            merchantLoginId: existingAepsOnboarding.merchantLoginId
        }
        const aepsResponse = await asl.aslAeps2FA(payload);
        console.log('aepsResponse', aepsResponse);
        
        // Parse response if it's a string (handles trailing commas and newlines)
        let parsedResponse = aepsResponse;
        if (typeof aepsResponse === 'string') {
            try {
                let cleanedResponse = aepsResponse.trim()
                    .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
                    .replace(/\\r\\n/g, '')
                    .replace(/\\n/g, '')
                    .replace(/\s+/g, ' ');
                parsedResponse = JSON.parse(cleanedResponse);
            } catch (e) {
                // Fallback: extract JSON from string
                const jsonMatch = aepsResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        let jsonStr = jsonMatch[0]
                            .replace(/,(\s*[}\]])/g, '$1')
                            .replace(/\\r\\n/g, '')
                            .replace(/\\n/g, '')
                            .replace(/\s+/g, ' ');
                        parsedResponse = JSON.parse(jsonStr);
                    } catch (parseError) {
                        console.error('Failed to parse aepsResponse:', parseError.message);
                    }
                }
            }
        }

        // Extract success indicators
        const status = parsedResponse?.status ? String(parsedResponse.status).toUpperCase() : null;
        const nestedStatus = parsedResponse?.data?.status ? String(parsedResponse.data.status).toUpperCase() : null;
        const responseCode = parsedResponse?.data?.responseCode;
        const responseMessage = parsedResponse?.data?.responseMessage;
        
        // Check for success
        const isSuccess = status === 'SUCCESS' || 
                         nestedStatus === 'SUCCESS' || 
                         responseCode === '00' ||
                         (responseMessage && responseMessage.toLowerCase().includes('completed'));
        
        if(isSuccess) {
            // Create daily login record in database - done in controller
            const newLoginTime = new Date();
            const logoutTime = aepsDailyLoginService.getNextMidnightIST();
            
            await dbService.createOne(model.aepsDailyLogin, {
                refId: req.user.id,
                companyId: req.user.companyId,
                loginTime: newLoginTime,
                logoutTime: logoutTime,
                loginDate: todayDateStr,
                isLoggedIn: true,
                addedBy: req.user.id,
                updatedBy: req.user.id
            });

            return res.success({ message: 'AEPS 2FA authentication successful', data: parsedResponse });
        }
        
        return res.failure({ 
            message: parsedResponse?.message || parsedResponse?.data?.message || 'AEPS 2FA authentication failed', 
            data: parsedResponse 
        });
    }
    catch (error) {
        console.error('AEPS 2FA authentication error', error);
        return res.failure({ message: error.message || 'Unable to process AEPS 2FA authentication' });
    }
}

const aepsTransaction = async (req, res) => {
    try{
        const {
            amount,
            txnType,
            captureType,
            biometricData,
            bankiin,
            latitude,
            longitude,
            ipAddress,
            aadharNumber,
            consumerNumber
        } = req.body || {};

        const round2 = (num) => {
            const n = Number(num);
            if (!Number.isFinite(n)) return 0;
            return Math.round((n + Number.EPSILON) * 100) / 100;
        };

        const normalizeTxnType = (value) => (value ? String(value).trim().toUpperCase() : null);
        const normalizeCaptureType = (value) => {
            const t = value ? String(value).trim().toUpperCase() : null;
            if (t === 'FINGURE') return 'FINGER';
            return t;
        };

        const normalizedTxnType = normalizeTxnType(txnType);
        const normalizedCaptureType = normalizeCaptureType(captureType);
        const normalizedBankiin = bankiin ? String(bankiin).trim() : null;

        if(!biometricData) {
            return res.failure({ message: 'Biometric data is required' });
        }
        if(!normalizedCaptureType || !['FACE', 'FINGER'].includes(normalizedCaptureType)) {
            return res.failure({ message: 'Invalid capture type. Allowed values are FACE or FINGER' });
        }
        if(!normalizedTxnType || !['CW', 'BE', 'MS'].includes(normalizedTxnType)) {
            return res.failure({ message: 'Invalid transaction type. Allowed values are CW, BE or MS' });
        }
        if(!normalizedBankiin) {
            return res.failure({ message: 'bankiin is required' });
        }

        // Validate bankIIN exists in aslBankList
        const bankDetails = await dbService.findOne(model.aslBankList, {
            bankIIN: normalizedBankiin,
            isDeleted: false,
            isActive: true
        });
        if (!bankDetails) {
            return res.failure({ message: 'Bank Name not found' });
        }

        if(!ipAddress){
            return res.failure({ message: 'ipAddress is required' });
        }
        if(!aadharNumber){
            return res.failure({ message: 'aadharNumber is required' });
        }
        if(!consumerNumber){
            return res.failure({ message: 'consumerNumber is required' });
        }
        if(!latitude || !longitude){
            return res.failure({ message: 'latitude and longitude are required' });
        }

        const amountNumber = round2(amount || 0);
        if (normalizedTxnType === 'CW' && (!amountNumber || amountNumber < 100)) {
            return res.failure({ message: 'Minimum amount for CW transaction is 100' });
        }

        // Ensure daily 2FA is completed for today (IST date)
        await aepsDailyLoginService.logoutPreviousDaySessions(req.user.id, req.user.companyId);
        const todayDateStr = aepsDailyLoginService.getIndianDateOnly();
        const existingDaily2FA = await dbService.findOne(model.aepsDailyLogin, {
            refId: req.user.id,
            companyId: req.user.companyId,
            loginDate: todayDateStr
        });
        if (!existingDaily2FA) {
            return res.failure({ message: 'AEPS daily 2FA authentication is required before transaction' });
        }

        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if(!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        if(!existingUser.aadharDetails?.aadhaarNumber) {
            return res.failure({ message: 'Aadhaar number not found for this user' });
        }
        if(!existingUser.latitude || !existingUser.longitude) {
            return res.failure({ message: 'User latitude/longitude is required' });
        }

        const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
            userId: req.user.id,
            companyId: req.user.companyId,
            merchantStatus: true
        });
        if(!existingAepsOnboarding) {
            return res.failure({ message: 'AEPS onboarding not completed' });
        }
        if(!existingAepsOnboarding.merchantLoginId) {
            return res.failure({ message: 'AEPS merchantLoginId not found' });
        }
        if(!existingAepsOnboarding.isOtpValidated) {
            return res.failure({ message: 'AEPS eKYC OTP validation is required before transaction' });
        }
        if(!existingAepsOnboarding.isBioMetricValidated) {
            return res.failure({ message: 'AEPS eKYC biometric validation is required before transaction' });
        }
        if(!existingAepsOnboarding.isBankKycOtpValidated) {
            return res.failure({ message: 'Bank eKYC OTP validation is required before transaction' });
        }
        if(!existingAepsOnboarding.isBankKycBiometricValidated) {
            return res.failure({ message: 'Bank eKYC biometric validation is required before transaction' });
        }

        const existingBioMetric = await dbService.findOne(model.bioMetric, {
            refId: req.user.id,
            companyId: req.user.companyId,
            captureType: normalizedCaptureType
        });
        if(!existingBioMetric) {
            return res.failure({ message: 'Biometric data is required' });
        }

        const existingCompany = await dbService.findOne(model.company, { id: req.user.companyId });

        const generatedTxnId = generateTransactionID(existingCompany?.companyName);

        const resolveOperator = async () => {
            const pickBestByAmount = (operators, amountVal) => {
                if (!operators || !operators.length) return null;
                const matches = operators.filter((op) => {
                    const min = op.minValue !== undefined && op.minValue !== null ? Number(op.minValue) : null;
                    const max = op.maxValue !== undefined && op.maxValue !== null ? Number(op.maxValue) : null;
                    if (Number.isFinite(min) && amountVal < min) return false;
                    if (Number.isFinite(max) && amountVal > max) return false;
                    return true;
                });
                const candidates = matches.length ? matches : operators;
                // Choose most specific range: smallest span, else highest minValue, else newest
                candidates.sort((a, b) => {
                    const aMin = Number.isFinite(Number(a.minValue)) ? Number(a.minValue) : -Infinity;
                    const bMin = Number.isFinite(Number(b.minValue)) ? Number(b.minValue) : -Infinity;
                    const aMax = Number.isFinite(Number(a.maxValue)) ? Number(a.maxValue) : Infinity;
                    const bMax = Number.isFinite(Number(b.maxValue)) ? Number(b.maxValue) : Infinity;
                    const aSpan = aMax - aMin;
                    const bSpan = bMax - bMin;
                    if (aSpan !== bSpan) return aSpan - bSpan;
                    if (aMin !== bMin) return bMin - aMin;
                    return (b.id || 0) - (a.id || 0);
                });
                return candidates[0];
            };

            // Amount-based operator selection:
            // Your operator rows are like 100-500, 501-1000, ... 9001-10000 with operatorType="AEPS".
            // bankiin is BANK IIN (e.g. 109104) so DO NOT match it with operatorCode (AEPS011 etc).
            const aepsOperators = await model.operator.findAll({ where: { operatorType: 'AEPS' } });

            // Primary: pick matching min/max range
            const matched = pickBestByAmount(aepsOperators, amountNumber);
            if (matched) return matched;

            // Fallback: if no match (e.g. BE/MS amount=0), pick closest boundary
            const sorted = (aepsOperators || []).slice().sort((a, b) => Number(a.minValue || 0) - Number(b.minValue || 0));
            if (!sorted.length) return null;
            if (amountNumber <= Number(sorted[0].minValue || 0)) return sorted[0];
            return sorted[sorted.length - 1];
        };

        const operator = await resolveOperator();

        // Commission/TDS: simple operator-based (no slabs/ranges). All fields can be null.
        const toNullableNumber = (value) => {
            if (value === undefined || value === null || value === '') return null;
            const n = Number(value);
            if (!Number.isFinite(n)) return null;
            return round2(n);
        };

        const TDS_PERCENT = Number(process.env.AEPS_TDS_PERCENT || 2);
        const calculateTdsAmount = (commValue) => {
            if (commValue === null || commValue === undefined) return null;
            return round2((Number(commValue) * TDS_PERCENT) / 100);
        };

        const calcCommByAmtType = (baseValue) => {
            const base = toNullableNumber(baseValue);
            if (base === null) return null;
            const amtType = operator?.amtType ? String(operator.amtType).toLowerCase() : 'fix';
            if (amtType === 'per') {
                return round2((amountNumber * base) / 100);
            }
            return round2(base);
        };

        const superadminComm = calcCommByAmtType(operator?.superadminComm);
        const whitelabelComm = calcCommByAmtType(operator?.whitelabelComm);
        const masterDistributorCom = calcCommByAmtType(
            operator?.masterDistributorCom ?? operator?.masterDistrbutorCom
        );
        const distributorCom = calcCommByAmtType(operator?.distributorCom);
        // If retailerCom not configured, fallback to operator.comm
        const retailerCommBase = operator?.retailerCom ?? operator?.reatilerCom ?? operator?.comm;
        const retailerCom = calcCommByAmtType(retailerCommBase);

        // TDS will be calculated later, only for SUCCESS transactions
        // For now, initialize to 0 (will be recalculated after gateway response)
        let superadminCommTDS = 0;
        let whitelabelCommTDS = 0;
        let masterDistributorComTDS = 0;
        let distributorComTDS = 0;
        let retailerComTDS = 0;
        // retailerNetCredit will be calculated after TDS is determined (sum of all commissions after TDS)
        let retailerNetCredit = 0;

        // Transaction metadata we want to persist for reporting/audit
        const consumerAadhaarNumber = aadharNumber ? String(aadharNumber) : null;
        const resolvedIpAddress = ipAddress ? String(ipAddress) : (req.ip ? String(req.ip) : null);
        const txLatitude = latitude ?? existingUser.latitude;
        const txLongitude = longitude ?? existingUser.longitude;

        const payload = {
            uniqueID: existingAepsOnboarding.uniqueID,
            aadhaarNo: aadharNumber,
            txnType: normalizedTxnType,
            merchantLoginId: existingAepsOnboarding.merchantLoginId,
            bankiin: normalizedBankiin,
            mobile: consumerNumber,
            amount: amountNumber, 
            latitude: txLatitude,
            longitude: txLongitude,
            transactionId: generatedTxnId,
            captureType: normalizedCaptureType,
            biometricData: biometricData
        };
        console.log('payload', payload);
        const aepsResponse = await asl.aslAepsTransaction(payload);
        const safeJsonStringify = (value) => {
            try {
                const seen = new WeakSet();
                return JSON.stringify(
                    value,
                    (key, val) => {
                        if (typeof val === 'bigint') return val.toString();
                        if (val instanceof Error) {
                            return { name: val.name, message: val.message, stack: val.stack };
                        }
                        if (typeof val === 'function') {
                            return `[Function ${val.name || 'anonymous'}]`;
                        }
                        if (val && typeof val === 'object') {
                            if (seen.has(val)) return '[Circular]';
                            seen.add(val);
                        }
                        return val;
                    },
                    2
                );
            } catch (e) {
                return String(value);
            }
        };
        // Log response as JSON (prefer response.data if this is an axios response)
        console.log('aepsResponse', safeJsonStringify(aepsResponse?.data ?? aepsResponse));

        // Normalize response (sometimes comes as JSON string)
        let parsedResponse = aepsResponse;
        if (typeof aepsResponse === 'string') {
            try {
                parsedResponse = JSON.parse(aepsResponse);
            } catch (e) {
                const jsonMatch = aepsResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        parsedResponse = JSON.parse(jsonMatch[0]);
                    } catch (parseError) {
                        parsedResponse = { status: 'ERROR', message: aepsResponse };
                    }
                } else {
                    parsedResponse = { status: 'ERROR', message: aepsResponse };
                }
            }
        }

        const topStatus = parsedResponse?.status ? String(parsedResponse.status).toUpperCase() : null;
        const innerData =
            parsedResponse && typeof parsedResponse === 'object' && parsedResponse.data && typeof parsedResponse.data === 'object'
                ? parsedResponse.data
                : null;
        const transactionStatusRaw =
            innerData?.transactionStatus ??
            innerData?.status ??
            parsedResponse?.transactionStatus ??
            parsedResponse?.status;
        const transactionStatus = transactionStatusRaw ? String(transactionStatusRaw).toUpperCase() : null;
        const responseCode = innerData?.responseCode ?? parsedResponse?.responseCode;

        const isSuccess =
            responseCode === '00' ||
            transactionStatus === 'SUCCESS' ||
            transactionStatus === 'SUCCESSFUL' ||
            topStatus === 'SUCCESS';

        const isPending =
            !isSuccess &&
            (
                transactionStatus === 'PENDING' ||
                transactionStatus === 'PROCESSING' ||
                transactionStatus === 'INPROGRESS' ||
                transactionStatus === 'IN_PROGRESS' ||
                transactionStatus === 'INITIATED' ||
                transactionStatus === 'SUBMITTED'
            );

        const paymentStatus = isSuccess ? 'SUCCESS' : (isPending ? 'PENDING' : 'FAILED');

        // Calculate TDS only for SUCCESS transactions
        // For FAILED/PENDING, TDS remains 0
        if (isSuccess) {
            superadminCommTDS = calculateTdsAmount(superadminComm);
            whitelabelCommTDS = calculateTdsAmount(whitelabelComm);
            masterDistributorComTDS = calculateTdsAmount(masterDistributorCom);
            distributorComTDS = calculateTdsAmount(distributorCom);
            retailerComTDS = calculateTdsAmount(retailerCom);
        }

        // Calculate total commission credit: ALL commissions minus TDS (all credited to retailer wallet)
        if (isSuccess) {
            const superadminNet = (superadminComm === null ? 0 : Number(superadminComm || 0)) - (superadminCommTDS || 0);
            const whitelabelNet = (whitelabelComm === null ? 0 : Number(whitelabelComm || 0)) - (whitelabelCommTDS || 0);
            const masterDistributorNet = (masterDistributorCom === null ? 0 : Number(masterDistributorCom || 0)) - (masterDistributorComTDS || 0);
            const distributorNet = (distributorCom === null ? 0 : Number(distributorCom || 0)) - (distributorComTDS || 0);
            const retailerNet = (retailerCom === null ? 0 : Number(retailerCom || 0)) - (retailerComTDS || 0);
            
            // Total commission credit = sum of all commissions after TDS
            retailerNetCredit = round2(superadminNet + whitelabelNet + masterDistributorNet + distributorNet + retailerNet);
        }

        // If gateway returns contradictory wrapper status (e.g. status="ERROR" but responseCode="00"),
        // normalize it so API consumers don't see ERROR inside a successful response.
        const normalizedGatewayResponse =
            parsedResponse && typeof parsedResponse === 'object' && Object.prototype.hasOwnProperty.call(parsedResponse, 'status')
                ? { ...parsedResponse, status: isSuccess ? 'SUCCESS' : (topStatus || 'ERROR') }
                : parsedResponse;

        // Only set merchantTransactionId for SUCCESS transactions
        // For FAILED/PENDING, it should be null
        const merchantTransactionId = isSuccess
            ? (innerData?.merchantTxnId ||
               innerData?.merchantTransactionId ||
               normalizedGatewayResponse?.merchantTxnId ||
               normalizedGatewayResponse?.merchantTransactionId ||
               payload.transactionId)
            : null;

        // Prepare request payload for persistence (mask biometric)
        const safeRequest = {
            ...payload,
            biometricData: undefined,
            biometricDataPresent: Boolean(payload.biometricData),
            ipAddress: resolvedIpAddress,
            consumerAadhaarNumber,
            consumerNumber
        };

        // Ensure wallet exists so we can snapshot opening/closing (even for FAILED/PENDING)
        let wallet = await model.wallet.findOne({
            where: { refId: req.user.id, companyId: req.user.companyId }
        });

        if (!wallet) {
            wallet = await model.wallet.create({
                refId: req.user.id,
                companyId: req.user.companyId,
                roleType: req.user.userType,
                mainWallet: 0,
                apesWallet: 0,
                addedBy: req.user.id,
                updatedBy: req.user.id
            });
        }

        const openingAepsWallet = round2(wallet.apesWallet || 0);
        const creditToApply = isSuccess ? retailerNetCredit : 0;
        const closingAepsWallet = isSuccess ? round2(openingAepsWallet + creditToApply) : openingAepsWallet;

        // Only credit AEPS wallet on SUCCESS
        if (isSuccess && creditToApply) {
            await wallet.update({
                apesWallet: closingAepsWallet,
                updatedBy: req.user.id
            });
        }

        // Resolve complete address from latitude/longitude (best-effort: do not fail transaction if Google fails)
        let transactionCompleteAddress = null;
        try {
            if (txLatitude !== undefined && txLatitude !== null && txLongitude !== undefined && txLongitude !== null) {
                const geo = await googleMap.reverseGeocode(txLatitude, txLongitude);
                transactionCompleteAddress =
                    geo?.complete_address ||
                    geo?.address ||
                    geo?.formatted_address ||
                    null;
            }
        } catch (geoErr) {
            transactionCompleteAddress = null;
        }

        // Always store walletHistory + aepsHistory for SUCCESS / FAILED / PENDING.
        await model.walletHistory.create({
            refId: req.user.id,
            companyId: req.user.companyId,
            walletType: 'AEPS',
            operator: operator?.operatorName || normalizedBankiin,
            amount: amountNumber,
            comm: retailerCom === null ? 0 : Number(retailerCom || 0),
            surcharge: 0,
            openingAmt: openingAepsWallet,
            closingAmt: closingAepsWallet,
            credit: creditToApply,
            debit: 0,
            merchantTransactionId,
            transactionId: safeRequest.transactionId,
            paymentStatus,
            paymentInstrument: {
                service: 'AEPS',
                request: safeRequest,
                response: normalizedGatewayResponse,
                metadata: {
                    ipAddress: resolvedIpAddress,
                    latitude: txLatitude,
                    longitude: txLongitude,
                    transactionCompleteAddress
                }
            },
            remark: `AEPS ${normalizedTxnType}`,
            aepsTxnType: normalizedTxnType,
            bankiin: normalizedBankiin,
            superadminComm,
            whitelabelComm,
            masterDistributorCom,
            distributorCom,
            retailerCom,
            superadminCommTDS,
            whitelabelCommTDS,
            masterDistributorComTDS,
            distributorComTDS,
            retailerComTDS,
            addedBy: req.user.id,
            updatedBy: req.user.id,
            userDetails: {
                id: existingUser.id,
                userType: existingUser.userType,
                mobileNo: existingUser.mobileNo
            }
        });

        // Separate AEPS history (for reporting)
        if (model.aepsHistory) {
            await model.aepsHistory.create({
                refId: req.user.id,
                companyId: req.user.companyId,
                operator: operator?.operatorName || normalizedBankiin,
                bankiin: normalizedBankiin,
                aepsTxnType: normalizedTxnType,
                captureType: normalizedCaptureType,
                amount: amountNumber,
                transactionId: safeRequest.transactionId,
                merchantTransactionId,
                consumerNumber: consumerNumber ? String(consumerNumber) : null,
                consumerAadhaarNumber,
                ipAddress: resolvedIpAddress,
                latitude: txLatitude !== undefined && txLatitude !== null ? Number(txLatitude) : null,
                longitude: txLongitude !== undefined && txLongitude !== null ? Number(txLongitude) : null,
                transactionCompleteAddress,
                bankRRN:
                    innerData?.bankRRN ||
                    innerData?.bankRrn ||
                    normalizedGatewayResponse?.bankRRN ||
                    normalizedGatewayResponse?.bankRrn,
                fpTransactionId:
                    innerData?.fpTransactionId ||
                    innerData?.FingpayTransactionId ||
                    normalizedGatewayResponse?.fpTransactionId ||
                    normalizedGatewayResponse?.FingpayTransactionId,
                responseCode,
                status: paymentStatus,
                message:
                    normalizedGatewayResponse?.message ||
                    innerData?.errorMessage ||
                    innerData?.responseMessage ||
                    innerData?.message,
                requestPayload: safeRequest,
                responsePayload: normalizedGatewayResponse,
                openingAepsWallet,
                closingAepsWallet: closingAepsWallet,
                credit: creditToApply,
                superadminComm,
                whitelabelComm,
                masterDistributorCom,
                distributorCom,
                retailerCom,
                superadminCommTDS,
                whitelabelCommTDS,
                masterDistributorComTDS,
                distributorComTDS,
                retailerComTDS,
                addedBy: req.user.id,
                updatedBy: req.user.id
            });
        }

        // If FAILED/PENDING: do not stop persistence above; just return gateway response after storing
        if (!isSuccess) {
            return res.failure({
                message:
                    normalizedGatewayResponse?.message ||
                    innerData?.message ||
                    (isPending ? 'AEPS transaction pending' : 'AEPS transaction failed'),
                data: {
                    paymentStatus,
                    responseCode,
                    transactionStatus,
                    merchantTransactionId: null,
                    gatewayResponse: normalizedGatewayResponse
                }
            });
        }

        // Use bank details already fetched during validation
        let bankName = null;
        let bankLogo = null;
        if (bankDetails) {
            bankName = bankDetails.bankName;
            bankLogo = imageService.getImageUrl(bankDetails.bankLogo, false);
        }

        // Get company logo URL - check company.logo first, then companyImage table
        let companyLogo = null;
        if (existingCompany?.logo) {
            companyLogo = imageService.getImageUrl(existingCompany.logo, false);
        } else if (existingCompany?.id) {
            // Try to get logo from companyImage table (type: signature, subtype: logo)
            const companyLogoImage = await dbService.findOne(model.companyImage, {
                companyId: existingCompany.id,
                type: 'signature',
                subtype: 'logo',
                isActive: true
            });
            if (companyLogoImage?.s3Key) {
                companyLogo = imageService.getImageUrl(companyLogoImage.s3Key, false);
            }
        }

        // Extract transaction date/time from gateway response
        const transactionDateTimeRaw = innerData?.requestTransactionTime || 
                                      normalizedGatewayResponse?.data?.requestTransactionTime ||
                                      null;
        
        // Format transaction date/time (if from gateway, use as-is; otherwise use current time)
        let transactionDateTime = transactionDateTimeRaw;
        let transactionTime = transactionDateTimeRaw;
        if (!transactionDateTimeRaw) {
            const now = new Date();
            // Format as DD/MM/YYYY HH:MM:SS
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = now.getFullYear();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            transactionDateTime = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
            transactionTime = `${hours}:${minutes}:${seconds}`;
        } else {
            // If gateway provides time, extract just time part if needed
            const timeMatch = transactionDateTimeRaw.match(/(\d{2}:\d{2}:\d{2})/);
            if (timeMatch) {
                transactionTime = timeMatch[1];
            }
        }

        // Extract remaining balance from gateway response
        const remainingBalance = innerData?.balanceAmount || 
                                 normalizedGatewayResponse?.data?.balanceAmount || 
                                 null;

        // Extract client_transaction_id for transactionId
        const clientTransactionId = normalizedGatewayResponse?.client_transaction_id || 
                                    payload.transactionId;

        // Format response with all required fields
        return res.success({
            message: 'AEPS transaction successful',
            data: {
                status: paymentStatus,
                service: 'AEPS',
                transactionId: clientTransactionId,
                referenceId: merchantTransactionId,
                transactionDate: transactionDateTime,
                transactionTime: transactionTime,
                amount: amountNumber,
                remainingBalance: remainingBalance,
                bankName: bankName,
                bankLogo: bankLogo,
                companyName: existingCompany?.companyName || null,
                companyLogo: companyLogo,

            }
        });
    }
    catch (error) {
        console.error('AEPS transaction error', error);
        return res.failure({ message: error.message || 'Unable to process AEPS transaction' });
    }
}

const checkStatus = async (req, res) => {
    try {
        const {txnId} = req.body;
        if (!txnId) {
            return res.failure({ message: 'Transaction ID is required' });
        }
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,    
            companyId: req.user.companyId,
            isActive: true  
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        const existingAepsOnboarding = await dbService.findOne(model.aepsOnboarding, {
            userId: req.user.id,
            companyId: req.user.companyId,
            isActive: true
        });
        if (!existingAepsOnboarding) {
            return res.failure({ message: 'AEPS onboarding not found' });
        }
        const statusData = {
            uniqueID: existingAepsOnboarding.uniqueID,
            merchantLoginId: existingAepsOnboarding.merchantLoginId,
            txnId: txnId,
        }   
        const response = await asl.aslAepsCheckStatus(statusData);
        console.log("response",response);
        if (response.status === 'SUCCESS') {    
            return res.success({ message: 'AEPS transaction status', data: response.data });
        } else {
            return res.failure({ message: 'AEPS transaction status', data: response.data });
        }
    }
    catch (error) {
        console.error('Check status error', error);
        return res.failure({ message: error.message || 'Unable to check status' });
    }
}

const recentBanks = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { 
            id: req.user.id, 
            companyId: req.user.companyId 
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        // Get all AEPS transactions for this user, ordered by most recent first
        const aepsTransactions = await dbService.findAll(model.aepsHistory, {
            refId: req.user.id,
            companyId: req.user.companyId,
            bankiin: { [Op.ne]: null }
        }, {
            attributes: ['bankiin', 'createdAt'],
            sort: { createdAt: -1 }
        });

        // Extract unique bankIINs (first occurrence = most recent)
        const uniqueBankIINs = [];
        const seenBankIINs = new Set();
        
        for (const txn of aepsTransactions) {
            const bankIIN = txn.bankiin ? String(txn.bankiin).trim() : null;
            if (bankIIN && !seenBankIINs.has(bankIIN)) {
                seenBankIINs.add(bankIIN);
                uniqueBankIINs.push(bankIIN);
                // Stop once we have 4 unique banks
                if (uniqueBankIINs.length >= 4) break;
            }
        }

        // If no recent transactions, return empty array
        if (uniqueBankIINs.length === 0) {
            return res.success({
                message: 'Recent banks retrieved successfully',
                data: []
            });
        }

        // Get bank details from aslBankList
        const banks = await dbService.findAll(model.aslBankList, {
            bankIIN: { [Op.in]: uniqueBankIINs },
            isDeleted: false,
            isActive: true
        });

        // Map to response format with CDN URLs for logos, maintaining order
        const bankMap = new Map();
        banks.forEach(bank => {
            const bankData = bank.toJSON ? bank.toJSON() : bank;
            bankMap.set(bankData.bankIIN, {
                bankIIN: bankData.bankIIN,
                bankName: bankData.bankName,
                bankLogo: imageService.getImageUrl(bankData.bankLogo, false)
            });
        });

        // Return banks in the order they appeared (most recent first)
        const recentBanksData = uniqueBankIINs
            .map(bankIIN => bankMap.get(bankIIN))
            .filter(Boolean); // Remove any nulls if bank not found

        return res.success({
            message: 'Recent banks retrieved successfully',
            data: recentBanksData
        });
    } catch (error) {
        console.error('Recent banks error', error);
        return res.failure({ message: error.message || 'Unable to retrieve recent banks' });
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

        // Only userRole 3, 4, 5 can access this endpoint
        if (![3, 4, 5].includes(userRole)) {
            return res.failure({ message: 'Access denied. Only Master Distributor, Distributor, and Retailer can access transaction history.' });
        }

        const dataToFind = req.body || {};
        let options = {};
        let query = { companyId: companyId };

        // Role-based refId filtering
        if (userRole === 4 || userRole === 5) {
            // Distributor (4) and Retailer (5): Only their own transactions
            query.refId = userId;
        } else if (userRole === 3) {
            // Master Distributor (3): Their own transactions + transactions of users reporting to them
            const reportingUsers = await dbService.findAll(model.user, {
                reportingTo: userId,
                companyId: companyId,
                isDeleted: false,
                userRole: { [Op.in]: [4, 5] } // Only distributors and retailers reporting to master distributor
            }, {
                attributes: ['id']
            });
            const reportingUserIds = reportingUsers.map(user => user.id);
            // Include master distributor's own transactions + reporting users' transactions
            query.refId = { [Op.in]: [userId, ...reportingUserIds] };
        }

        // Build query from request body
        if (dataToFind && dataToFind.query) {
            query = { ...query, ...dataToFind.query };
        }

        // Handle options (pagination, sorting)
        if (dataToFind && dataToFind.options !== undefined) {
            options = { ...dataToFind.options };
        }

        // Handle customSearch (iLike search on multiple fields)
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

        // Use paginate for consistent pagination response
        const result = await dbService.paginate(model.aepsHistory, query, options);

        return res.success({
            message: 'AEPS transaction history retrieved successfully',
            data: result?.data || [],
            total: result?.total || 0,
            paginator: result?.paginator
        });
    } catch (error) {
        console.error('AEPS transaction history error', error);
        return res.failure({ message: error.message || 'Unable to retrieve AEPS transaction history' });
    }
}

module.exports = { 
    getOnboardingStatus, 
    aepsOnboarding, 
    validateAgentOtp, 
    resendAgentOtp, 
    bioMetricVerification, 
    bankKycSendOtp,
    bankKycValidateOtp,
    bankKycBiometricValidate,
    aeps2FaAuthentication ,
    aepsTransaction,
    checkStatus,
    recentBanks,
    aepsTransactionHistory
};