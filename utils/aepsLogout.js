const aepsDailyLoginService = require('../services/aepsDailyLoginService');
const model = require('../models/index');
const dbService = require('../utils/dbService');
const { Op } = require('sequelize');

/**
 * Reset OTP login requirement for all users at midnight IST
 * This allows OTP to be required again for the next day
 */
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

/**
 * Initialize AEPS daily login scheduler for midnight IST logout and OTP reset
 * This function schedules automatic logout of all users and resets OTP requirement at midnight IST
 */
const aepsLogout = () => {
  // Function to schedule next midnight IST logout and OTP reset
  const scheduleNextMidnightLogout = () => {
    const timeUntilMidnight = aepsDailyLoginService.getTimeUntilNextMidnightIST();
    console.log(`[AEPS Daily Login] Scheduled midnight IST logout and OTP reset in ${Math.round(timeUntilMidnight / 1000 / 60)} minutes`);
    
    setTimeout(async () => {
      try {
        // Logout all users and reset OTP requirement at midnight IST
        await Promise.all([
          aepsDailyLoginService.logoutAllUsersAtMidnight(),
          resetOtpLoginRequirement()
        ]);
        // Schedule next midnight logout
        scheduleNextMidnightLogout();
      } catch (error) {
        console.error('[AEPS Daily Login] Error in scheduled logout/OTP reset:', error);
        // Retry after 1 hour if error occurs
        setTimeout(scheduleNextMidnightLogout, 60 * 60 * 1000);
      }
    }, timeUntilMidnight);
  };
  
  // Start the scheduler
  scheduleNextMidnightLogout();
  console.log('[AEPS Daily Login] Midnight IST auto-logout and OTP reset scheduler initialized');
};

module.exports = aepsLogout;

