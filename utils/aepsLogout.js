const aepsDailyLoginService = require('../services/aepsDailyLoginService');

/**
 * Initialize AEPS daily login scheduler for midnight IST logout
 * This function schedules automatic logout of all users at midnight IST
 */
const aepsLogout = () => {
  // Function to schedule next midnight IST logout
  const scheduleNextMidnightLogout = () => {
    const timeUntilMidnight = aepsDailyLoginService.getTimeUntilNextMidnightIST();
    console.log(`[AEPS Daily Login] Scheduled midnight IST logout in ${Math.round(timeUntilMidnight / 1000 / 60)} minutes`);
    
    setTimeout(async () => {
      try {
        await aepsDailyLoginService.logoutAllUsersAtMidnight();
        // Schedule next midnight logout
        scheduleNextMidnightLogout();
      } catch (error) {
        console.error('[AEPS Daily Login] Error in scheduled logout:', error);
        // Retry after 1 hour if error occurs
        setTimeout(scheduleNextMidnightLogout, 60 * 60 * 1000);
      }
    }, timeUntilMidnight);
  };
  
  // Start the scheduler
  scheduleNextMidnightLogout();
  console.log('[AEPS Daily Login] Midnight IST auto-logout scheduler initialized');
};

module.exports = aepsLogout;

