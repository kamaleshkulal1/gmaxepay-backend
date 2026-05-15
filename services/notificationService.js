const model = require('../models');
const dbService = require('../utils/dbService');


const createNotification = async (data) => {
    try {
        const notification = await dbService.createOne(model.notification, {
            refId: data.refId,
            companyId: data.companyId,
            name: data.name || 'System Notification',
            msg: data.msg,
            isRead: false
        });
        return notification;
    } catch (error) {
        console.error('Error creating notification:', error);
        return null;
    }
};

module.exports = {
    createNotification
};
