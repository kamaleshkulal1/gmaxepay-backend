const asl = require('../../../services/asl');
const dbService = require('../../../utils/dbService');
const model = require('../../../models');

const getDmtOnboardingStatus = async (req, res) => {
    try {
        const { senderMobileNo } = req.body;
        
        if(!senderMobileNo) {
            return res.failure({ message: 'senderMobileNo is required' });
        }

        // Check if DMT registration exists for this mobile number
        const dmtRegistration = await dbService.findOne(model.dmtRegistration, {
            senderMobileNo: senderMobileNo
        });

        if(!dmtRegistration) {
            return res.success({ 
                message: 'DMT registration not found',
                data: {
                    isRegistration: false,
                    isOtpVerified: false,
                    canDoTransaction: false,
                    message: 'Please complete DMT registration first'
                }
            });
        }

        const canDoTransaction = dmtRegistration.isRegistrationSuccess && dmtRegistration.isOtpVerified;

        return res.success({ 
            message: 'DMT onboarding status retrieved successfully',
            data: {
                isRegistration: dmtRegistration.isRegistrationSuccess,
                isOtpVerified: dmtRegistration.isOtpVerified,
                canDoTransaction: canDoTransaction,
                senderId: dmtRegistration.senderId,
                senderMobileNo: dmtRegistration.senderMobileNo
            }
        });
    } catch (error) {
        console.error('DMT Onboarding Status Error:', error);
        return res.failure({ message: error.message || 'Unable to get DMT onboarding status' });
    }
}

const createRegistration = async (req, res) => {
    try {
        const { senderMobileNo, senderName, senderGender } = req.body;
        
        if(!senderMobileNo) {
            return res.failure({ message: 'senderMobileNo is required' });
        }
        if(!senderName) {
            return res.failure({ message: 'senderName is required' });
        }
        if(!senderGender) {
            return res.failure({ message: 'senderGender is required' });
        }

        // Check if DMT registration already exists for this mobile number
        const existingDmtRegistration = await dbService.findOne(model.dmtRegistration, {
            senderMobileNo: senderMobileNo
        });

        if(existingDmtRegistration && existingDmtRegistration.isRegistrationSuccess) {
            return res.success({ 
                message: 'DMT registration already exists',
                data: {
                    senderId: existingDmtRegistration.senderId,
                    senderMobileNo: existingDmtRegistration.senderMobileNo,
                    isRegistration: true,
                    isOtpVerified: existingDmtRegistration.isOtpVerified
                }
            });
        }
        
        const payload = {
            senderMobileNo,
            senderName,
            senderGender,
        };

        const apiResponse = await asl.aslDmtSenderRegistration(payload);
        
        // Check if registration was successful
        if(apiResponse.status.toLowerCase() === 'success' && apiResponse.data && apiResponse.data.senderID) {
            // Create or update DMT registration record
            const registrationData = {
                refId: req.user.id,
                companyId: req.user.companyId,
                senderMobileNo: senderMobileNo,
                senderName: senderName,
                senderGender: senderGender,
                senderId: apiResponse.data.senderID,
                isRegistrationSuccess: true,
                isOtpVerified: false,
                registrationResponse: apiResponse
            };

            if(existingDmtRegistration) {
                // Update existing record
                await dbService.update(
                    model.dmtRegistration,
                    { id: existingDmtRegistration.id },
                    registrationData
                );
            } else {
                // Create new record
                await dbService.createOne(model.dmtRegistration, registrationData);
            }

            return res.success({ 
                message: 'DMT registration created successfully', 
                data: {
                    senderId: apiResponse.data.senderID,
                    senderMobileNo: apiResponse.data.senderMobileNo,
                    isRegistration: true,
                    isOtpVerified: false
                }
            });
        } else {
            // Registration failed
            const errorMessage = apiResponse.message || 'Registration failed';
            
            // Store failed attempt if record exists
            if(existingDmtRegistration) {
                await dbService.update(
                    model.dmtRegistration,
                    { id: existingDmtRegistration.id },
                    {
                        isRegistrationSuccess: false,
                        registrationResponse: apiResponse
                    }
                );
            }

            return res.failure({ message: errorMessage });
        }
    } catch (error) {
        console.error('DMT Registration Error:', error);
        return res.failure({ message: error.message || 'Unable to create DMT registration' });
    }
}

const ReceiveOtp = async (req, res) => {
    try {
        const { senderId, senderMobileNo, otpReference, beneficiaryAccno, beneficiaryMobile } = req.body;
        
        if(!senderId) {
            return res.failure({ message: 'senderId is required' });
        }
        if(!senderMobileNo) {
            return res.failure({ message: 'senderMobileNo is required' });
        }
        if(!otpReference) {
            return res.failure({ message: 'otpReference is required' });
        }

        // Check if DMT registration exists and is successful
        const dmtRegistration = await dbService.findOne(model.dmtRegistration, {
            senderId: senderId,
            senderMobileNo: senderMobileNo
        });

        if(!dmtRegistration || !dmtRegistration.isRegistrationSuccess) {
            return res.failure({ message: 'DMT registration not found or not completed. Please register first.' });
        }

        const payload = {
            senderId,
            senderMobileNo,
            otpReference,
        };

        // Add optional fields if provided
        if(beneficiaryAccno) payload.beneficiaryAccno = beneficiaryAccno;
        if(beneficiaryMobile) payload.beneficiaryMobile = beneficiaryMobile;

        const apiResponse = await asl.aslDmtReceiveOtp(payload);
        
        // Update DMT registration with OTP request response
        await dbService.update(
            model.dmtRegistration,
            { id: dmtRegistration.id },
            {
                otpReference: otpReference,
                otpRequestResponse: apiResponse
            }
        );

        return res.success({ 
            message: apiResponse.message || 'DMT OTP received successfully', 
            data: {
                otpReference: apiResponse.otpReference || otpReference,
                code: apiResponse.code
            }
        });
    } catch (error) {
        console.error('DMT Receive OTP Error:', error);
        return res.failure({ message: error.message || 'Unable to receive DMT OTP' });
    }
}

const VerifyOtp = async (req, res) => {
    try {
        const { senderId, senderMobileNo, otpReference, otp, beneficiaryAccno, beneficiaryMobile } = req.body;
        
        if(!senderId) {
            return res.failure({ message: 'senderId is required' });
        }
        if(!senderMobileNo) {
            return res.failure({ message: 'senderMobileNo is required' });
        }
        if(!otpReference) {
            return res.failure({ message: 'otpReference is required' });
        }
        if(!otp) {
            return res.failure({ message: 'otp is required' });
        }

        // Check if DMT registration exists and is successful
        const dmtRegistration = await dbService.findOne(model.dmtRegistration, {
            senderId: senderId,
            senderMobileNo: senderMobileNo
        });

        if(!dmtRegistration || !dmtRegistration.isRegistrationSuccess) {
            return res.failure({ message: 'DMT registration not found or not completed. Please register first.' });
        }

        const payload = {
            senderId,
            senderMobileNo,
            otpReference,
            otp,
        };

        // Add optional fields if provided
        if(beneficiaryAccno) payload.beneficiaryAccno = beneficiaryAccno;
        if(beneficiaryMobile) payload.beneficiaryMobile = beneficiaryMobile;

        const apiResponse = await asl.aslDmtVerifyOtp(payload);
        
        // Check if OTP verification was successful
        if(apiResponse.status && apiResponse.status.toLowerCase() === 'success' && apiResponse.code === 0) {
            // Update DMT registration with OTP verification success
            await dbService.update(
                model.dmtRegistration,
                { id: dmtRegistration.id },
                {
                    isOtpVerified: true,
                    otpVerifyResponse: apiResponse
                }
            );

            return res.success({ 
                message: 'DMT OTP verified successfully', 
                data: {
                    code: apiResponse.code,
                    message: apiResponse.message,
                    isRegistration: true,
                    isOtpVerified: true,
                    canDoTransaction: true,
                    senderId: senderId
                }
            });
        } else {
            // OTP verification failed
            await dbService.update(
                model.dmtRegistration,
                { id: dmtRegistration.id },
                {
                    isOtpVerified: false,
                    otpVerifyResponse: apiResponse
                }
            );

            return res.failure({ 
                message: apiResponse.message || 'OTP verification failed' 
            });
        }
    } catch (error) {
        console.error('DMT Verify OTP Error:', error);
        return res.failure({ message: error.message || 'Unable to verify DMT OTP' });
    }
}

const AddBeneficiary = async (req, res) => {
    try {
        const { senderId, senderMobileNo, beneficiaryName, beneficiaryAccno, bankIfscCod, beneficiaryBankName, beneficiaryMobileNumber, trnasferMode } = req.body;
        
        if(!senderId || !senderMobileNo || !beneficiaryName || !beneficiaryAccno || !bankIfscCod) {
            return res.failure({ message: 'Required fields: senderId, senderMobileNo, beneficiaryName, beneficiaryAccno, bankIfscCod' });
        }

        // Check if DMT registration exists and both registration and OTP are verified
        const dmtRegistration = await dbService.findOne(model.dmtRegistration, {
            senderId: senderId,
            senderMobileNo: senderMobileNo,
            companyId: req.user.companyId
        });

        if(!dmtRegistration || !dmtRegistration.isRegistrationSuccess || !dmtRegistration.isOtpVerified) {
            return res.failure({ message: 'DMT registration and OTP verification must be completed first' });
        }

        const payload = {
            senderId,
            senderMobileNo,
            beneficiaryName,
            beneficiaryAccno,
            bankIfscCod,
        };

        if(beneficiaryBankName) payload.beneficiaryBankName = beneficiaryBankName;
        if(beneficiaryMobileNumber) payload.beneficiaryMobileNumber = beneficiaryMobileNumber;
        if(trnasferMode) payload.trnasferMode = trnasferMode;

        const apiResponse = await asl.aslDmtAddBeneficiary(payload);
        return res.success({ message: 'DMT beneficiary added successfully', data: apiResponse });
    } catch (error) {
        console.error('DMT Add Beneficiary Error:', error);
        return res.failure({ message: error.message || 'Unable to add DMT beneficiary' });
    }
}

const GetBeneficiary = async (req, res) => {
    try {
        const { senderId, senderMobileNo } = req.body;
        
        if(!senderId || !senderMobileNo) {
            return res.failure({ message: 'senderId and senderMobileNo are required' });
        }

        const payload = {
            senderId,
            senderMobileNo,
        };

        const apiResponse = await asl.aslDmtGetBeneficiary(payload);
        return res.success({ message: 'DMT beneficiary retrieved successfully', data: apiResponse });
    } catch (error) {
        console.error('DMT Get Beneficiary Error:', error);
        return res.failure({ message: error.message || 'Unable to get DMT beneficiary' });
    }
}

const GetBeneficiaryName = async (req, res) => {
    try {
        const { senderId, senderMobileNo } = req.body;
        
        if(!senderId || !senderMobileNo) {
            return res.failure({ message: 'senderId and senderMobileNo are required' });
        }

        const payload = {
            senderId,
            senderMobileNo,
        };

        const apiResponse = await asl.aslDmtGetBeneficiaryNames(payload);
        return res.success({ message: 'DMT beneficiary name retrieved successfully', data: apiResponse });
    } catch (error) {
        console.error('DMT Get Beneficiary Name Error:', error);
        return res.failure({ message: error.message || 'Unable to get DMT beneficiary name' });
    }
}

const GetBeneficiaryDetails = async (req, res) => {
    try {
        const { senderId, senderMobileNo } = req.body;
        
        if(!senderId || !senderMobileNo) {
            return res.failure({ message: 'senderId and senderMobileNo are required' });
        }

        const payload = {
            senderId,
            senderMobileNo,
        };

        const apiResponse = await asl.aslDmtBeneficiaryDetails(payload);
        return res.success({ message: 'DMT beneficiary details retrieved successfully', data: apiResponse });
    } catch (error) {
        console.error('DMT Get Beneficiary Details Error:', error);
        return res.failure({ message: error.message || 'Unable to get DMT beneficiary details' });
    }
}

const MoneyTransfer = async (req, res) => {
    try {
        const { senderId, senderMobileNo, beneficiaryId, transferType, amount } = req.body;
        
        if(!senderId || !senderMobileNo || !beneficiaryId || !transferType || !amount) {
            return res.failure({ message: 'senderId, senderMobileNo, beneficiaryId, transferType, and amount are required' });
        }

        // Check if DMT registration exists and both registration and OTP are verified
        const dmtRegistration = await dbService.findOne(model.dmtRegistration, {
            senderId: senderId,
            senderMobileNo: senderMobileNo,
            companyId: req.user.companyId
        });

        if(!dmtRegistration || !dmtRegistration.isRegistrationSuccess || !dmtRegistration.isOtpVerified) {
            return res.failure({ message: 'DMT registration and OTP verification must be completed before making transactions' });
        }

        const payload = {
            senderId,
            senderMobileNo,
            beneficiaryId,
            transferType,
            amount
        };

        const apiResponse = await asl.aslDmtMoneyTransfer(payload);
        return res.success({ message: 'DMT money transferred successfully', data: apiResponse });
    } catch (error) {
        console.error('DMT Money Transfer Error:', error);
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
    MoneyTransfer
}