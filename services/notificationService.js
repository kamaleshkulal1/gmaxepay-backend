const model = require('../models');
const dbService = require('../utils/dbService');
const { sendPushNotification } = require('../utils/pushNotification');

const createNotification = async (data) => {
    try {
        const notification = await dbService.createOne(model.notification, {
            refId: data.refId,
            companyId: data.companyId,
            name: data.name || 'System Notification',
            msg: data.msg,
            isRead: false
        });

        // Send push notification if user has a device token
        const user = await dbService.findOne(model.user, { id: data.refId }, { attributes: ['deviceToken', 'companyId'] });
        
        if (user && user.deviceToken) {
            // Fetch company branding for white-labeling
            const company = await dbService.findOne(model.company, { id: user.companyId }, { attributes: ['logo', 'companyName'] });
            const logoUrl = company ? company.logo : null;

            await sendPushNotification(
                user.deviceToken,
                data.name || company?.companyName || 'System Notification',
                data.msg,
                logoUrl
            ).catch(err => console.error('Push Notification Error:', err));
        }

        return notification;
    } catch (error) {
        console.error('Error creating notification:', error);
        return null;
    }
};

module.exports = {
    createNotification
};
