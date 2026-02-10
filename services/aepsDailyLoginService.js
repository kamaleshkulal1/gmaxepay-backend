
const dbService = require('../utils/dbService');
const model = require('../models');
const { Op } = require('sequelize');

const getIndianDateOnly = () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(now);
};

const getCurrentISTTime = () => {
    const now = new Date();
    const istFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    
    const parts = istFormatter.formatToParts(now);
    const year = parseInt(parts.find(p => p.type === 'year').value);
    const month = parseInt(parts.find(p => p.type === 'month').value) - 1;
    const day = parseInt(parts.find(p => p.type === 'day').value);
    const hour = parseInt(parts.find(p => p.type === 'hour').value);
    const minute = parseInt(parts.find(p => p.type === 'minute').value);
    const second = parseInt(parts.find(p => p.type === 'second').value);
    
    const istDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}+05:30`;
    return new Date(istDateStr);
};


const getNextMidnightIST = () => {
    const todayIST = getIndianDateOnly();
    const todayISTMidnight = new Date(`${todayIST}T00:00:00+05:30`);
    const tomorrowMidnightIST = new Date(todayISTMidnight.getTime() + (24 * 60 * 60 * 1000));
    return tomorrowMidnightIST;
};


const logoutPreviousDaySessions = async (userId = null, companyId = null) => {
    const todayDateStr = getIndianDateOnly();
    const now = getCurrentISTTime();
    
    const whereClause = {
        isLoggedIn: true,
        loginDate: { [Op.ne]: todayDateStr }
    };
    
    if (userId) {
        whereClause.refId = userId;
    }
    
    if (companyId) {
        whereClause.companyId = companyId;
    }
    
    const activeLogins = await dbService.findAll(model.aepsDailyLogin, whereClause);
    
    if (activeLogins && activeLogins.length > 0) {
        for (const login of activeLogins) {
            await dbService.update(
                model.aepsDailyLogin,
                { id: login.id },
                { 
                    isLoggedIn: false,
                    logoutTime: now
                }
            );
        }
        return activeLogins.length;
    }
    
    return 0;
};


/**
 * Logout all active users at midnight IST
 * This function is called by the scheduled job
 * @returns {Promise<Object>} - Result with count of logged out users
 */
const logoutAllUsersAtMidnight = async () => {
    try {
        const todayDateStr = getIndianDateOnly();
        const now = getCurrentISTTime();
        
        // Get all active logins
        const activeLogins = await dbService.findAll(model.aepsDailyLogin, {
            isLoggedIn: true
        });
        
        let loggedOutCount = 0;
        
        if (activeLogins && activeLogins.length > 0) {
            for (const login of activeLogins) {
                // Logout all active sessions (they will be from previous day or current day)
                await dbService.update(
                    model.aepsDailyLogin,
                    { id: login.id },
                    { 
                        isLoggedIn: false,
                        logoutTime: now
                    }
                );
                loggedOutCount++;
            }
        }
        
        console.log(`[AEPS Daily Login] Midnight IST logout completed. Logged out ${loggedOutCount} users.`);
        
        return {
            success: true,
            loggedOutCount,
            timestamp: now,
            date: todayDateStr
        };
    } catch (error) {
        console.error('[AEPS Daily Login] Error during midnight logout:', error);
        throw error;
    }
};

/**
 * Get time until next midnight IST in milliseconds
 * @returns {number} - Milliseconds until next midnight IST
 */
const getTimeUntilNextMidnightIST = () => {
    const now = new Date();
    const todayIST = getIndianDateOnly();
    const todayISTMidnight = new Date(`${todayIST}T00:00:00+05:30`);
    const tomorrowISTMidnight = new Date(todayISTMidnight.getTime() + (24 * 60 * 60 * 1000));
    
    // Get current time in IST
    const currentIST = getCurrentISTTime();
    
    // Calculate time until next midnight IST
    const timeUntilMidnight = tomorrowISTMidnight.getTime() - currentIST.getTime();
    
    return timeUntilMidnight;
};

module.exports = {
    getIndianDateOnly,
    getCurrentISTTime,
    getNextMidnightIST,
    logoutPreviousDaySessions,
    logoutAllUsersAtMidnight,
    getTimeUntilNextMidnightIST
};

