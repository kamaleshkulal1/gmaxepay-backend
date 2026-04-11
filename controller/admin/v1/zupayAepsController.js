const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const zupayService = require('../../../services/zupayService');
const ZUPAY_PIPE = process.env.ZUPAY_PIPE;

const isZupaySuccess = (response) => {
    if (!response) return false;
    if (response.status === 'FAILED') return false;
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

const checkOnboardingStatus = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.failure({ message: 'User ID is required' });

        const existingUser = await dbService.findOne(model.user, { id });
        if (!existingUser) return res.failure({ message: 'User not found' });

        const onboarding = await dbService.findOne(model.zupayOnboarding, {
            userId: existingUser.id,
            companyId: existingUser.companyId
        });

        if (!onboarding || !onboarding.subMerchantCode) {
            return res.failure({ message: 'Sub-merchant not found. Onboarding may not be initiated.' });
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
                onboardRemarks: onBoard_remarks,
                isEkycCompleted: isActive
            }
        );

        await dbService.update(
            model.user,
            { id: existingUser.id },
            { isAepsOnbaordingStatus: isActive }
        );

        return res.success({
            message: apiResponse.meta?.message || 'Onboarding status fetched',
            data: {
                ...apiResponse.data,
                isActive
            }
        });
    } catch (err) {
        console.error('[Admin ZupayAeps] checkOnboardingStatus error:', err);
        return res.failure({ message: err.message || 'Failed to check onboarding status' });
    }
};

module.exports = {
    checkOnboardingStatus
};
