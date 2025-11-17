const asl = require('../../../services/asl');
const dbService = require('../../../utils/dbService');
const model = require('../../../models');


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
        if(!existingAepsOnboarding) {
            return res.failure({ message: 'AEPS onboarding not found' });
        }
        
        const isAepsOnboardingComplete = Boolean(existingAepsOnboarding.merchantStatus);
        const isOtpValidated = Boolean(existingAepsOnboarding.isOtpValidated);
        const isBioMetricValidated = Boolean(existingAepsOnboarding.isBioMetricValidated);
        
        const isAllCompleted = isAepsOnboardingComplete && isOtpValidated && isBioMetricValidated;
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
            aepsOnboarding: {
                status: isAepsOnboardingComplete ? 'completed' : 'pending',
                isCompleted: isAepsOnboardingComplete
            },
            validateAgentOtp: {
                status: isOtpValidated ? 'completed' : 'pending',
                isCompleted: isOtpValidated
            },
            bioMetricVerification: {
                status: isBioMetricValidated ? 'completed' : 'pending',
                isCompleted: isBioMetricValidated
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
        if(existingAepsOnboarding.onboardingStatus === 'COMPLETED') {
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
            aadharNo: existingUser.aadharDetails?.aadhaarNumber,
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

        const validationError = validatePayload(payload);
        if (validationError) {
            return res.failure({ message: validationError });
        }

        const aepsOnboardingDetails = await asl.aslAepsOnboarding(payload);

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

            return res.success({ message: 'AEPS onboarding successful', data: aepsOnboardingDetails });
        }

        return res.failure({ message: aepsOnboardingDetails?.message || 'AEPS onboarding failed', data: aepsOnboardingDetails });
    } catch (error) {
        console.error('AEPS onboarding error', error);
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
        aadhaarNo: existingUser.aadharDetails?.aadhaarNumber,
        otpReferenceID: existingAepsOnboarding.otpReferenceId,
        otp,
        hash: existingAepsOnboarding.hash,
        merchantLoginId: existingAepsOnboarding.merchantLoginId,
    }
    const aepsResponse = await asl.aslAepsValidateAgentOtp(payload);

    const status = aepsResponse?.status ? String(aepsResponse.status).toUpperCase() : null;
    const nestedStatus = aepsResponse?.data?.status ? String(aepsResponse.data.status).toUpperCase() : null;
    if(status === 'SUCCESS' || nestedStatus === 'SUCCESS') {
        const isAepsOnboardingComplete = Boolean(existingAepsOnboarding.merchantStatus);
        const isBioMetricValidated = Boolean(existingAepsOnboarding.isBioMetricValidated);
        const isAllCompleted = isAepsOnboardingComplete && isBioMetricValidated;
        const onboardingStatus = isAllCompleted ? 'COMPLETED' : 'PENDING';
        
        await dbService.update(
            model.aepsOnboarding,
            { id: existingAepsOnboarding.id },
            { isOtpValidated: true, onboardingStatus }
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

        // Ensure biometricData is properly formatted (trim whitespace)
        const formattedBiometricData = biometricData.trim();

        const payload = {
            uniqueID: existingAepsOnboarding.uniqueID,
            aadhaarNo: existingUser.aadharDetails?.aadhaarNumber,
            otpReferenceID: existingAepsOnboarding.otpReferenceId,
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
            const isAepsOnboardingComplete = Boolean(existingAepsOnboarding.merchantStatus);
            const isOtpValidated = Boolean(existingAepsOnboarding.isOtpValidated);
            const isAllCompleted = isAepsOnboardingComplete && isOtpValidated;
            const onboardingStatus = isAllCompleted ? 'COMPLETED' : 'PENDING';
            
            await dbService.update(
                model.aepsOnboarding,
                { id: existingAepsOnboarding.id },
                { isBioMetricValidated: true, onboardingStatus }
            );
            return res.success({ message: 'Bio metric verification successful', data: aepsResponse });
        }
        return res.failure({ message: aepsResponse?.message || aepsResponse?.data?.message || 'Bio metric verification failed', data: aepsResponse });
    }
    catch (error) {
        console.error('Bio metric verification error', error);
        return res.failure({ message: error.message || 'Unable to process Bio metric verification' });
    }
}


module.exports = { getOnboardingStatus, aepsOnboarding, validateAgentOtp, resendAgentOtp, bioMetricVerification };