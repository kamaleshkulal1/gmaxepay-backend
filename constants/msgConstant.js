/**
 * msgConstant.js
 * @description :: constants msg in module
 */

module.exports = {
  MESSAGE: {
    AUTH: {
      OTP_INVALID: 'OTP Invalid',
      OTP_EXP: 'OTP is expired',
      OTP_SEND_SUCCESS: 'OTP sent successfully',
      LOGIN_BAD_REQ:
        'Insufficient request parameters! email and password are required.',
      OTP_BAD_REQ:
        'Insufficient request parameters! mobile number and otp are required.',
      LOGIN_SUCCESS: 'Login successful.',
      KYC_SUCCESS: 'KYC update Successfully',
      USER_NOT_EXIST: "User doesn't exists.",
      NOT_ASSIGN_ROLE: 'You have not been assigned any role',
      NOT_ALLOW_ACCESS: 'you are not allowed to access this platform',
      PASSWORD_RESET: 'Password is not reset successfully',
      PASSWORD_RESET_SUCCESS: 'Password reset successfully',
      PASSWORD_CHANGE: 'Your password has been changed Successfully.',
      RESET_PASSWORD: 'Reset Password',
      EMAIL_CHECK_OTP: 'Please check your email for OTP',
      EMAIL_VERIFIED: 'Email is verified',
      EMAIL_ALREADY_VERIFIED: 'Email is already verified',
      MOBILE_NUMBER_ALREADY_VERIFIED: 'Mobile Number is already verified',
      EMAIL_NOT_VERIFIED: 'Email is not verified',
      EMAIL_ALREADY_EXIST: 'Email already exists.',
      MOBILE_NUMBER_ALREADY_EXIST: 'Mobile number already exists.',
      RESET_PASSWORD_REQ: 'You have permission to reset password',
      RESET_PASSWORD_BAD_REQ:
        "You don't have permission or your permission expire for reset password",
      SUSPEND: 'Your account has been suspended.',
      EMAIL_VALIDATE:
        'you have already account with this email try with password.',
      NOT_REGISTER:
        'You may not register with this email. Please contact support.',
      MOBILE_NOT_REGISTER:
        'You may not register with this email. Please contact support.',
      EMAIL_BAD_REQ: 'Insufficient request parameters! email is required',
      MOBILE_BAD_REQ:
        'Insufficient request parameters! mobile number is required',
      INVALID_EMAIL: "Account doesn't exist.",
      SOCIAL_ACCOUNT_LINK_FAIL:
        'Your account is link with social media account, You can not reset password.',
      OTP_SEND: 'OTP successfully send to your email.',
      OTP_SEND_ISSUE: 'OTP can not be sent due to some issue try again later',
      INSUFFICIENT_PARAMS: 'Insufficient request parameters.',
      INSUFFICIENT_RESET_PARAMS:
        'Insufficient request parameters! email and newPassword are required.',
      INSUFFICIENT_LOGIN_OTP_PARAMS:
        'Insufficient request parameters! email, password and code are required.',
      INSUFFICIENT_EMAIL_PARAMS:
        'Insufficient request parameters! email is required.',
      INSUFFICIENT_MOBILE_NO_PARAMS:
        'Insufficient request parameters! mobileNoCode and mobileNo are required.',
      SEND_VERIFY_CODE_FAIL: 'Fail to send verification code',
      SEND_VERIFY_CODE: 'Your verification code send successfully',
      INSUFFICIENT_TYPE_OTP_PARAMS:
        'Insufficient request parameters! type of resend otp are required.',
      KYC_ALREADY_VERIFY: 'Kyc Already verified',
      KYC_VERIFIED: 'kyc verified successfully',
      INSUFFICIENT_EMAIL_APPLICANT_KYC_PARAMS:
        'Insufficient request parameters! email and applicant kyc id are required.',
      SOCIAL_LOGIN_TOKEN_FAILED:
        'You are not allow to login with this Email because of Malformed access token.',
      MOBILE_EMAIL_OTP_SUCCESS:
        'Please check your email and mobile both for OTP',
      MOBILE_EMAIL_OTP_FAIL: 'Something went wrong in send otp login',
      VERIFICATION_TYPE_BAD_REQ:
        'Invalid request. Please choose correct verification type',
      EMAIL_PHONE_OTP_FAIL: 'Your email and phone otp verification failed',
      EMAIL_OTP_FAIL: 'Your email otp verification failed for login',
      PHONE_OTP_FAIL: 'Your phone otp verification failed for login',
      INVALID_MOBILE_NO: 'Your mobile code and mobile no! are invalid'
    },
    MIDDLEWARE: {
      TOKEN_EXPIRE: 'Token is Expired',
      UNAUTH_USER: 'Unauthorized User',
      USER_DEL_BY_ADMIN: 'User is deleted by Admin contact support.',
      USER_SUSPEND_BY_ADMIN: 'User is suspended by Admin contact support.',
      TENANT_NOT_FOUND: 'Tenant not found',
      INVALID_HOST: 'Invalid Host',
      UNAUTH_HOST: 'Unauthorized Host User',
      UNAUTH_PACKAGE: 'No package assigned to user, contact support.'
    }
  }
};
