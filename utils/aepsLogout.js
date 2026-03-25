const aepsDailyLoginService = require('../services/aepsDailyLoginService');
const model = require('../models/index');
const dbService = require('../utils/dbService');
const { Op } = require('sequelize');

const resetOtpLoginRequirement = async () => {
  try {
    const result = await dbService.update(
      model.user,
      {
        isActive: true,
        isDeleted: false,
        lastOtpLoginDate: { [Op.ne]: null }
      },
      { lastOtpLoginDate: null }
    );

    const resetCount = Array.isArray(result) ? result.length : 0;
    console.log(`[OTP Reset] Reset OTP login requirement for ${resetCount} users at midnight IST`);
    return { success: true, resetCount };
  } catch (error) {
    console.error('[OTP Reset] Error resetting OTP login requirement:', error);
    throw error;
  }
};

const resetZupay2faRequirement = async () => {
  try {
    const result = await dbService.update(
      model.zupayOnboarding,
      { is2faVerified: true },
      { is2faVerified: false }
    );
    console.log('[Zupay 2FA Reset] Reset Zupay 2FA status for all users at midnight IST');
    return { success: true };
  } catch (error) {
    console.error('[Zupay 2FA Reset] Error resetting Zupay 2FA status:', error);
    throw error;
  }
};


const aepsLogout = () => {
  const scheduleNextMidnightLogout = () => {
    let timeUntilMidnight = aepsDailyLoginService.getTimeUntilNextMidnightIST();
    if (!timeUntilMidnight || isNaN(timeUntilMidnight) || timeUntilMidnight <= 0) {
      console.warn('[AEPS Daily Login] Invalid timeUntilMidnight detected, defaulting to 24h');
      timeUntilMidnight = 24 * 60 * 60 * 1000;
    }
    console.log(`[AEPS Daily Login] Scheduled midnight IST logout and OTP reset in ${Math.round(timeUntilMidnight / 1000 / 60)} minutes`);

    setTimeout(async () => {
      try {
        await Promise.all([
          aepsDailyLoginService.logoutAllUsersAtMidnight(),
          resetOtpLoginRequirement(),
          resetZupay2faRequirement()
        ]);
        scheduleNextMidnightLogout();
      } catch (error) {
        console.error('[AEPS Daily Login] Error in scheduled logout/OTP reset:', error);
        setTimeout(scheduleNextMidnightLogout, 60 * 60 * 1000);
      }
    }, timeUntilMidnight);
  };

  scheduleNextMidnightLogout();
  console.log('[AEPS Daily Login] Midnight IST auto-logout and OTP reset scheduler initialized');
};

module.exports = aepsLogout;

