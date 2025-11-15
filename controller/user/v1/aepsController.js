const asl = require('../../../services/asl');
const dbService = require('../../../utils/dbService');
const model = require('../../../models');

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


        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        const existingCompany = await dbService.findOne(model.company, { id: existingUser.companyId });
        if (!existingCompany) {
            return res.failure({ message: 'Company not found' });
        }

        const [outletDetails, customerBankDetails] = await Promise.all([
            dbService.findOne(model.outlet, { refId: existingUser.id }),
            dbService.findOne(model.customerBank, { refId: existingUser.id })
        ]);

        if (!outletDetails) {
            return res.failure({ message: 'Outlet not found' });
        }
        if (!customerBankDetails) {
            return res.failure({ message: 'Customer bank not found' });
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
            gstinNumber: outletDetails.gstNo ,
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
        const isSuccess = normalizedStatus === 'success';

        if (isSuccess) {
            await dbService.createOne(model.aepsOnboarding, {
                userId: req.user.id,
                companyId: req.user.companyId,
                status: aepsOnboardingDetails.status,
                uniqueID: aepsOnboardingDetails.uniqueID,
                otpReferenceId: aepsOnboardingDetails.otpReferneceId,
                hash: aepsOnboardingDetails.hash,
                message: aepsOnboardingDetails.message,
                merchantStatus: aepsOnboardingDetails.data?.merchantStatus,
                remarks: aepsOnboardingDetails.data?.remarks,
                superMerchantId: aepsOnboardingDetails.data?.superMerchantId,
                merchantLoginId: aepsOnboardingDetails.data?.merchantLoginId,
                errorCodes: aepsOnboardingDetails.data?.errorCodes
            });

            return res.success({ message: 'AEPS onboarding successful', data: aepsOnboardingDetails });
        }

        return res.failure({ message: aepsOnboardingDetails?.message || 'AEPS onboarding failed', data: aepsOnboardingDetails });
    } catch (error) {
        console.error('AEPS onboarding error', error);
        return res.failure({ message: error.message || 'Unable to process AEPS onboarding' });
    }
};

module.exports = { aepsOnboarding };