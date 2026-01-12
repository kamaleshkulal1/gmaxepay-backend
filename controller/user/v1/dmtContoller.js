const asl = require('../../../services/asl');
const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const getDmtOnboardingStatus = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if(!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const dmtOnboardingStatus = await dmtService.getDmtOnboardingStatus(existingUser);
        return res.success({ message: 'DMT onboarding status', data: dmtOnboardingStatus });
    } catch (error) {
        return res.failure({ message: error.message || 'Unable to get DMT onboarding status' });
    }
}
const  createRegistration = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if(!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const payload = {
            senderMobileNo,
            senderName,
            senderGender,
            sendergender:senderGender,
        }
        const dmtRegistration = await asl.aslDmtSenderRegistration(payload);
        return res.success({ message: 'DMT registration created successfully', data: dmtRegistration });
    } catch (error) {
        return res.failure({ message: error.message || 'Unable to create DMT registration' });
    }
}

const ReceiveOtp = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if(!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const payload = {
            senderId,
            senderMobileNo,
            otpReference,
            beneficiaryAccno,
            beneficiaryMobile
        }
        const dmtRegistration = await asl.aslDmtReceiveOtp(payload);
        return res.success({ message: 'DMT OTP received successfully', data: dmtRegistration });
    } catch (error) {
        return res.failure({ message: error.message || 'Unable to receive DMT OTP' });
    }
}

const VerifyOtp = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if(!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const payload = {
            senderId,
            senderMobileNo,
            otpReference,
            otp,
            beneficiaryAccno,
            beneficiaryMobile
        } 
        const dmtRegistration = await asl.aslDmtVerifyOtp(payload);
        return res.success({ message: 'DMT OTP verified successfully', data: dmtRegistration });
    } catch (error) {
        return res.failure({ message: error.message || 'Unable to verify DMT OTP' });
    }
}

const AddBeneficiary = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if(!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const payload = {
            senderId,
            senderMobileNo,
            beneficiaryName,
            beneficiaryAccno,
            bankIfscCod,
            beneficiaryBankName,
            beneficiaryMobileNumber,
            trnasferMode
        }
        const dmtRegistration = await asl.aslDmtAddBeneficiary(payload);
        return res.success({ message: 'DMT beneficiary added successfully', data: dmtRegistration });
    } catch (error) {
        return res.failure({ message: error.message || 'Unable to add DMT beneficiary' });
    }
}

const GetBeneficiary = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if(!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const payload = {
            senderId,
            senderMobileNo,
        }
        const dmtRegistration = await asl.aslDmtGetBeneficiary(payload);
        return res.success({ message: 'DMT beneficiary added successfully', data: dmtRegistration });
    } catch (error) {
        return res.failure({ message: error.message || 'Unable to get DMT beneficiary' });
    }
}

const GetBeneficiaryName = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if(!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const payload = {
            senderId,
            senderMobileNo,
        }
        const dmtRegistration = await asl.aslDmtGetBeneficiaryNames(payload);
        return res.success({ message: 'DMT beneficiary name added successfully', data: dmtRegistration });
    } catch (error) {
        return res.failure({ message: error.message || 'Unable to get DMT beneficiary name' });
    }
}
const GetBeneficiaryDetails = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if(!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const payload = {
            senderId,
            senderMobileNo,
        }
        const dmtRegistration = await asl.aslDmtBeneficiaryDetails(payload);
        return res.success({ message: 'DMT beneficiary details added successfully', data: dmtRegistration });
    } catch (error) {
        return res.failure({ message: error.message || 'Unable to get DMT beneficiary details' });
    }
}

const MoneyTransfer = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if(!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const payload = {
            senderId,
            senderMobileNo,
            beneficiaryId,
            transferType,
            amount
        }
        const dmtRegistration = await asl.aslDmtMoneyTransfer(payload);
        return res.success({ message: 'DMT money transferred successfully', data: dmtRegistration });
    } catch (error) {
        return res.failure({ message: error.message || 'Unable to transfer money' });
    }
}
module.exports = {
    getDmtOnboardingStatus,
    createRegistration,
    ReceiveOtp,
    VerifyOtp,
    AddBeneficiary,
    GetBeneficiary,
    GetBeneficiaryName,
    GetBeneficiaryDetails,
}