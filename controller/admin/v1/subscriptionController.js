const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { USER_TYPES } = require('../../../constants/authConstant');

const createServiceCharge = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 28 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    // Only SUPER_ADMIN and ADMIN can create service charges
    if (![USER_TYPES.SUPER_ADMIN, USER_TYPES.ADMIN].includes(req.user?.userType)) {
      return res.failure({ message: "Only SUPER_ADMIN and ADMIN can create service charges" });
    }

    const { serviceId, roleType, chargeAmount, userId } = req.body;
    const companyId = req.companyId ?? req.user?.companyId ?? null;

    if (!serviceId || !roleType || chargeAmount === undefined) {
      return res.badRequest({ message: 'serviceId, roleType, and chargeAmount are required' });
    }

    // Check if service exists
    const service = await dbService.findOne(model.services, { id: serviceId });
    if (!service) {
      return res.badRequest({ message: 'Service not found' });
    }

    // Check if charge already exists for this service and role
    const existingCharge = await dbService.findOne(model.serviceCharge, {
      serviceId: serviceId,
      roleType: roleType,
      companyId: companyId,
      userId: userId || null
    });

    if (existingCharge) {
      return res.badRequest({ message: 'Service charge already exists for this service and role' });
    }

    const dataToCreate = {
      serviceId: serviceId,
      roleType: roleType,
      chargeAmount: parseFloat(chargeAmount),
      companyId: companyId,
      userId: userId || null,
      addedBy: req.user.id,
      isActive: true
    };

    const createdCharge = await dbService.createOne(model.serviceCharge, dataToCreate);

    return res.success({
      message: 'Service charge created successfully',
      data: createdCharge
    });

  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error.message });
    }
  }
};

const getAllServiceCharges = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 28 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const companyId = req.companyId ?? req.user?.companyId ?? null;
    let query = {};

    // Apply company filter only when companyId is not null
    if (companyId !== null && companyId !== undefined) {
      query.companyId = companyId;
    }

    const serviceCharges = await dbService.findAll(
      model.serviceCharge,
      query,
      {
        include: [
          {
            model: model.services,
            as: 'service',
            attributes: ['id', 'serviceName']
          }
        ]
      }
    );

    return res.success({
      message: 'Service charges retrieved successfully',
      data: serviceCharges
    });

  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

const updateServiceCharge = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 28 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    // Only SUPER_ADMIN and ADMIN can update service charges
    if (![USER_TYPES.SUPER_ADMIN, USER_TYPES.ADMIN].includes(req.user?.userType)) {
      return res.failure({ message: "Only SUPER_ADMIN and ADMIN can update service charges" });
    }

    const { chargeAmount, isActive } = req.body;
    const chargeId = req.params.id;

    if (chargeAmount === undefined && isActive === undefined) {
      return res.badRequest({ message: 'At least one field (chargeAmount or isActive) is required' });
    }

    const existingCharge = await dbService.findOne(model.serviceCharge, {
      id: chargeId
    });

    if (!existingCharge) {
      return res.badRequest({ message: 'Service charge not found' });
    }

    const dataToUpdate = {};
    if (chargeAmount !== undefined) {
      dataToUpdate.chargeAmount = parseFloat(chargeAmount);
    }
    if (isActive !== undefined) {
      dataToUpdate.isActive = isActive;
    }

    dataToUpdate.updatedBy = req.user.id;

    const updatedCharge = await dbService.update(
      model.serviceCharge,
      { id: chargeId },
      dataToUpdate
    );

    return res.success({
      message: 'Service charge updated successfully',
      data: updatedCharge[0]
    });

  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error.message });
    }
  }
};

const deleteServiceCharge = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 28 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    // Only SUPER_ADMIN can delete service charges
    if (req.user?.userType !== USER_TYPES.SUPER_ADMIN) {
      return res.failure({ message: "Only SUPER_ADMIN can delete service charges" });
    }

    const chargeId = req.params.id;

    const existingCharge = await dbService.findOne(model.serviceCharge, {
      id: chargeId
    });

    if (!existingCharge) {
      return res.badRequest({ message: 'Service charge not found' });
    }

    await dbService.update(
      model.serviceCharge,
      { id: chargeId },
      {
        isActive: false,
        updatedBy: req.user.id
      }
    );

    return res.success({
      message: 'Service charge deleted successfully'
    });

  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

// ==================== SUBSCRIPTION FUNCTIONS ====================

const createSubscription = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 29 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const { serviceId, subscriptionType, amount, paymentMethod, transactionId, creditUserId, debitUserId } = req.body;
    const userId = req.params.userId || req.user.id;
    const companyId = req.companyId ?? req.user?.companyId ?? null;

    if (!serviceId || !subscriptionType || amount === undefined) {
      return res.badRequest({ message: 'serviceId, subscriptionType, and amount are required' });
    }

    // Check if service exists
    const service = await dbService.findOne(model.services, { id: serviceId });
    if (!service) {
      return res.badRequest({ message: 'Service not found' });
    }

    // Check if user exists
    const user = await dbService.findOne(model.user, { id: userId });
    if (!user) {
      return res.badRequest({ message: 'User not found' });
    }

    // Check if subscription already exists for this user and service
    const existingSubscription = await dbService.findOne(model.subscription, {
      userId: userId,
      serviceId: serviceId,
      status: 'completed'
    });

    if (existingSubscription) {
      return res.badRequest({ message: 'User already has an active subscription for this service' });
    }

    // Validate and get service charge based on hierarchical logic
    const serviceChargeValidation = await validateServiceChargeHierarchy(req.user, user, serviceId, companyId);
    if (!serviceChargeValidation.isValid) {
      return res.badRequest({ message: serviceChargeValidation.message });
    }

    const dataToCreate = {
      userId: userId,
      serviceId: serviceId,
      subscriptionType: subscriptionType,
      amount: parseFloat(amount),
      companyId: companyId,
      paymentMethod: paymentMethod,
      transactionId: transactionId,
      userType: user.userType,
      creditUserId: creditUserId || userId,
      debitUserId: debitUserId || userId,
      status: 'completed',
      subscribedAt: new Date(),
      action: 'subscribed',
      actionDate: new Date(),
      addedBy: req.user.id,
      isActive: true
    };

    // Set expiration date based on subscription type
    if (subscriptionType === 'monthly') {
      dataToCreate.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    } else if (subscriptionType === 'yearly') {
      dataToCreate.expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 365 days
    }

    const createdSubscription = await dbService.createOne(model.subscription, dataToCreate);

    return res.success({
      message: 'Subscription created successfully',
      data: createdSubscription
    });

  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error.message });
    }
  }
};

const getAllSubscriptions = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 29 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const companyId = req.companyId ?? req.user?.companyId ?? null;
    let query = {};

    // Apply company filter only when companyId is not null
    if (companyId !== null && companyId !== undefined) {
      query.companyId = companyId;
    }

    const subscriptions = await dbService.findAll(
      model.subscription,
      query,
      {
        include: [
          {
            model: model.services,
            as: 'service',
            attributes: ['id', 'serviceName']
          },
          {
            model: model.user,
            as: 'user',
            attributes: ['id', 'firstName', 'lastName', 'email', 'userType']
          },
          {
            model: model.user,
            as: 'creditUser',
            attributes: ['id', 'firstName', 'lastName', 'email', 'userType']
          },
          {
            model: model.user,
            as: 'debitUser',
            attributes: ['id', 'firstName', 'lastName', 'email', 'userType']
          }
        ]
      }
    );

    return res.success({
      message: 'Subscriptions retrieved successfully',
      data: subscriptions
    });

  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

const getUserSubscriptions = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 29 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const userId = req.params.userId;
    const companyId = req.companyId ?? req.user?.companyId ?? null;

    let query = { userId: userId };

    // Apply company filter only when companyId is not null
    if (companyId !== null && companyId !== undefined) {
      query.companyId = companyId;
    }

    const subscriptions = await dbService.findAll(
      model.subscription,
      query,
      {
        include: [
          {
            model: model.services,
            as: 'service',
            attributes: ['id', 'serviceName']
          },
          {
            model: model.user,
            as: 'creditUser',
            attributes: ['id', 'firstName', 'lastName', 'email', 'userType']
          },
          {
            model: model.user,
            as: 'debitUser',
            attributes: ['id', 'firstName', 'lastName', 'email', 'userType']
          }
        ]
      }
    );

    return res.success({
      message: 'User subscriptions retrieved successfully',
      data: subscriptions
    });

  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

const getSubscriptionHistory = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 29 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const userId = req.params.userId;
    const companyId = req.companyId ?? req.user?.companyId ?? null;

    let query = { userId: userId };

    // Apply company filter only when companyId is not null
    if (companyId !== null && companyId !== undefined) {
      query.companyId = companyId;
    }

    const subscriptionHistory = await dbService.findAll(
      model.subscription,
      query,
      {
        include: [
          {
            model: model.services,
            as: 'service',
            attributes: ['id', 'serviceName']
          },
          {
            model: model.user,
            as: 'user',
            attributes: ['id', 'firstName', 'lastName', 'email', 'userType']
          },
          {
            model: model.user,
            as: 'creditUser',
            attributes: ['id', 'firstName', 'lastName', 'email', 'userType']
          },
          {
            model: model.user,
            as: 'debitUser',
            attributes: ['id', 'firstName', 'lastName', 'email', 'userType']
          }
        ],
        order: [['actionDate', 'DESC']]
      }
    );

    return res.success({
      message: 'Subscription history retrieved successfully',
      data: subscriptionHistory
    });

  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

const cancelSubscription = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 29 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const subscriptionId = req.params.id;

    const existingSubscription = await dbService.findOne(model.subscription, {
      id: subscriptionId
    });

    if (!existingSubscription) {
      return res.badRequest({ message: 'Subscription not found' });
    }

    if (existingSubscription.status === 'cancelled') {
      return res.badRequest({ message: 'Subscription is already cancelled' });
    }

    // Update subscription status and action
    await dbService.update(
      model.subscription,
      { id: subscriptionId },
      {
        status: 'cancelled',
        action: 'cancelled',
        actionDate: new Date(),
        remarks: 'Subscription cancelled by admin',
        updatedBy: req.user.id
      }
    );

    return res.success({
      message: 'Subscription cancelled successfully'
    });

  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

// ==================== NEW COMPANY-BASED SUBSCRIBED SERVICES FUNCTION ====================

const getCompanySubscribedServices = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 29 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const companyId = req.companyId ?? req.user?.companyId ?? null;

    if (!companyId) {
      return res.badRequest({ message: 'Company ID is required' });
    }

    // Get all active subscriptions for the company
    const subscriptions = await dbService.findAll(
      model.subscription,
      {
        companyId: companyId,
        status: 'completed',
        isActive: true
      },
      {
        include: [
          {
            model: model.services,
            as: 'service',
            attributes: ['id', 'serviceName', 'serviceCode', 'description']
          },
          {
            model: model.user,
            as: 'user',
            attributes: ['id', 'firstName', 'lastName', 'email', 'userType']
          }
        ],
        order: [['subscribedAt', 'DESC']]
      }
    );

    // Group subscriptions by service to get unique subscribed services
    const subscribedServices = {};
    subscriptions.forEach(subscription => {
      const serviceId = subscription.serviceId;
      if (!subscribedServices[serviceId]) {
        subscribedServices[serviceId] = {
          service: subscription.service,
          subscriptionCount: 0,
          totalAmount: 0,
          latestSubscription: subscription,
          subscribers: []
        };
      }
      
      subscribedServices[serviceId].subscriptionCount += 1;
      subscribedServices[serviceId].totalAmount += subscription.amount;
      
      // Add subscriber info
      subscribedServices[serviceId].subscribers.push({
        userId: subscription.userId,
        userName: `${subscription.user.firstName} ${subscription.user.lastName}`,
        userEmail: subscription.user.email,
        userType: subscription.user.userType,
        subscriptionType: subscription.subscriptionType,
        amount: subscription.amount,
        subscribedAt: subscription.subscribedAt,
        expiresAt: subscription.expiresAt
      });
    });

    // Convert to array format
    const result = Object.values(subscribedServices).map(serviceData => ({
      serviceId: serviceData.service.id,
      serviceName: serviceData.service.serviceName,
      serviceCode: serviceData.service.serviceCode,
      description: serviceData.service.description,
      subscriptionCount: serviceData.subscriptionCount,
      totalAmount: serviceData.totalAmount,
      latestSubscription: serviceData.latestSubscription,
      subscribers: serviceData.subscribers
    }));

    return res.success({
      message: 'Company subscribed services retrieved successfully',
      data: result,
      totalServices: result.length,
      totalSubscriptions: subscriptions.length
    });

  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Validates service charge hierarchy based on user roles
 * @param {Object} currentUser - The user creating the subscription
 * @param {Object} targetUser - The user for whom subscription is being created
 * @param {Number} serviceId - The service ID
 * @param {Number} companyId - The company ID
 * @returns {Object} - {isValid: boolean, message: string, serviceCharge: Object|null}
 */
const validateServiceChargeHierarchy = async (currentUser, targetUser, serviceId, companyId) => {
  try {
    const currentUserType = currentUser.userRole;
    const targetUserType = targetUser.userType;

    // Super Admin can create subscriptions for Company (Whitelabel Admin)
    if (currentUserType === USER_TYPES.SUPER_ADMIN) {
      if (targetUserType !== USER_TYPES.WHITELABEL_ADMIN) {
        return {
          isValid: false,
          message: 'Super Admin can only create subscriptions for Company (Whitelabel Admin)'
        };
      }

      // Check if service charge exists for Company
      const serviceCharge = await dbService.findOne(model.serviceCharge, {
        serviceId: serviceId,
        companyId: companyId,
        roleType: USER_TYPES.WHITELABEL_ADMIN,
        isActive: true
      });

      if (!serviceCharge) {
        return {
          isValid: false,
          message: 'Service charge not configured for this Company. Please configure service charge first.'
        };
      }

      return {
        isValid: true,
        message: 'Valid service charge hierarchy',
        serviceCharge: serviceCharge
      };
    }

    // Company (Whitelabel Admin) can create subscriptions for Master Distributor, Distributor, and Retailer
    if (currentUserType === USER_TYPES.WHITELABEL_ADMIN) {
      const allowedTargetTypes = [USER_TYPES.MASTER_DISTRIBUTOR, USER_TYPES.DISTRIBUTOR, USER_TYPES.RETAILER];
      
      if (!allowedTargetTypes.includes(targetUserType)) {
        return {
          isValid: false,
          message: 'Company can only create subscriptions for Master Distributor, Distributor, and Retailer'
        };
      }

      // Check if service charge exists for the target user type
      const serviceCharge = await dbService.findOne(model.serviceCharge, {
        serviceId: serviceId,
        companyId: companyId,
        roleType: targetUserType,
        isActive: true
      });

      if (!serviceCharge) {
        return {
          isValid: false,
          message: `Service charge not configured for ${getUserTypeName(targetUserType)}. Please configure service charge first.`
        };
      }

      return {
        isValid: true,
        message: 'Valid service charge hierarchy',
        serviceCharge: serviceCharge
      };
    }

    // Other user types are not allowed to create subscriptions
    return {
      isValid: false,
      message: 'Only Super Admin and Company (Whitelabel Admin) can create subscriptions'
    };

  } catch (error) {
    console.log('Error validating service charge hierarchy:', error);
    return {
      isValid: false,
      message: 'Error validating service charge hierarchy'
    };
  }
};

/**
 * Get user type name for display purposes
 * @param {Number} userType - The user type number
 * @returns {String} - User type name
 */
const getUserTypeName = (userType) => {
  const typeNames = {
    [USER_TYPES.SUPER_ADMIN]: 'Super Admin',
    [USER_TYPES.WHITELABEL_ADMIN]: 'Company (Whitelabel Admin)',
    [USER_TYPES.MASTER_DISTRIBUTOR]: 'Master Distributor',
    [USER_TYPES.DISTRIBUTOR]: 'Distributor',
    [USER_TYPES.RETAILER]: 'Retailer'
  };
  return typeNames[userType] || 'Unknown';
};

const createSubscriptionHistoryEntry = async (subscriptionId, action, remarks = null) => {
  try {
    const subscription = await dbService.findOne(model.subscription, { id: subscriptionId });
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Create a new subscription record for history tracking
    const historyEntry = await dbService.createOne(model.subscription, {
      userId: subscription.userId,
      serviceId: subscription.serviceId,
      subscriptionType: subscription.subscriptionType,
      amount: subscription.amount,
      companyId: subscription.companyId,
      paymentMethod: subscription.paymentMethod,
      transactionId: subscription.transactionId,
      userType: subscription.userType,
      creditUserId: subscription.creditUserId,
      debitUserId: subscription.debitUserId,
      status: subscription.status,
      action: action,
      actionDate: new Date(),
      remarks: remarks,
      addedBy: subscription.addedBy,
      isActive: true
    });

    return historyEntry;
  } catch (error) {
    console.log('Error creating subscription history entry:', error);
    throw error;
  }
};

module.exports = {
  // Service Charge functions
  createServiceCharge,
  getAllServiceCharges,
  updateServiceCharge,
  deleteServiceCharge,
  
  // Subscription functions
  createSubscription,
  getAllSubscriptions,
  getUserSubscriptions,
  getSubscriptionHistory,
  cancelSubscription,
  getCompanySubscribedServices,
  
  // Helper functions
  createSubscriptionHistoryEntry,
  validateServiceChargeHierarchy,
  getUserTypeName
};