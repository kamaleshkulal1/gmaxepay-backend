const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const zupayService = require('../../../services/zupayService');
const imageService = require('../../../services/imageService');
const { generateTransactionID } = require('../../../utils/transactionID');
const ZUPAY_MERCHANT_CODE = process.env.ZUPAY_MERCHANT_CODE;
const ZUPAY_PIPE = process.env.ZUPAY_PIPE;

const round4 = (num) => {
    const n = Number(num);
    return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 10000) / 10000 : 0;
};

const calcSlabAmount = (slab, base) => {
    if (!slab) return 0;
    const b = Number(base || 0), rc = Number(slab.commAmt || 0);
    if (!Number.isFinite(b) || !Number.isFinite(rc)) return 0;
    return (slab.amtType || 'fix').toLowerCase() === 'per' ? round4((b * rc) / 100) : round4(rc);
};


const isZupaySuccess = (response) => {
    if (!response) return false;
    if (response.errors && response.errors.length > 0) return false;
    if (!response.data) return false;

    if (response.meta?.response_code && String(response.meta.response_code).toUpperCase().includes('ERR')) return false;

    const data = response.data;
    if (data.status === 'FAILED') return false;
    if (data.onBoard_status === 'FAILED') return false;
    if (data.e_kyc_status === 'FAILED') return false;

    return true;
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
                    isEkycCompleted: false,
                    ekycStatus: 'PENDING',
                    ekycRemarks: getZupayError(apiResponse)
                }
            );
            return res.failure({ message: getZupayError(apiResponse), data: apiResponse });
        }

        // Call statusCheck after successful biometric verification
        const statusPayload = {
            pipe: ZUPAY_PIPE,
            sub_merchant_code: onboarding.subMerchantCode,
            device_info: deviceInfoFromReq(req.body)
        };
        const statusResponse = await zupayService.statusCheck(statusPayload);

        const { e_kyc_status, remarks } = apiResponse.data;
        const ekycDone = e_kyc_status === 'EKYC_COMPLETE';

        // Get status from statusResponse if successful, otherwise fallback to e_kyc_status logic
        let onBoardStatus = onboarding.onboardingStatus;
        let onboardRemarks = onboarding.onboardRemarks;

        if (isZupaySuccess(statusResponse)) {
            onBoardStatus = statusResponse.data.onBoard_status;
            onboardRemarks = statusResponse.data.onBoard_remarks;
        } else if (ekycDone) {
            onBoardStatus = 'ACTIVE';
            onboardRemarks = remarks;
        }

        await dbService.update(
            model.zupayOnboarding,
            { id: onboarding.id },
            {
                isEkycCompleted: ekycDone,
                ekycStatus: e_kyc_status,
                ekycRemarks: remarks,
                aadhaarNo: aadhaarNumber ? aadhaarNumber.slice(-4).padStart(aadhaarNumber.length, 'X') : null,
                onboardingStatus: onBoardStatus,
                onboardRemarks: onboardRemarks
            }
        );

        return res.success({
            message: isZupaySuccess(statusResponse) ? (statusResponse.meta?.message || 'Onboarding status updated') : (apiResponse.meta?.message || 'eKYC verification completed'),
            data: isZupaySuccess(statusResponse) ? statusResponse.data : apiResponse.data,
            isActive: onBoardStatus === 'ACTIVE'
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
            bank_iin, mobile_number, bank_name, customer_name,
            device_serial, latitude, longitude, ipAddress
        } = req.body;

        if (!pid_data) return res.failure({ message: 'PID data is required' });
        if (!aadhaar_number) return res.failure({ message: 'Aadhaar number is required' });
        if (!amount) return res.failure({ message: 'Amount is required for cash withdrawal' });
        if (!bank_iin) return res.failure({ message: 'Bank IIN is required' });
        if (!mobile_number) return res.failure({ message: 'Mobile number is required' });
        if (!bank_name) return res.failure({ message: 'Bank name is required' });

        const { existingUser, onboarding } = await buildTxnContext(req);
        const existingCompany = await dbService.findOne(model.company, { id: req.user.companyId });
        const transactionId = generateTransactionID(existingCompany?.companyName);
        const merchantReferenceId = uuidv4();
        const mock_response = req.body.mock_response || req.headers['x-mock-response'];

        const payload = {
            mock_response,
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
                customer_name: '',
                bank_name,
                pid_type: pid_type || 1
            }
        };

        const amountNumber = round4(amount || 0);

        const operator = await dbService.findOne(model.operator, {
            operatorType: 'AEPS1',
            minValue: { [Op.lte]: amountNumber },
            maxValue: { [Op.gte]: amountNumber }
        });
        const operatorType = operator?.operatorType || 'AEPS1';

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
                if (wlSlabAmount > operatorCommissionAmount) commData.amounts.saShortfall = round4(wlSlabAmount - operatorCommissionAmount);

                // Company (WL)
                commData.amounts.companyComm = Math.max(0, round4(wlSlabAmount - companyCost));
                if (companyCost > wlSlabAmount) commData.amounts.wlShortfall = round4(companyCost - wlSlabAmount);

                // Master Distributor
                if (commData.users.masterDistributor) {
                    let mdCost = commData.users.distributor ? distSlabAmount : retSlabAmount;
                    commData.amounts.mdComm = Math.max(0, round4(mdSlabAmount - mdCost));
                    if (mdCost > mdSlabAmount) commData.amounts.mdShortfall = round4(mdCost - mdSlabAmount);
                }

                // Distributor
                if (commData.users.distributor) {
                    commData.amounts.distComm = Math.max(0, round4(distSlabAmount - retSlabAmount));
                    if (retSlabAmount > distSlabAmount) commData.amounts.distShortfall = round4(retSlabAmount - distSlabAmount);
                }

                commData.amounts.retailerComm = retSlabAmount;

                const TDS_RATE = Number(process.env.AEPS_TDS_PERCENT || 2) / 100;
                const tds = (g) => round4(g * TDS_RATE);
                commData.tds = { superAdminTDS: tds(operatorCommissionAmount), whitelabelTDS: tds(wlSlabAmount), masterDistributorTDS: tds(mdSlabAmount), distributorTDS: tds(distSlabAmount), retailerTDS: tds(retSlabAmount) };
                commData.avail = { superAdminAvail: Boolean(commData.users.superAdmin), whitelabelAvail: Boolean(commData.users.companyAdmin), masterDistributorAvail: Boolean(commData.users.masterDistributor), distributorAvail: Boolean(commData.users.distributor), retailerAvail: Boolean(commData.users.retailer) };
            }
        }

        const apiResponse = await zupayService.cashWithdrawal(payload);
        const success = isZupaySuccess(apiResponse);
        console.log("success", success)
        console.log("apiResponse", apiResponse);

        const merchantTransactionId = apiResponse?.data?.transaction_id || merchantReferenceId;
        const paymentStatus = success ? 'SUCCESS' : 'FAILED';

        const retailerCommAmt = commData.amounts.retailerComm || 0, distCommAmt = commData.amounts.distComm || 0;
        const mdCommAmt = commData.amounts.mdComm || 0, companyCommAmt = commData.amounts.companyComm || 0, superAdminCommAmt = commData.amounts.superAdminComm || 0;
        const distShortfallAmt = commData.amounts.distShortfall || 0, mdShortfallAmt = commData.amounts.mdShortfall || 0;
        const wlShortfallAmt = commData.amounts.wlShortfall || 0, saShortfallAmt = commData.amounts.saShortfall || 0;
        const retailerTDS = commData.tds?.retailerTDS || 0, distributorTDS = commData.tds?.distributorTDS || 0;
        const masterDistTDS = commData.tds?.masterDistributorTDS || 0, whitelabelTDS = commData.tds?.whitelabelTDS || 0, superAdminTDS = commData.tds?.superAdminTDS || 0;
        const retailerNetAmt = round4(retailerCommAmt - retailerTDS), distNetAmt = round4(distCommAmt - distributorTDS);
        const mdNetAmt = round4(mdCommAmt - masterDistTDS), companyNetAmt = round4(companyCommAmt - whitelabelTDS), superAdminNetAmt = round4(superAdminCommAmt - superAdminTDS);

        let wallet = await model.wallet.findOne({ where: { refId: req.user.id, companyId: req.user.companyId } });
        if (!wallet) wallet = await model.wallet.create({ refId: req.user.id, companyId: req.user.companyId, roleType: req.user.userType, mainWallet: 0, apes1Wallet: 0, apes2Wallet: 0, addedBy: req.user.id, updatedBy: req.user.id });
        const openingWallet = round4(wallet.apes1Wallet || 0);
        const initiatorCredit = [4, 5].includes(user.userRole) ? (user.userRole === 5 ? round4(amountNumber + retailerNetAmt) : round4(amountNumber + distNetAmt)) : 0;
        const closingWallet = success ? round4(openingWallet + initiatorCredit) : openingWallet;

        if (success) {
            const remarkText = `AEPS1 CW-${bank_name}`;
            const walletUpdates = [], historyPromises = [];
            if ([4, 5].includes(user.userRole) && commData.users.companyAdmin) {
                if (initiatorCredit > 0) walletUpdates.push(dbService.update(model.wallet, { id: wallet.id }, { apes1Wallet: closingWallet, updatedBy: req.user.id }));
                historyPromises.push(dbService.createOne(model.walletHistory, { refId: req.user.id, companyId: req.user.companyId, walletType: 'AEPS1', operator: bank_name, amount: amountNumber, comm: [4, 5].includes(user.userRole) ? (user.userRole === 5 ? retailerCommAmt : distCommAmt) : 0, surcharge: 0, openingAmt: openingWallet, closingAmt: closingWallet, credit: initiatorCredit, debit: 0, merchantTransactionId, transactionId: apiResponse?.data?.transaction_id, paymentStatus, remark: remarkText, aepsTxnType: 'CW', bankiin: bank_iin, superadminComm: superAdminCommAmt, whitelabelComm: companyCommAmt, masterDistributorCom: mdCommAmt, distributorCom: distCommAmt, retailerCom: retailerCommAmt, superadminCommTDS: superAdminTDS, whitelabelCommTDS: whitelabelTDS, masterDistributorComTDS: masterDistTDS, distributorComTDS: distributorTDS, retailerComTDS: retailerTDS, addedBy: req.user.id, updatedBy: req.user.id }));
                if (commData.users.distributor && commData.wallets.distributorWallet && user.userRole === 5) {
                    const dW = commData.wallets.distributorWallet, dO = round4(dW.apes1Wallet || 0), dC = round4(dO + distNetAmt - distShortfallAmt);
                    walletUpdates.push(dbService.update(model.wallet, { id: dW.id }, { apes1Wallet: dC, updatedBy: commData.users.distributor.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.distributor.id, companyId: user.companyId, walletType: 'AEPS1', operator: bank_name, remark: `${remarkText} - dist comm`, amount: amountNumber, comm: distCommAmt, surcharge: 0, openingAmt: dO, closingAmt: dC, credit: distNetAmt, debit: distShortfallAmt + distributorTDS, merchantTransactionId, transactionId: apiResponse?.data?.transaction_id, paymentStatus, aepsTxnType: 'CW', bankiin: bank_iin, distributorCom: distCommAmt, distributorComTDS: distributorTDS, addedBy: commData.users.distributor.id, updatedBy: commData.users.distributor.id }));
                }
                if (commData.users.masterDistributor && commData.wallets.masterDistributorWallet) {
                    const mW = commData.wallets.masterDistributorWallet, mO = round4(mW.apes1Wallet || 0), mC = round4(mO + mdNetAmt - mdShortfallAmt);
                    walletUpdates.push(dbService.update(model.wallet, { id: mW.id }, { apes1Wallet: mC, updatedBy: commData.users.masterDistributor.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.masterDistributor.id, companyId: user.companyId, walletType: 'AEPS1', operator: bank_name, remark: `${remarkText} - md comm`, amount: amountNumber, comm: mdCommAmt, surcharge: 0, openingAmt: mO, closingAmt: mC, credit: mdNetAmt, debit: mdShortfallAmt + masterDistTDS, merchantTransactionId, transactionId: apiResponse?.data?.transaction_id, paymentStatus, aepsTxnType: 'CW', bankiin: bank_iin, masterDistributorCom: mdCommAmt, masterDistributorComTDS: masterDistTDS, addedBy: commData.users.masterDistributor.id, updatedBy: commData.users.masterDistributor.id }));
                }
                if (commData.wallets.companyWallet) {
                    const cW = commData.wallets.companyWallet, cO = round4(cW.apes1Wallet || 0), cC = round4(cO + companyNetAmt - wlShortfallAmt);
                    walletUpdates.push(dbService.update(model.wallet, { id: cW.id }, { apes1Wallet: cC, updatedBy: commData.users.companyAdmin.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.companyAdmin.id, companyId: user.companyId, walletType: 'AEPS1', operator: bank_name, remark: `${remarkText} - company comm`, amount: amountNumber, comm: companyCommAmt, surcharge: 0, openingAmt: cO, closingAmt: cC, credit: companyNetAmt, debit: wlShortfallAmt + whitelabelTDS, merchantTransactionId, transactionId: apiResponse?.data?.transaction_id, paymentStatus, aepsTxnType: 'CW', bankiin: bank_iin, whitelabelComm: companyCommAmt, whitelabelCommTDS: whitelabelTDS, addedBy: commData.users.companyAdmin.id, updatedBy: commData.users.companyAdmin.id }));
                }
                if (commData.wallets.superAdminWallet) {
                    const sW = commData.wallets.superAdminWallet, sO = round4(sW.apes1Wallet || 0), sC = round4(sO + superAdminNetAmt - saShortfallAmt);
                    walletUpdates.push(dbService.update(model.wallet, { id: sW.id }, { apes1Wallet: sC, updatedBy: commData.users.superAdmin.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.superAdmin.id, companyId: 1, walletType: 'AEPS1', operator: bank_name, remark: `${remarkText} - admin comm`, amount: amountNumber, comm: superAdminCommAmt, surcharge: 0, openingAmt: sO, closingAmt: sC, credit: superAdminNetAmt, debit: saShortfallAmt + superAdminTDS, merchantTransactionId, transactionId: apiResponse?.data?.transaction_id, paymentStatus, aepsTxnType: 'CW', bankiin: bank_iin, superadminComm: superAdminCommAmt, superadminCommTDS: superAdminTDS, addedBy: commData.users.superAdmin.id, updatedBy: commData.users.superAdmin.id }));
                }
                await Promise.all([...walletUpdates, ...historyPromises]);
            } else {
                if (initiatorCredit > 0) walletUpdates.push(dbService.update(model.wallet, { id: wallet.id }, { apes1Wallet: closingWallet, updatedBy: req.user.id }));
                historyPromises.push(dbService.createOne(model.walletHistory, { refId: req.user.id, companyId: req.user.companyId, walletType: 'AEPS1', operator: bank_name, amount: amountNumber, comm: 0, surcharge: 0, openingAmt: openingWallet, closingAmt: closingWallet, credit: initiatorCredit, debit: 0, merchantTransactionId, transactionId: apiResponse?.data?.transaction_id, paymentStatus, remark: `AEPS1 CW-${bank_name}`, aepsTxnType: 'CW', bankiin: bank_iin, addedBy: req.user.id, updatedBy: req.user.id }));
                await Promise.all([...walletUpdates, ...historyPromises]);
            }
        }

        await saveTxnHistory(existingUser.id, existingUser.companyId, {
            subMerchantCode: onboarding.subMerchantCode,
            merchantCode: onboarding.merchantCode,
            merchantReferenceId,
            transactionId: transactionId,
            bankReferenceNumber: apiResponse?.data?.bank_reference_number,
            bankRRN: apiResponse?.data?.details?.bank_rrn,
            serviceCode: 'AEPS_CW',
            transactionType: 'CW',
            transactionAmount: Number(amount),
            accountBalance: apiResponse?.data?.details?.account_balance,
            aadhaarLastFour: aadhaar_number?.slice(-4),
            bankIin: bank_iin,
            bankName: bank_name,
            customerName: customer_name || '',
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
            responsePayload: apiResponse,
            openingWallet,
            closingWallet,
            credit: success ? initiatorCredit : 0,
            superadminComm: superAdminCommAmt,
            whitelabelComm: companyCommAmt,
            masterDistributorCom: mdCommAmt,
            distributorCom: distCommAmt,
            retailerCom: retailerCommAmt,
            superadminCommTDS: superAdminTDS,
            whitelabelCommTDS: whitelabelTDS,
            masterDistributorComTDS: masterDistTDS,
            distributorComTDS: distributorTDS,
            retailerComTDS: retailerTDS,
            ...commData.avail
        });

        if (!success) {
            return res.failure({ message: getZupayError(apiResponse), data: apiResponse });
        }
        const response = {
            ...apiResponse?.data,
            transactionId
        }
        return res.success({
            message: apiResponse.meta?.message || 'Cash withdrawal successful',
            data: response
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
            bank_iin, mobile_number, bank_name, customer_name,
            device_serial, latitude, longitude, ipAddress
        } = req.body;

        if (!pid_data) return res.failure({ message: 'PID data is required' });
        if (!aadhaar_number) return res.failure({ message: 'Aadhaar number is required' });
        if (!bank_iin) return res.failure({ message: 'Bank IIN is required' });
        if (!mobile_number) return res.failure({ message: 'Mobile number is required' });
        if (!bank_name) return res.failure({ message: 'Bank name is required' });

        const { existingUser, onboarding } = await buildTxnContext(req);
        const existingCompany = await dbService.findOne(model.company, { id: req.user.companyId });
        const transactionId = generateTransactionID(existingCompany?.companyName);
        const mock_response = req.body.mock_response || req.headers['x-mock-response'];
        const merchantReferenceId = uuidv4();
        const payload = {
            mock_response,
            merchant_reference_id: merchantReferenceId,
            merchant_code: onboarding.merchantCode || zupayService.ZUPAY_MERCHANT_CODE,
            service_code: 'AEPS_BE',
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
                service_code: 'AEPS_BE',
                aadhaar_number,
                bank_iin,
                pid_data,
                device_serial: device_serial || '',
                transaction_type: 'BE',
                mobile_number,
                customer_name: '',
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
            transactionId: transactionId,
            bankReferenceNumber: apiResponse?.data?.bank_reference_number,
            bankRRN: apiResponse?.data?.details?.bank_rrn,
            serviceCode: 'AEPS_BE',
            transactionType: 'BE',
            accountBalance: apiResponse?.data?.details?.account_balance,
            aadhaarLastFour: aadhaar_number?.slice(-4),
            bankIin: bank_iin,
            bankName: bank_name,
            customerName: customer_name || '',
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
        const response = {
            ...apiResponse?.data,
            transactionId
        }
        return res.success({
            message: apiResponse.meta?.message || 'Balance enquiry successful',
            data: response
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
            bank_iin, mobile_number, bank_name, customer_name,
            device_serial, latitude, longitude, ipAddress
        } = req.body;

        if (!pid_data) return res.failure({ message: 'PID data is required' });
        if (!aadhaar_number) return res.failure({ message: 'Aadhaar number is required' });
        if (!bank_iin) return res.failure({ message: 'Bank IIN is required' });
        if (!mobile_number) return res.failure({ message: 'Mobile number is required' });
        if (!bank_name) return res.failure({ message: 'Bank name is required' });

        const { existingUser, onboarding } = await buildTxnContext(req);
        const existingCompany = await dbService.findOne(model.company, { id: req.user.companyId });
        const transactionId = generateTransactionID(existingCompany?.companyName);
        const mock_response = req.body.mock_response || req.headers['x-mock-response'];
        const merchantReferenceId = uuidv4();
        const payload = {
            mock_response,
            merchant_reference_id: merchantReferenceId,
            merchant_code: onboarding.merchantCode || zupayService.ZUPAY_MERCHANT_CODE,
            service_code: 'AEPS_MS',
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
                service_code: 'AEPS_MS',
                aadhaar_number,
                bank_iin,
                pid_data,
                device_serial: device_serial || '',
                transaction_type: 'MS',
                mobile_number,
                customer_name: '',
                bank_name,
                pid_type: pid_type || 1
            }
        };

        const operator = await dbService.findOne(model.operator, { operatorName: 'AEPS1_MS' });
        const operatorType = operator?.operatorType || 'AEPS1_MS';

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

                // Calculate amounts
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
                if (wlSlabAmount > operatorCommissionAmount) commData.amounts.saShortfall = round4(wlSlabAmount - operatorCommissionAmount);

                // Company (WL)
                commData.amounts.companyComm = Math.max(0, round4(wlSlabAmount - companyCost));
                if (companyCost > wlSlabAmount) commData.amounts.wlShortfall = round4(companyCost - wlSlabAmount);

                // Master Distributor
                if (commData.users.masterDistributor) {
                    let mdCost = commData.users.distributor ? distSlabAmount : retSlabAmount;
                    commData.amounts.mdComm = Math.max(0, round4(mdSlabAmount - mdCost));
                    if (mdCost > mdSlabAmount) commData.amounts.mdShortfall = round4(mdCost - mdSlabAmount);
                }

                // Distributor
                if (commData.users.distributor) {
                    commData.amounts.distComm = Math.max(0, round4(distSlabAmount - retSlabAmount));
                    if (retSlabAmount > distSlabAmount) commData.amounts.distShortfall = round4(retSlabAmount - distSlabAmount);
                }

                commData.amounts.retailerComm = retSlabAmount;

                const TDS_RATE = Number(process.env.AEPS_TDS_PERCENT || 2) / 100;
                const tds = (g) => round4(g * TDS_RATE);
                commData.tds = { superAdminTDS: tds(operatorCommissionAmount), whitelabelTDS: tds(wlSlabAmount), masterDistributorTDS: tds(mdSlabAmount), distributorTDS: tds(distSlabAmount), retailerTDS: tds(retSlabAmount) };
                commData.avail = { superAdminAvail: Boolean(commData.users.superAdmin), whitelabelAvail: Boolean(commData.users.companyAdmin), masterDistributorAvail: Boolean(commData.users.masterDistributor), distributorAvail: Boolean(commData.users.distributor), retailerAvail: Boolean(commData.users.retailer) };
            }
        }

        const apiResponse = await zupayService.miniStatement(payload);
        const success = isZupaySuccess(apiResponse);

        const merchantTransactionId = apiResponse?.data?.transaction_id || merchantReferenceId;
        const paymentStatus = success ? 'SUCCESS' : 'FAILED';

        const retailerCommAmt = commData.amounts.retailerComm || 0, distCommAmt = commData.amounts.distComm || 0;
        const mdCommAmt = commData.amounts.mdComm || 0, companyCommAmt = commData.amounts.companyComm || 0, superAdminCommAmt = commData.amounts.superAdminComm || 0;
        const distShortfallAmt = commData.amounts.distShortfall || 0, mdShortfallAmt = commData.amounts.mdShortfall || 0;
        const wlShortfallAmt = commData.amounts.wlShortfall || 0, saShortfallAmt = commData.amounts.saShortfall || 0;
        const retailerTDS = commData.tds?.retailerTDS || 0, distributorTDS = commData.tds?.distributorTDS || 0;
        const masterDistTDS = commData.tds?.masterDistributorTDS || 0, whitelabelTDS = commData.tds?.whitelabelTDS || 0, superAdminTDS = commData.tds?.superAdminTDS || 0;
        const retailerNetAmt = round4(retailerCommAmt - retailerTDS), distNetAmt = round4(distCommAmt - distributorTDS);
        const mdNetAmt = round4(mdCommAmt - masterDistTDS), companyNetAmt = round4(companyCommAmt - whitelabelTDS), superAdminNetAmt = round4(superAdminCommAmt - superAdminTDS);

        let wallet = await model.wallet.findOne({ where: { refId: req.user.id, companyId: req.user.companyId } });
        if (!wallet) wallet = await model.wallet.create({ refId: req.user.id, companyId: req.user.companyId, roleType: req.user.userType, mainWallet: 0, apes1Wallet: 0, apes2Wallet: 0, addedBy: req.user.id, updatedBy: req.user.id });
        const openingWallet = round4(wallet.apes1Wallet || 0);
        const initiatorCredit = [4, 5].includes(user.userRole) ? (user.userRole === 5 ? round4(retailerNetAmt) : round4(distNetAmt)) : 0;
        const closingWallet = success ? round4(openingWallet + initiatorCredit) : openingWallet;

        if (success) {
            const remarkText = `AEPS1 MS-${bank_name}`;
            const walletUpdates = [], historyPromises = [];
            if ([4, 5].includes(user.userRole) && commData.users.companyAdmin) {
                if (initiatorCredit > 0) walletUpdates.push(dbService.update(model.wallet, { id: wallet.id }, { apes1Wallet: closingWallet, updatedBy: req.user.id }));
                historyPromises.push(dbService.createOne(model.walletHistory, { refId: req.user.id, companyId: req.user.companyId, walletType: 'AEPS1', operator: bank_name, amount: 0, comm: [4, 5].includes(user.userRole) ? (user.userRole === 5 ? retailerCommAmt : distCommAmt) : 0, surcharge: 0, openingAmt: openingWallet, closingAmt: closingWallet, credit: initiatorCredit, debit: 0, merchantTransactionId, transactionId: apiResponse?.data?.transaction_id, paymentStatus, remark: remarkText, aepsTxnType: 'MS', bankiin: bank_iin, superadminComm: superAdminCommAmt, whitelabelComm: companyCommAmt, masterDistributorCom: mdCommAmt, distributorCom: distCommAmt, retailerCom: retailerCommAmt, superadminCommTDS: superAdminTDS, whitelabelCommTDS: whitelabelTDS, masterDistributorComTDS: masterDistTDS, distributorComTDS: distributorTDS, retailerComTDS: retailerTDS, addedBy: req.user.id, updatedBy: req.user.id }));
                if (commData.users.distributor && commData.wallets.distributorWallet && user.userRole === 5) {
                    const dW = commData.wallets.distributorWallet, dO = round4(dW.apes1Wallet || 0), dC = round4(dO + distNetAmt - distShortfallAmt);
                    walletUpdates.push(dbService.update(model.wallet, { id: dW.id }, { apes1Wallet: dC, updatedBy: commData.users.distributor.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.distributor.id, companyId: user.companyId, walletType: 'AEPS1', operator: bank_name, remark: `${remarkText} - dist comm`, amount: 0, comm: distCommAmt, surcharge: 0, openingAmt: dO, closingAmt: dC, credit: distNetAmt, debit: distShortfallAmt + distributorTDS, merchantTransactionId, transactionId: apiResponse?.data?.transaction_id, paymentStatus, aepsTxnType: 'MS', bankiin: bank_iin, distributorCom: distCommAmt, distributorComTDS: distributorTDS, addedBy: commData.users.distributor.id, updatedBy: commData.users.distributor.id }));
                }
                if (commData.users.masterDistributor && commData.wallets.masterDistributorWallet) {
                    const mW = commData.wallets.masterDistributorWallet, mO = round4(mW.apes1Wallet || 0), mC = round4(mO + mdNetAmt - mdShortfallAmt);
                    walletUpdates.push(dbService.update(model.wallet, { id: mW.id }, { apes1Wallet: mC, updatedBy: commData.users.masterDistributor.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.masterDistributor.id, companyId: user.companyId, walletType: 'AEPS1', operator: bank_name, remark: `${remarkText} - md comm`, amount: 0, comm: mdCommAmt, surcharge: 0, openingAmt: mO, closingAmt: mC, credit: mdNetAmt, debit: mdShortfallAmt + masterDistTDS, merchantTransactionId, transactionId: apiResponse?.data?.transaction_id, paymentStatus, aepsTxnType: 'MS', bankiin: bank_iin, masterDistributorCom: mdCommAmt, masterDistributorComTDS: masterDistTDS, addedBy: commData.users.masterDistributor.id, updatedBy: commData.users.masterDistributor.id }));
                }
                if (commData.wallets.companyWallet) {
                    const cW = commData.wallets.companyWallet, cO = round4(cW.apes1Wallet || 0), cC = round4(cO + companyNetAmt - wlShortfallAmt);
                    walletUpdates.push(dbService.update(model.wallet, { id: cW.id }, { apes1Wallet: cC, updatedBy: commData.users.companyAdmin.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.companyAdmin.id, companyId: user.companyId, walletType: 'AEPS1', operator: bank_name, remark: `${remarkText} - company comm`, amount: 0, comm: companyCommAmt, surcharge: 0, openingAmt: cO, closingAmt: cC, credit: companyNetAmt, debit: wlShortfallAmt + whitelabelTDS, merchantTransactionId, transactionId: apiResponse?.data?.transaction_id, paymentStatus, aepsTxnType: 'MS', bankiin: bank_iin, whitelabelComm: companyCommAmt, whitelabelCommTDS: whitelabelTDS, addedBy: commData.users.companyAdmin.id, updatedBy: commData.users.companyAdmin.id }));
                }
                if (commData.wallets.superAdminWallet) {
                    const sW = commData.wallets.superAdminWallet, sO = round4(sW.apes1Wallet || 0), sC = round4(sO + superAdminNetAmt - saShortfallAmt);
                    walletUpdates.push(dbService.update(model.wallet, { id: sW.id }, { apes1Wallet: sC, updatedBy: commData.users.superAdmin.id }));
                    historyPromises.push(dbService.createOne(model.walletHistory, { refId: commData.users.superAdmin.id, companyId: 1, walletType: 'AEPS1', operator: bank_name, remark: `${remarkText} - admin comm`, amount: 0, comm: superAdminCommAmt, surcharge: 0, openingAmt: sO, closingAmt: sC, credit: superAdminNetAmt, debit: saShortfallAmt + superAdminTDS, merchantTransactionId, transactionId: apiResponse?.data?.transaction_id, paymentStatus, aepsTxnType: 'MS', bankiin: bank_iin, superadminComm: superAdminCommAmt, superadminCommTDS: superAdminTDS, addedBy: commData.users.superAdmin.id, updatedBy: commData.users.superAdmin.id }));
                }
                await Promise.all([...walletUpdates, ...historyPromises]);
            } else {
                if (initiatorCredit > 0) walletUpdates.push(dbService.update(model.wallet, { id: wallet.id }, { apes1Wallet: closingWallet, updatedBy: req.user.id }));
                historyPromises.push(dbService.createOne(model.walletHistory, { refId: req.user.id, companyId: req.user.companyId, walletType: 'AEPS1', operator: bank_name, amount: 0, comm: 0, surcharge: 0, openingAmt: openingWallet, closingAmt: closingWallet, credit: initiatorCredit, debit: 0, merchantTransactionId, transactionId: apiResponse?.data?.transaction_id, paymentStatus, remark: `AEPS1 MS-${bank_name}`, aepsTxnType: 'MS', bankiin: bank_iin, addedBy: req.user.id, updatedBy: req.user.id }));
                await Promise.all([...walletUpdates, ...historyPromises]);
            }
        }

        await saveTxnHistory(existingUser.id, existingUser.companyId, {
            subMerchantCode: onboarding.subMerchantCode,
            merchantCode: onboarding.merchantCode,
            merchantReferenceId,
            transactionId: transactionId,
            bankReferenceNumber: apiResponse?.data?.bank_reference_number,
            bankRRN: apiResponse?.data?.details?.bank_rrn,
            serviceCode: 'AEPS_MS',
            transactionType: 'MS',
            accountBalance: apiResponse?.data?.details?.account_balance,
            miniStatement: apiResponse?.data?.details?.mini_statement,
            aadhaarLastFour: aadhaar_number?.slice(-4),
            bankIin: bank_iin,
            bankName: bank_name,
            customerName: customer_name || '',
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
            responsePayload: apiResponse,
            openingWallet,
            closingWallet,
            credit: success ? initiatorCredit : 0,
            superadminComm: superAdminCommAmt,
            whitelabelComm: companyCommAmt,
            masterDistributorCom: mdCommAmt,
            distributorCom: distCommAmt,
            retailerCom: retailerCommAmt,
            superadminCommTDS: superAdminTDS,
            whitelabelCommTDS: whitelabelTDS,
            masterDistributorComTDS: masterDistTDS,
            distributorComTDS: distributorTDS,
            retailerComTDS: retailerTDS,
            ...commData.avail
        });

        if (!success) {
            return res.failure({ message: getZupayError(apiResponse), data: apiResponse });
        }
        const response = {
            ...apiResponse?.data,
            transactionId
        }
        return res.success({
            message: apiResponse.meta?.message || 'Mini statement fetched successfully',
            data: response
        });
    } catch (err) {
        console.error('[ZupayAeps] miniStatement error:', err);
        return res.failure({ message: err.message || 'Failed to fetch mini statement' });
    }
};

const transactionHistory = async (req, res) => {
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
                message: 'Access denied. Only Master Distributor, Distributor, and Retailer can access transaction history.'
            });
        }

        const dataToFind = req.body || {};
        let options = {};
        let query = { companyId: companyId };

        if (userRole === 4 || userRole === 5) {
            query.refId = userId;
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
            const reportingUserIds = reportingUsers.map((u) => u.id);
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

        options.include = [
            {
                model: model.zupayBankList,
                as: 'bank',
                attributes: ['bankName'],
                required: false
            },
            {
                model: model.user,
                as: 'user',
                attributes: ['name', 'userRole'],
                required: false
            }
        ];

        const result = await dbService.paginate(model.zupayAepsHistory, query, options);

        const mappedData = result?.data?.map((transaction) => {
            const txData = transaction.toJSON ? transaction.toJSON() : transaction;
            const { bank, user, ...restData } = txData;
            return {
                ...restData,
                bankName: bank?.bankName || null,
                name: user?.name || null,
                userRole: user?.userRole || null
            };
        }) || [];

        return res.success({
            message: 'Zupay AEPS transaction history retrieved successfully',
            data: mappedData,
            total: result?.total || 0,
            paginator: result?.paginator
        });
    } catch (error) {
        console.error('Zupay AEPS transaction history error', error);
        return res.failure({ message: error.message || 'Unable to retrieve Zupay AEPS transaction history' });
    }
};

const getAeps3TransactionDetailsById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.failure({ message: 'Transaction ID is required' });
        }

        const [existingUser, transaction] = await Promise.all([
            dbService.findOne(model.user, {
                id: req.user.id,
                isActive: true
            }),
            dbService.findOne(model.zupayAepsHistory, { id })
        ]);

        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        if (![3, 4, 5].includes(existingUser.userRole)) {
            return res.failure({ message: 'Access denied. Unauthorized role.' });
        }

        if (!transaction) {
            return res.failure({ message: 'Transaction not found' });
        }

        let transactionUser, existingBankDetails, parentUser, companyDetails;

        if (existingUser.userRole === 5) {
            // Retailer: the transaction must belong to them
            if (transaction.refId !== existingUser.id) {
                return res.failure({ message: 'Access denied. Transaction does not belong to you.' });
            }

            [existingBankDetails, parentUser, companyDetails] = await Promise.all([
                dbService.findOne(model.zupayBankList, {
                    bankIin: transaction.bankIin
                }),
                existingUser.reportingTo ? dbService.findOne(model.user, {
                    id: existingUser.reportingTo,
                    isActive: true
                }) : Promise.resolve(null),
                dbService.findOne(model.company, {
                    id: existingUser.companyId
                })
            ]);

            if (!companyDetails) {
                return res.failure({ message: 'Company details not found' });
            }

            // If no direct parent, fall back to Company Admin
            if (!parentUser) {
                parentUser = await dbService.findOne(model.user, {
                    companyId: existingUser.companyId,
                    userRole: 2
                });
            }

            const data = {
                userDetails: {
                    name: existingUser.name,
                    userRole: existingUser.userRole,
                    userId: existingUser.userId,
                    mobileNo: existingUser.mobileNo
                },
                reportingUserDetails: {
                    companyName: companyDetails.companyName,
                    parentName: parentUser?.name || null,
                    parentRole: parentUser?.userRole || null,
                    parentUserId: parentUser?.userId || null
                },
                transactionDetails: {
                    amount: transaction.transactionAmount,
                    bankName: existingBankDetails?.bankName || transaction.bankName || null,
                    aadharNumber: transaction.aadhaarLastFour,
                    commission: transaction.retailerCom || 0
                },
                transaction: transaction
            };

            return res.success({
                message: 'Zupay AEPS transaction details retrieved successfully',
                data
            });

        } else {
            // Role 3 (MD) or 4 (Distributor): transaction user must report to them
            [transactionUser, existingBankDetails] = await Promise.all([
                dbService.findOne(model.user, {
                    id: transaction.refId,
                    companyId: transaction.companyId,
                    isActive: true
                }),
                dbService.findOne(model.zupayBankList, {
                    bankIin: transaction.bankIin
                })
            ]);

            if (!transactionUser) {
                return res.failure({ message: 'Transaction user details not found' });
            }

            // check if the transaction user reports correctly
            // For Role 3 (MD): check if transaction.refId's user reports to existingUser (Role 3)
            // or if they are a distributor (Role 4) reporting to this MD, and this transaction belongs to them.
            // Simplified: if transactionUser.reportingTo === existingUser.id
            if (transactionUser.reportingTo !== existingUser.id) {
                // Additional check: maybe they report to a distributor who reports to this MD
                const distributor = await dbService.findOne(model.user, { id: transactionUser.reportingTo, reportingTo: existingUser.id });
                if (!distributor && transactionUser.id !== existingUser.id) {
                    return res.failure({ message: 'Access denied. Transaction user does not report to you.' });
                }
            }

            companyDetails = await dbService.findOne(model.company, {
                id: transactionUser.companyId
            });

            if (!companyDetails) {
                return res.failure({ message: 'Company details not found' });
            }

            let commission = 0;
            if (existingUser.userRole === 3) {
                commission = transaction.masterDistributorCom || 0;
            } else if (existingUser.userRole === 4) {
                commission = transaction.distributorCom || 0;
            }

            const data = {
                userDetails: {
                    name: transactionUser.name,
                    userRole: transactionUser.userRole,
                    userId: transactionUser.userId,
                    mobileNo: transactionUser.mobileNo
                },
                reportingUserDetails: {
                    companyName: companyDetails.companyName,
                    parentName: existingUser.name,
                    parentRole: existingUser.userRole,
                    parentUserId: existingUser.userId
                },
                transactionDetails: {
                    amount: transaction.transactionAmount,
                    bankName: existingBankDetails?.bankName || transaction.bankName || null,
                    aadharNumber: transaction.aadhaarLastFour,
                    commission: commission
                },
                transaction: transaction
            };

            return res.success({
                message: 'Zupay AEPS transaction details retrieved successfully',
                data
            });
        }
    } catch (error) {
        console.error('Zupay AEPS transaction details error', error);
        return res.failure({
            message: error.message || 'Unable to retrieve Zupay AEPS transaction details'
        });
    }
};

const reconcile = async (req, res) => {
    try {
        const { merchant_reference_id } = req.body;
        if (!merchant_reference_id) {
            return res.failure({ message: 'Merchant reference ID is required' });
        }

        const zupayTransaction = await dbService.findOne(model.zupayAepsHistory, {
            merchantReferenceId: merchant_reference_id,
            companyId: req.user.companyId
        });
        if (!zupayTransaction) {
            return res.failure({ message: 'Zupay transaction not found' });
        }

        const payload = {
            merchant_reference_id,
            bank_rrn: zupayTransaction?.bankRRN,
            transaction_status: zupayTransaction?.transactionStatus,
            transaction_date: zupayTransaction?.createdAt ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata' }).format(new Date(zupayTransaction.createdAt)) : null,
            service_code: zupayTransaction?.serviceCode,
            merchant_code: zupayTransaction?.merchantCode,
            sub_merchant_code: zupayTransaction?.subMerchantCode
        };

        const apiResponse = await zupayService.reconcile(payload);

        if (!isZupaySuccess(apiResponse)) {
            return res.failure({ message: getZupayError(apiResponse), data: apiResponse });
        }

        const transaction = await dbService.findOne(model.zupayAepsHistory, {
            merchantReferenceId: merchant_reference_id,
            companyId: req.user.companyId
        });

        if (transaction) {
            const apiStatus = apiResponse.data?.status;
            const currentStatus = transaction.transactionStatus;

            if (apiStatus && apiStatus !== currentStatus) {
                await dbService.update(model.zupayAepsHistory, { id: transaction.id }, {
                    transactionStatus: apiStatus,
                    responsePayload: apiResponse
                });
            }
        }

        return res.success({
            message: apiResponse.meta?.message || 'Transaction reconciliation successful',
            data: apiResponse.data
        });
    } catch (err) {
        console.error('[ZupayAeps] reconcile error:', err);
        return res.failure({ message: err.message || 'Failed to reconcile transaction' });
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
        const banks = await dbService.findAll(model.zupayBankList, {
            isActive: true
        });

        // Map to response format with CDN URLs for logos
        const formattedBankList = banks.map(bank => {
            const bankData = bank.toJSON ? bank.toJSON() : bank;
            return {
                bankIIN: bankData.bankIin,
                bankName: bankData.bankName,
                bankLogo: imageService.getImageUrl(bankData.bankLogo, false)
            };
        });

        return res.success({
            message: 'Bank list retrieved successfully',
            data: formattedBankList
        });
    } catch (err) {
        console.error('[ZupayAeps] bankList error:', err);
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
            model.zupayAepsHistory,
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

        if (uniqueBankIINs.length === 0) {
            return res.success({
                message: 'Recent banks retrieved successfully',
                data: []
            });
        }

        const banks = await dbService.findAll(
            model.zupayBankList,
            {
                bankIin: { [Op.in]: uniqueBankIINs },
                isActive: true
            }
        );

        const bankMap = new Map();
        banks.forEach((bank) => {
            const bankData = bank.toJSON ? bank.toJSON() : bank;
            bankMap.set(bankData.bankIin, {
                bankIIN: bankData.bankIin,
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
    } catch (err) {
        console.error('[ZupayAeps] recentBanks error:', err);
        return res.failure({ message: err.message || 'Failed to retrieve recent banks' });
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
    transactionHistory,
    getAeps3TransactionDetailsById,
    reconcile,
    bankList,
    recentBanks
};
