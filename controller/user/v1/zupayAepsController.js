const { v4: uuidv4 } = require('uuid');
const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const zupayService = require('../../../services/zupayService');
const ZUPAY_MERCHANT_CODE = process.env.ZUPAY_MERCHANT_CODE;
const ZUPAY_PIPE = process.env.ZUPAY_PIPE;


const isZupaySuccess = (response) => {
    if (!response) return false;
    return !response.errors && !!response.data;
};

const getZupayError = (response) => {
    if (response?.errors && response.errors.length > 0) {
        return response.errors[0].error_message;
    }
    return response?.meta?.message || 'Unknown Zupay error';
};

const deviceInfoFromReq = (body) => ({
    type: body.device_type || 'MOBILE',
    os: body.device_os || 'ANDROID',
    app_id: body.app_id || 'in.zupay.connect',
    sdk_version: body.sdk_version || '1.2.0',
    mobile: body.device_mobile || '',
    user_agent: body.user_agent || '',
    model: body.device_model || '',
    model_id: body.model_id || '',
    peripheral: body.peripheral || 'BIOMETRIC_FINGERPRINT'
});

const getOnboardingStatus = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId
        });
        if (!existingUser) return res.failure({ message: 'User not found' });

        const onboarding = await dbService.findOne(model.zupayOnboarding, {
            userId: existingUser.id,
            companyId: existingUser.companyId
        });

        if (!onboarding) {
            return res.success({
                message: 'Zupay AEPS onboarding status',
                data: {
                    onboardingStatus: 'PENDING',
                    isInitiated: false,
                    isOtpVerified: false,
                    isEkycCompleted: false
                }
            });
        }

        return res.success({
            message: 'Zupay AEPS onboarding status',
            data: {
                onboardingStatus: onboarding.onboardingStatus,
                subMerchantCode: onboarding.subMerchantCode,
                contactId: onboarding.contactId,
                isInitiated: onboarding.isInitiated,
                isOtpVerified: onboarding.isOtpVerified,
                isEkycCompleted: onboarding.isEkycCompleted,
                ekycStatus: onboarding.ekycStatus,
                is2faVerified: onboarding.is2faVerified,
                last2faDate: onboarding.last2faDate,
                onboardRemarks: onboarding.onboardRemarks
            }
        });
    } catch (err) {
        console.error('[ZupayAeps] getOnboardingStatus error:', err);
        return res.failure({ message: err.message || 'Failed to get onboarding status' });
    }
};

const initiateOnboarding = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId
        });
        if (!existingUser) return res.failure({ message: 'User not found' });

        const existingOutlet = await dbService.findOne(model.outlet, {
            refId: existingUser.id,
            companyId: existingUser.companyId
        });
        if (!existingOutlet) return res.failure({ message: 'Outlet not found. Please complete outlet setup.' });

        const [zupayCity, zupayState, zupayPincode] = await Promise.all([
            dbService.findOne(model.zupayCity, { name: existingUser.district }),
            dbService.findOne(model.zupayState, { name: existingUser.state?.toUpperCase() }),
            dbService.findOne(model.zupayMaster, { pincode: existingUser.zipcode, isActive: true })
        ]);

        if (!zupayCity) return res.failure({ message: 'City not found in Zupay master. Please contact support.' });
        if (!zupayState) return res.failure({ message: 'State not found in Zupay master. Please contact support.' });
        if (!zupayPincode) return res.failure({ message: 'Pincode not found in Zupay master. Please contact support.' });

        const referenceId = uuidv4();

        const nameParts = (existingUser.name || '').trim().split(/\s+/);
        let first_name = '', middle_name = '', last_name = '';

        if (nameParts.length === 1) {
            first_name = nameParts[0];
            last_name = nameParts[0];
        } else if (nameParts.length === 2) {
            first_name = nameParts[0];
            last_name = nameParts[1];
        } else {
            first_name = nameParts[0];
            middle_name = nameParts[1];
            last_name = nameParts.slice(2).join(' ');
        }

        const payload = {
            reference_id: referenceId,
            pipe: ZUPAY_PIPE,
            merchant_code: ZUPAY_MERCHANT_CODE,
            personal_details: {
                first_name,
                middle_name,
                last_name,
                dob: existingUser.dob ? existingUser.dob.replace(/-/g, '/') : '',
                phone_number: existingUser.mobileNo,
                email: existingUser.email
            },
            business_details: {
                shop_name: existingOutlet.shopName || existingOutlet.shopCategory,
                address_line1: existingOutlet.shopAddress?.slice(0, 100),
                address_line2: existingOutlet.shopAddress2 || '',
                city_id: zupayCity.cityId,
                state_id: zupayState.stateId,
                landmark: existingOutlet.landmark || '',
                pin_code: zupayPincode.pincodeId,
                geo_location: {
                    latitude: Number(req.body.latitude),
                    longitude: Number(req.body.longitude),
                    ip_address: req.ip || req.body.ipAddress || '0.0.0.0'
                }
            },
            kyc_details: {
                pan: existingUser.panDetails?.data?.pan_number || '',
            }
        };

        const apiResponse = await zupayService.initiateOnboarding(payload);

        if (!isZupaySuccess(apiResponse)) {
            return res.failure({ message: getZupayError(apiResponse), data: apiResponse });
        }

        const { contact_id, sub_merchant_code, merchant_code, status } = apiResponse.data;

        const existingOnboarding = await dbService.findOne(model.zupayOnboarding, {
            userId: existingUser.id,
            companyId: existingUser.companyId
        });

        const dbData = {
            userId: existingUser.id,
            companyId: existingUser.companyId,
            subMerchantCode: sub_merchant_code,
            contactId: contact_id,
            merchantCode: merchant_code,
            referenceId,
            pipe: ZUPAY_PIPE,
            isInitiated: true,
            isOtpVerified: false,
            isEkycCompleted: false,
            onboardingStatus: 'PENDING',
            initiateStatus: status,
            mobileNo: existingUser.mobileNo,
            email: existingUser.email,
            pan: payload.kyc_details.pan
        };

        if (existingOnboarding) {
            await dbService.update(model.zupayOnboarding, { id: existingOnboarding.id }, dbData);
        } else {
            await dbService.createOne(model.zupayOnboarding, dbData);
        }

        return res.success({
            message: apiResponse.meta?.message || 'Onboarding initiated successfully',
            data: apiResponse.data
        });
    } catch (err) {
        console.error('[ZupayAeps] initiateOnboarding error:', err);
        return res.failure({ message: err.message || 'Failed to initiate onboarding' });
    }
};

const verifyOTP = async (req, res) => {
    try {
        const { otp } = req.body;
        if (!otp) return res.failure({ message: 'OTP is required' });

        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId
        });
        if (!existingUser) return res.failure({ message: 'User not found' });

        const onboarding = await dbService.findOne(model.zupayOnboarding, {
            userId: existingUser.id,
            companyId: existingUser.companyId
        });
        if (!onboarding || !onboarding.isInitiated) {
            return res.failure({ message: 'Please complete onboarding initiation first' });
        }
        if (!onboarding.contactId) {
            return res.failure({ message: 'Contact ID not found. Please initiate onboarding again.' });
        }

        const payload = {
            contact_id: onboarding.contactId,
            otp,
            pipe: ZUPAY_PIPE,
            device_info: deviceInfoFromReq(req.body)
        };

        const apiResponse = await zupayService.verifyOTP(payload);

        if (!isZupaySuccess(apiResponse)) {
            return res.failure({ message: getZupayError(apiResponse), data: apiResponse });
        }

        await dbService.update(
            model.zupayOnboarding,
            { id: onboarding.id },
            {
                isOtpVerified: true,
                otpStatus: apiResponse.data?.status
            }
        );

        return res.success({
            message: apiResponse.meta?.message || 'OTP verified successfully',
            data: apiResponse.data
        });
    } catch (err) {
        console.error('[ZupayAeps] verifyOTP error:', err);
        return res.failure({ message: err.message || 'Failed to verify OTP' });
    }
};

const resendOTP = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId
        });
        if (!existingUser) return res.failure({ message: 'User not found' });

        const onboarding = await dbService.findOne(model.zupayOnboarding, {
            userId: existingUser.id,
            companyId: existingUser.companyId
        });
        if (!onboarding || !onboarding.contactId) {
            return res.failure({ message: 'Onboarding not initiated. Please start from the beginning.' });
        }

        const payload = { contact_id: onboarding.contactId };

        const apiResponse = await zupayService.resendOTP(payload);

        if (!isZupaySuccess(apiResponse)) {
            return res.failure({ message: getZupayError(apiResponse), data: apiResponse });
        }

        return res.success({
            message: apiResponse.meta?.message || 'OTP resent successfully',
            data: apiResponse.data
        });
    } catch (err) {
        console.error('[ZupayAeps] resendOTP error:', err);
        return res.failure({ message: err.message || 'Failed to resend OTP' });
    }
};

const ekycBiometric = async (req, res) => {
    try {
        const { pid, pid_type } = req.body;
        if (!pid) return res.failure({ message: 'PID data is required' });

        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId
        });
        if (!existingUser) return res.failure({ message: 'User not found' });

        const onboarding = await dbService.findOne(model.zupayOnboarding, {
            userId: existingUser.id,
            companyId: existingUser.companyId
        });
        if (!onboarding || !onboarding.isOtpVerified) {
            return res.failure({ message: 'Please verify OTP first' });
        }

        const aadhaarNumber = existingUser.aadharDetails?.aadhaarNumber || '';

        const payload = {
            pipe: ZUPAY_PIPE,
            sub_merchant_details: {
                sub_merchant_code: onboarding.subMerchantCode,
                aadhaar_no: aadhaarNumber,
                pid: pid,
                pid_type: pid_type || 1
            },
            device_info: deviceInfoFromReq(req.body)
        };


        const apiResponse = await zupayService.biometricVerification(payload);

        if (!isZupaySuccess(apiResponse)) {
            await dbService.update(
                model.zupayOnboarding,
                { id: onboarding.id },
                {
                    isOtpVerified: false,
                    isEkycCompleted: false,
                    ekycStatus: 'PENDING',
                    ekycRemarks: getZupayError(apiResponse)
                }
            );
            return res.failure({ message: getZupayError(apiResponse), data: apiResponse });
        }

        const { e_kyc_status, remarks } = apiResponse.data;
        const ekycDone = e_kyc_status === 'EKYC_COMPLETE';

        await dbService.update(
            model.zupayOnboarding,
            { id: onboarding.id },
            {
                isEkycCompleted: ekycDone,
                ekycStatus: e_kyc_status,
                ekycRemarks: remarks,
                aadhaarNo: aadhaarNumber ? aadhaarNumber.slice(-4).padStart(aadhaarNumber.length, 'X') : null,
                onboardingStatus: ekycDone ? 'ACTIVE' : onboarding.onboardingStatus
            }
        );

        return res.success({
            message: apiResponse.meta?.message || 'eKYC verification completed',
            data: apiResponse.data,
            isActive: ekycDone
        });
    } catch (err) {
        console.error('[ZupayAeps] ekycBiometric error:', err);
        return res.failure({ message: err.message || 'Failed to complete eKYC' });
    }
};

const checkOnboardingStatus = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId
        });
        if (!existingUser) return res.failure({ message: 'User not found' });

        const onboarding = await dbService.findOne(model.zupayOnboarding, {
            userId: existingUser.id,
            companyId: existingUser.companyId
        });
        if (!onboarding || !onboarding.subMerchantCode) {
            return res.failure({ message: 'Sub-merchant not found. Please initiate onboarding first.' });
        }

        const payload = {
            pipe: ZUPAY_PIPE,
            sub_merchant_code: onboarding.subMerchantCode,
            device_info: deviceInfoFromReq(req.body)
        };

        const apiResponse = await zupayService.statusCheck(payload);

        if (!isZupaySuccess(apiResponse)) {
            return res.failure({ message: getZupayError(apiResponse), data: apiResponse });
        }

        const { onBoard_status, onBoard_remarks } = apiResponse.data;
        const isActive = onBoard_status === 'ACTIVE';

        await dbService.update(
            model.zupayOnboarding,
            { id: onboarding.id },
            {
                onboardingStatus: onBoard_status,
                onboardRemarks: onBoard_remarks
            }
        );

        return res.success({
            message: apiResponse.meta?.message || 'Onboarding status fetched',
            data: {
                ...apiResponse.data,
                isActive
            }
        });
    } catch (err) {
        console.error('[ZupayAeps] checkOnboardingStatus error:', err);
        return res.failure({ message: err.message || 'Failed to check onboarding status' });
    }
};

const buildTxnContext = async (req, skip2faCheck = false) => {
    const existingUser = await dbService.findOne(model.user, {
        id: req.user.id,
        companyId: req.user.companyId
    });
    if (!existingUser) throw new Error('User not found');

    const onboarding = await dbService.findOne(model.zupayOnboarding, {
        userId: existingUser.id,
        companyId: existingUser.companyId
    });
    if (!onboarding || onboarding.onboardingStatus !== 'ACTIVE') {
        throw new Error('Zupay AEPS onboarding is not completed. Current status: ' + (onboarding?.onboardingStatus || 'PENDING'));
    }

    if (!skip2faCheck) {
        const last2faDate = onboarding.last2faDate ? new Date(onboarding.last2faDate).toDateString() : null;
        const todayStr = new Date().toDateString();

        if (!onboarding.is2faVerified || last2faDate !== todayStr) {
            throw new Error('2FA Authentication required for today. Please complete daily authentication first.');
        }
    }

    return { existingUser, onboarding };
};

const saveTxnHistory = async (userId, companyId, txnData) => {
    try {
        await dbService.createOne(model.zupayAepsHistory, {
            refId: userId,
            companyId,
            ...txnData
        });
    } catch (dbErr) {
        console.error('[ZupayAeps] Failed to save transaction history:', dbErr.message);
    }
};

const dailyAuthentication = async (req, res) => {
    try {
        const { pid_data, pid_type, latitude, longitude, ipAddress } = req.body;
        if (!pid_data) return res.failure({ message: 'PID data is required' });

        const { existingUser, onboarding } = await buildTxnContext(req, true);

        // Check if already authenticated today
        const last2faDate = onboarding.last2faDate ? new Date(onboarding.last2faDate).toDateString() : null;
        const todayStr = new Date().toDateString();

        if (onboarding.is2faVerified && last2faDate === todayStr) {
            return res.success({ message: '2FA authentication already completed for today', data: { status: 'SUCCESS' } });
        }

        const aadhaarNumber = existingUser.aadharDetails?.aadhaarNumber || '';

        const merchantReferenceId = uuidv4();

        const payload = {
            merchant_reference_id: merchantReferenceId,
            merchant_code: onboarding.merchantCode || ZUPAY_MERCHANT_CODE,
            service_code: 'AEPS_2FA',
            sub_merchant_details: {
                sub_merchant_code: onboarding.subMerchantCode,
                geo_location: {
                    latitude: latitude || 0,
                    longitude: longitude || 0,
                    ip_address: ipAddress || req.ip || '0.0.0.0'
                },
                device_info: deviceInfoFromReq(req.body)
            },
            transaction_details: {
                service_code: 'AEPS_2FA',
                aadhaar_number: aadhaarNumber,
                pid_data,
                transaction_type: '2FA',
                pid_type: pid_type || 1
            }
        };
        console.log("payload", payload);

        const apiResponse = await zupayService.aeps2FA(payload);
        const success = isZupaySuccess(apiResponse);

        await dbService.update(
            model.zupayOnboarding,
            { id: onboarding.id },
            {
                is2faVerified: success,
                last2faDate: success ? new Date() : onboarding.last2faDate,
                twoFaStatus: apiResponse?.data?.status || (success ? 'SUCCESS' : 'FAILED')
            }
        );

        if (!success) {
            return res.failure({ message: getZupayError(apiResponse), data: apiResponse });
        }
        return res.success({
            message: apiResponse.meta?.message || '2FA authentication successful',
            data: apiResponse.data
        });
    } catch (err) {
        console.error('[ZupayAeps] dailyAuthentication error:', err);
        return res.failure({ message: err.message || 'Failed to perform 2FA authentication' });
    }
};

const cashWithdrawal = async (req, res) => {
    try {
        const {
            aadhaar_number, pid_data, pid_type, amount,
            bank_iin, mobile_number, customer_name, bank_name,
            device_serial, latitude, longitude, ipAddress
        } = req.body;

        if (!pid_data) return res.failure({ message: 'PID data is required' });
        if (!aadhaar_number) return res.failure({ message: 'Aadhaar number is required' });
        if (!amount) return res.failure({ message: 'Amount is required for cash withdrawal' });
        if (!bank_iin) return res.failure({ message: 'Bank IIN is required' });
        if (!mobile_number) return res.failure({ message: 'Mobile number is required' });
        if (!customer_name) return res.failure({ message: 'Customer name is required' });
        if (!bank_name) return res.failure({ message: 'Bank name is required' });

        const { existingUser, onboarding } = await buildTxnContext(req);

        const merchantReferenceId = uuidv4();

        const payload = {
            merchant_reference_id: merchantReferenceId,
            merchant_code: onboarding.merchantCode || ZUPAY_MERCHANT_CODE,
            service_code: 'AEPS_CW',
            amount: Number(amount),
            sub_merchant_details: {
                sub_merchant_code: onboarding.subMerchantCode,
                geo_location: {
                    latitude: latitude || 0,
                    longitude: longitude || 0,
                    ip_address: ipAddress || req.ip || '0.0.0.0'
                },
                device_info: deviceInfoFromReq(req.body)
            },
            transaction_details: {
                service_code: 'AEPS_CW',
                aadhaar_number,
                bank_iin,
                pid_data,
                device_serial: device_serial || '',
                transaction_type: 'CW',
                mobile_number,
                customer_name,
                bank_name,
                pid_type: pid_type || 1
            }
        };

        const apiResponse = await zupayService.cashWithdrawal(payload);
        const success = isZupaySuccess(apiResponse);

        await saveTxnHistory(existingUser.id, existingUser.companyId, {
            subMerchantCode: onboarding.subMerchantCode,
            merchantCode: onboarding.merchantCode,
            merchantReferenceId,
            transactionId: apiResponse?.data?.transaction_id,
            bankReferenceNumber: apiResponse?.data?.bank_reference_number,
            bankRRN: apiResponse?.data?.details?.bank_rrn,
            serviceCode: 'AEPS_CW',
            transactionType: 'CW',
            transactionAmount: Number(amount),
            accountBalance: apiResponse?.data?.details?.account_balance,
            aadhaarLastFour: aadhaar_number?.slice(-4),
            bankIin: bank_iin,
            bankName: bank_name,
            customerName: customer_name,
            mobileNumber: mobile_number,
            transactionStatus: success ? 'SUCCESS' : 'FAILED',
            responseCode: apiResponse?.meta?.response_code,
            responseMessage: apiResponse?.meta?.message,
            latitude: String(latitude),
            longitude: String(longitude),
            ipAddress: ipAddress || req.ip,
            deviceType: req.body.device_type,
            deviceOs: req.body.device_os,
            peripheral: req.body.peripheral,
            pidType: pid_type || 1,
            requestPayload: { ...payload, transaction_details: { ...payload.transaction_details, pid_data: 'REDACTED' } },
            responsePayload: apiResponse
        });

        if (!success) {
            return res.failure({ message: getZupayError(apiResponse), data: apiResponse });
        }
        return res.success({
            message: apiResponse.meta?.message || 'Cash withdrawal successful',
            data: apiResponse.data
        });
    } catch (err) {
        console.error('[ZupayAeps] cashWithdrawal error:', err);
        return res.failure({ message: err.message || 'Failed to perform cash withdrawal' });
    }
};

const balanceEnquiry = async (req, res) => {
    try {
        const {
            aadhaar_number, pid_data, pid_type,
            bank_iin, mobile_number, customer_name, bank_name,
            device_serial, latitude, longitude, ip_address
        } = req.body;

        if (!pid_data) return res.failure({ message: 'PID data is required' });
        if (!aadhaar_number) return res.failure({ message: 'Aadhaar number is required' });
        if (!bank_iin) return res.failure({ message: 'Bank IIN is required' });
        if (!mobile_number) return res.failure({ message: 'Mobile number is required' });
        if (!customer_name) return res.failure({ message: 'Customer name is required' });
        if (!bank_name) return res.failure({ message: 'Bank name is required' });

        const { existingUser, onboarding } = await buildTxnContext(req);

        const merchantReferenceId = uuidv4();

        const payload = {
            merchant_reference_id: merchantReferenceId,
            merchant_code: onboarding.merchantCode || zupayService.ZUPAY_MERCHANT_CODE,
            service_code: 'AEPS_BE',
            sub_merchant_details: {
                sub_merchant_code: onboarding.subMerchantCode,
                geo_location: {
                    latitude: latitude || 0,
                    longitude: longitude || 0,
                    ip_address: ip_address || req.ip || '0.0.0.0'
                },
                device_info: deviceInfoFromReq(req.body)
            },
            transaction_details: {
                service_code: 'AEPS_BE',
                aadhaar_number,
                bank_iin,
                pid_data,
                device_serial: device_serial || '',
                transaction_type: 'BE',
                mobile_number,
                customer_name,
                bank_name,
                pid_type: pid_type || 1
            }
        };

        const apiResponse = await zupayService.balanceEnquiry(payload);
        const success = isZupaySuccess(apiResponse);

        await saveTxnHistory(existingUser.id, existingUser.companyId, {
            subMerchantCode: onboarding.subMerchantCode,
            merchantCode: onboarding.merchantCode,
            merchantReferenceId,
            transactionId: apiResponse?.data?.transaction_id,
            bankReferenceNumber: apiResponse?.data?.bank_reference_number,
            bankRRN: apiResponse?.data?.details?.bank_rrn,
            serviceCode: 'AEPS_BE',
            transactionType: 'BE',
            accountBalance: apiResponse?.data?.details?.account_balance,
            aadhaarLastFour: aadhaar_number?.slice(-4),
            bankIin: bank_iin,
            bankName: bank_name,
            customerName: customer_name,
            mobileNumber: mobile_number,
            transactionStatus: success ? 'SUCCESS' : 'FAILED',
            responseCode: apiResponse?.meta?.response_code,
            responseMessage: apiResponse?.meta?.message,
            latitude: String(latitude),
            longitude: String(longitude),
            ipAddress: ip_address || req.ip,
            deviceType: req.body.device_type,
            deviceOs: req.body.device_os,
            peripheral: req.body.peripheral,
            pidType: pid_type || 1,
            requestPayload: { ...payload, transaction_details: { ...payload.transaction_details, pid_data: 'REDACTED' } },
            responsePayload: apiResponse
        });

        if (!success) {
            return res.failure({ message: getZupayError(apiResponse), data: apiResponse });
        }
        return res.success({
            message: apiResponse.meta?.message || 'Balance enquiry successful',
            data: apiResponse.data
        });
    } catch (err) {
        console.error('[ZupayAeps] balanceEnquiry error:', err);
        return res.failure({ message: err.message || 'Failed to perform balance enquiry' });
    }
};

const miniStatement = async (req, res) => {
    try {
        const {
            aadhaar_number, pid_data, pid_type,
            bank_iin, mobile_number, customer_name, bank_name,
            device_serial, latitude, longitude, ip_address
        } = req.body;

        if (!pid_data) return res.failure({ message: 'PID data is required' });
        if (!aadhaar_number) return res.failure({ message: 'Aadhaar number is required' });
        if (!bank_iin) return res.failure({ message: 'Bank IIN is required' });
        if (!mobile_number) return res.failure({ message: 'Mobile number is required' });
        if (!customer_name) return res.failure({ message: 'Customer name is required' });
        if (!bank_name) return res.failure({ message: 'Bank name is required' });

        const { existingUser, onboarding } = await buildTxnContext(req);

        const merchantReferenceId = uuidv4();

        const payload = {
            merchant_reference_id: merchantReferenceId,
            merchant_code: onboarding.merchantCode || zupayService.ZUPAY_MERCHANT_CODE,
            service_code: 'AEPS_MS',
            sub_merchant_details: {
                sub_merchant_code: onboarding.subMerchantCode,
                geo_location: {
                    latitude: latitude || 0,
                    longitude: longitude || 0,
                    ip_address: ip_address || req.ip || '0.0.0.0'
                },
                device_info: deviceInfoFromReq(req.body)
            },
            transaction_details: {
                service_code: 'AEPS_MS',
                aadhaar_number,
                bank_iin,
                pid_data,
                device_serial: device_serial || '',
                transaction_type: 'MS',
                mobile_number,
                customer_name,
                bank_name,
                pid_type: pid_type || 1
            }
        };

        const apiResponse = await zupayService.miniStatement(payload);
        const success = isZupaySuccess(apiResponse);

        await saveTxnHistory(existingUser.id, existingUser.companyId, {
            subMerchantCode: onboarding.subMerchantCode,
            merchantCode: onboarding.merchantCode,
            merchantReferenceId,
            transactionId: apiResponse?.data?.transaction_id,
            bankReferenceNumber: apiResponse?.data?.bank_reference_number,
            bankRRN: apiResponse?.data?.details?.bank_rrn,
            serviceCode: 'AEPS_MS',
            transactionType: 'MS',
            accountBalance: apiResponse?.data?.details?.account_balance,
            miniStatement: apiResponse?.data?.details?.mini_statement,
            aadhaarLastFour: aadhaar_number?.slice(-4),
            bankIin: bank_iin,
            bankName: bank_name,
            customerName: customer_name,
            mobileNumber: mobile_number,
            transactionStatus: success ? 'SUCCESS' : 'FAILED',
            responseCode: apiResponse?.meta?.response_code,
            responseMessage: apiResponse?.meta?.message,
            latitude: String(latitude),
            longitude: String(longitude),
            ipAddress: ip_address || req.ip,
            deviceType: req.body.device_type,
            deviceOs: req.body.device_os,
            peripheral: req.body.peripheral,
            pidType: pid_type || 1,
            requestPayload: { ...payload, transaction_details: { ...payload.transaction_details, pid_data: 'REDACTED' } },
            responsePayload: apiResponse
        });

        if (!success) {
            return res.failure({ message: getZupayError(apiResponse), data: apiResponse });
        }
        return res.success({
            message: apiResponse.meta?.message || 'Mini statement fetched successfully',
            data: apiResponse.data
        });
    } catch (err) {
        console.error('[ZupayAeps] miniStatement error:', err);
        return res.failure({ message: err.message || 'Failed to fetch mini statement' });
    }
};

const transactionHistory = async (req, res) => {
    try {
        const { page = 1, limit = 20, serviceCode } = req.body;

        const filter = {
            refId: req.user.id,
            companyId: req.user.companyId
        };
        if (serviceCode) filter.serviceCode = serviceCode;

        const history = await model.zupayAepsHistory.paginate({
            where: filter,
            order: [['createdAt', 'DESC']],
            page: Number(page),
            paginate: Number(limit)
        });

        return res.success({
            message: 'Transaction history fetched',
            data: history
        });
    } catch (err) {
        console.error('[ZupayAeps] transactionHistory error:', err);
        return res.failure({ message: err.message || 'Failed to fetch transaction history' });
    }
};

module.exports = {
    getOnboardingStatus,
    initiateOnboarding,
    verifyOTP,
    resendOTP,
    ekycBiometric,
    checkOnboardingStatus,
    dailyAuthentication,
    cashWithdrawal,
    balanceEnquiry,
    miniStatement,
    transactionHistory
};
