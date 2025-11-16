const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const authService = require('../../../services/auth');
const { TYPES } = require('../../../constants/authConstant');

const login = async (req, res) => {
    try {
        const { mobileNo, password, latitude, longitude } = req.body;
        const companyId = req.headers['x-company-id'];
        if (!companyId) {
            return res.failure({ message: 'Company ID is required!' });
        }
        const existingCompany = await dbService.findOne(model.company, { id: companyId });

        if (!existingCompany) {
            return res.failure({ message: 'Company not found!' });
        }
        if (!mobileNo) {
            return res.failure({ message: 'Mobile number is required!' });
        }
        if (!password) {
            return res.failure({ message: 'Password is required!' });
        }

        if (password.length < 8) {
            return res.failure({ message: 'Password must be at least 8 characters long!' });
        }

        if (!latitude || !longitude) {
            return res.failure({ message: 'Location coordinates are required!' });
        }
        const existingUser = await dbService.findOne(model.user, { mobileNo ,companyId});
        if (!existingUser) {
            return res.failure({ message: 'User not found!' });
        }
        if(!existingUser.isActive){
            return res.failure({ message: 'User is not active! please contact support.' });
        }
        if(existingUser.kycStatus !== 'FULL_KYC' || existingUser.kycSteps !== 7) {
            return res.failure({ message: 'KYC is not completed! Please complete your KYC to login.' });
        }

        const userType = existingUser.userType;

        if (!userType) {
            return res.failure({ message: 'User type is required!' });
        }
        // Validate userType against valid types
        const validUserTypes = Object.values(TYPES);
        if (!validUserTypes.includes(userType)) {
            return res.failure({ message: 'Invalid user type. Valid types are: ' + validUserTypes.join(', ') });
        }

        const result = await authService.loginUser(
            mobileNo,
            password,
            latitude,
            longitude,
            userType,
            req,
            companyId
        );

        if (result.flag) {
            return res.failure({ message: result.msg });
        }

        return res.success({ 
            message: result.msg,
            data: result.data
        });

    } catch (error) {
        console.log(error);
        return res.internalServerError({ message: error.message });
    }
};

const verifyOTP = async (req, res) => {
    try {
        const { otp } = req.body;
        const companyId = req.headers['x-company-id'];
        const token = req.headers['token'];

        if (!companyId) {
            return res.failure({ message: 'Company ID is required!' });
        }
        const existingCompany = await dbService.findOne(model.company, { id: companyId });
        if (!existingCompany) {
            return res.failure({ message: 'Company not found!' });
        }

        if (!otp) {
            return res.failure({ message: 'OTP is required!' });
        }

        if (!token) {
            return res.failure({ message: 'Token is required!' });
        }
        
        const result = await authService.verifyMobileOTP(
            token,
            otp,
            companyId
        );

        if (result.flag) {
            return res.failure({ message: result.msg });
        }

        return res.success({ 
            message: result.msg,
            data: result.data
        });

    } catch (error) {
        console.log(error);
        return res.internalServerError({ message: error.message });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { newPassword, confirmPassword } = req.body;
        const companyId = req.headers['x-company-id'];
        const token = req.headers['token'];

        if (!companyId) {
            return res.failure({ message: 'Company ID is required!' });
        }
        const existingCompany = await dbService.findOne(model.company, { id: companyId });
        if (!existingCompany) {
            return res.failure({ message: 'Company not found!' });
        }

        if (!newPassword || !confirmPassword) {
            return res.failure({ message: 'New password and confirm password are required!!' });
        }

        if (newPassword.length < 8) {
            return res.failure({ message: 'New password must be at least 8 characters long!' });
        }

        if (!token) {
            return res.failure({ message: 'Token is required!' });
        }
        const result = await authService.resetPassword(
            token,
            newPassword,
            confirmPassword,
            companyId
        );

        if (result.flag) {
            return res.failure({ message: result.msg });
        }

        return res.success({ 
            message: result.msg,
            data: result.data
        });

    } catch (error) {
        console.log(error);
        return res.internalServerError({ message: error.message });
    }
};

const handle2FA = async (req, res) => {
    try {
        const { otp, latitude, longitude, ipAddress } = req.body;
        const companyId = req.headers['x-company-id'];
        const dataToken = req.headers['token'];

        if (!companyId) {
            return res.failure({ message: 'Company ID is required!' });
        }
        const existingCompany = await dbService.findOne(model.company, { id: companyId });
        if (!existingCompany) {
            return res.failure({ message: 'Company not found!' });
        }

        if (!otp) {
            return res.badRequest({ message: '2FA code is required!' });
        }

        if (!dataToken) {
            return res.badRequest({ message: 'Token is required!' });
        }
        
        const result = await authService.handle2FA(
            dataToken,
            otp,
            companyId,
            latitude,
            longitude,
            ipAddress
        );

        if (result.flag) {
            return res.badRequest({ message: result.msg });
        }

        return res.success({ 
            message: result.msg,
            data: result.data
        });

    } catch (error) {
        console.log(error);
        return res.internalServerError({ message: error.message });
    }
};

const resendOTP = async(req,res)=>{
    try{
        const companyId = req.headers['x-company-id'];
        const token = req.headers['token'];
        if (!companyId) {
            return res.failure({ message: 'Company ID is required!' });
        }
        const existingCompany = await dbService.findOne(model.company, { id: companyId });
        if (!existingCompany) {
            return res.failure({ message: 'Company not found!' });
        }
        if (!token) {
            return res.failure({ message: 'Token is required!' });
        }
        
        const result = await authService.resendMobileOTP(
            token,
            companyId
        );

        if (result.flag) {
            return res.failure({ message: result.msg });
        }

        return res.success({ 
            message: result.msg,
            data: result.data
        });
        
    }catch(error){
        console.log(error);
        return res.internalServerError({ message: error.message });
    }
}
const refreshAccessToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        const companyId = req.headers['x-company-id'];
        if (!companyId) {
            return res.failure({ message: 'Company ID is required!' });
        }
        const existingCompany = await dbService.findOne(model.company, { id: companyId });
        if (!existingCompany) {
            return res.failure({ message: 'Company not found!' });
        }
        if (!refreshToken) {
            return res.badRequest({ message: 'Refresh token is required!' });
        }

        const result = await authService.refreshAccessToken(refreshToken);
        
        if (result.flag) {
            return res.unAuthorized({ message: result.msg });
        }

        return res.success({ 
            message: result.msg,
            data: result.data
        });

    } catch (error) {
        console.log(error);
        return res.internalServerError({ message: error.message });
    }
};

const logout = async (req, res) => {
    try {
        const userId = req.user?.id; // User is attached to req by authentication middleware
        const companyId = req.headers['x-company-id'];
        if (!companyId) {
            return res.failure({ message: 'Company ID is required!' });
        }
        const existingCompany = await dbService.findOne(model.company, { id: companyId });
        if (!existingCompany) {
            return res.failure({ message: 'Company not found!' });
        }
        if (!userId) {
            return res.unAuthorized({ message: 'User not authenticated!' });
        }

        const result = await authService.logoutUser(userId);

        if (!result) {
            return res.failure({ message: 'Logout failed!' });
        }

        return res.success({ 
            message: 'Logged out successfully!'
        });

    } catch (error) {
        console.log(error);
        return res.internalServerError({ message: error.message });
    }
};


module.exports = {
    login,
    verifyOTP,
    resetPassword,
    handle2FA,
    refreshAccessToken,
    resendOTP,
    logout
};