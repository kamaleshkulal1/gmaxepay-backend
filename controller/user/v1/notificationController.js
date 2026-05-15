const model = require('../../../models');
const dbService = require('../../../utils/dbService');

const getAllNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.companyId;

    const baseQuery = {
      refId: userId,
      companyId: companyId,
      isDeleted: false
    };

    // Get counts
    const unreadCount = await dbService.count(model.notification, { ...baseQuery, isRead: false });
    const readCount = await dbService.count(model.notification, { ...baseQuery, isRead: true });

    // Get notifications (separated)
    const unreadNotifications = await dbService.findAll(model.notification, { ...baseQuery, isRead: false }, { order: [['createdAt', 'DESC']], limit: 50 });
    const readNotifications = await dbService.findAll(model.notification, { ...baseQuery, isRead: true }, { order: [['createdAt', 'DESC']], limit: 50 });

    return res.success({
      message: 'Notifications fetched successfully',
      data: {
        unreadNotifications,
        readNotifications,
        unreadCount,
        readCount,
        totalCount: unreadCount + readCount
      }
    });
  } catch (error) {
    return res.failure({ message: error.message });
  }
};

const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.companyId;

    await dbService.update(model.notification, { refId: userId, companyId: companyId, isRead: false }, { isRead: true });

    return res.success({ message: 'All notifications marked as read' });
  } catch (error) {
    return res.failure({ message: error.message });
  }
};


module.exports = {
  getAllNotifications,
  markAsRead
};
