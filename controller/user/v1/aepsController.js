const asl = require('../../../services/asl');
const dbService = require('../../../utils/dbService');
const model = require('../../../models');

const aepsOnboarding = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { id: req.user.id})
        if(!existingUser) {
            return res.failure({ message: 'User not found' });
        }
       
        const outletDetails = await dbService.findOne(model.outlet, { refId: existingUser.id});
        if(!outletDetails) {
            return res.failure({ message: 'Outlet not found' });
        }
        const customerBankDetails = await dbService.findOne(model.customerBank, { refId: existingUser.id});
        if(!customerBankDetails) {
            return res.failure({ message: 'Customer bank not found' });
        }
        
        const dataToSend = {
            retailerFirstName: existingUser.name,
            retailerMiddleName: existingUser.middleName,
            retailerLastName: existingUser.lastName,
            retailerEmail: existingUser.email,
            phone:existingUser.mobileNo,
            retailerDob: existingUser.dob,
            retailerCity: existingUser.city,
            retailerState: existingUser.state,
            retailerCountry: existingUser.country,
            retailerPincode : existingUser.zipcode,
            aadharNo:existingUser.aadharNo,
            panNo:existingUser.panNo,
            bankAccountNo:customerBankDetails.accountNumber,
            bankIfsc: customerBankDetails.ifsc,
            bankName: customerBankDetails.bankName,
            bankAccHolderName: customerBankDetails.beneficiaryName,
            latitude: existingUser.latitude,
            longitude: existingUser.longitude,
            shopName: outletDetails.shopName,
            retailerShopName: outletDetails.shopName,
            companyOrShopPan:outletDetails.pan,
            shopAddress:outletDetails.shopAddress,
            gstinNumber :outletDetails.gstNo,
            shopCity:outletDetails.shopCity,
            shopDistrict :outletDetails.shopDistrict,
            shopState:outletDetails.shopState,
            shopPincode:outletDetails.shopPincode,
            shopCountry:outletDetails?.shopCountry,
            shopLatitude:outletDetails.latitude,
            shopLongitude:outletDetails.longitude,
            retailerAddress : outletDetails.shopAddress,
            retailerAadhaarFrontImage:existingUser.aadharFrontImage,
            retailerAadhaarBackImage:existingUser.aadharBackImage,
            retailerPanFrontImage:existingUser.panFrontImage,
            retailerPanBackImage :existingUser.panBackImage,
            retailerShopImage :outletDetails.shopImage,
        }
        const aepsOnboardingDetails = await asl.aslAepsOnboarding(dataToSend);
        if(aepsOnboardingDetails.status === 'success') {
            return res.success({ message: 'Aeps onboarding successful', data: aepsOnboardingDetails });
        } else {
            return res.failure({ message: aepsOnboardingDetails.message });
        }
        return res.success({ message: 'Aeps onboarding successful', data: aepsOnboardingDetails });
    } catch (error) {
        console.error(error);
        return res.failure({ message: error.message });
    }
}

module.exports = { aepsOnboarding };