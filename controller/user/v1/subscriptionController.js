const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op } = require('sequelize');

const getAllSubscriptions = async (req, res) => {
  try {
    if (![3, 4, 5].includes(req.user.userRole)) {
      return res.failure({ message: 'You are not authorized to access this resource' });
    }

    const companyId = req.companyId ?? req.user?.companyId ?? null;
    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    const existingUser = await dbService.findOne(model.user, { id: req.user.id, isActive: true, companyId: companyId });
    if (!existingUser) {
      return res.failure({ message: 'User not found' });
    }

    const userId = req.user.id;

    let addedByUserId = existingUser.reportingTo;
    if (!addedByUserId) {
      const companyAdmin = await dbService.findOne(model.user, {
        companyId: companyId,
        userRole: 2,
        isActive: true,
        isDeleted: false
      });

      if (!companyAdmin) {
        return res.failure({ message: 'Company admin not found' });
      }

      addedByUserId = companyAdmin.id;
    }

    // Fetch all slabs with views field
    const allSlabs = await dbService.findAll(model.slab, {
      companyId: companyId,
      isActive: true,
      addedBy: addedByUserId
    }, {
      attributes: ['id', 'slabName', 'subscriptionAmount', 'schemaMode', 'schemaType', 'views']
    });

    if (!allSlabs || allSlabs.length === 0) {
      return res.failure({ message: 'No slabs found' });
    }

    // Filter slabs based on visibility:
    // 1. If schemaMode is 'global' - show it
    // 2. If schemaMode is 'private' and user ID is in views array - show it
    const visibleSlabs = allSlabs.filter(slab => {
      const slabData = slab.toJSON ? slab.toJSON() : slab;

      // Global slabs are visible to everyone
      if (slabData.schemaMode === 'global') {
        return true;
      }

      // Private slabs are only visible if user is in views array
      if (slabData.schemaMode === 'private') {
        const views = slabData.views || [];
        return Array.isArray(views) && views.includes(userId);
      }

      // Default: not visible
      return false;
    });

    if (!visibleSlabs || visibleSlabs.length === 0) {
      return res.failure({ message: 'No visible slabs found' });
    }

    const slabIds = visibleSlabs.map((s) => {
      const slabData = s.toJSON ? s.toJSON() : s;
      return slabData.id;
    }).filter(Boolean);

    if (!slabIds.length) {
      return res.failure({ message: 'No visible slabs found' });
    }

    // Map userRole to roleType and roleName for fetching commissions
    const roleMapping = {
      3: { roleType: 3, roleName: 'MD' },
      4: { roleType: 4, roleName: 'DI' },
      5: { roleType: 5, roleName: 'RE' }
    };

    const roleConfig = roleMapping[req.user.userRole];
    if (!roleConfig) {
      return res.failure({ message: 'Invalid user role' });
    }

    // Fetch commissions for all slabs based on user's role (no operator include needed)
    const allSlabCommissions = await dbService.findAll(model.commSlab, {
      slabId: { [Op.in]: slabIds },
      roleType: roleConfig.roleType,
      roleName: roleConfig.roleName,
      companyId: companyId
    }, {
      attributes: ['id', 'slabId', 'operatorId', 'operatorName', 'operatorType', 'commAmt', 'commType', 'amtType']
    });

    // Group commissions by slabId using Map for O(1) lookup performance
    const commissionsBySlab = new Map();
    if (allSlabCommissions && allSlabCommissions.length > 0) {
      allSlabCommissions.forEach((commission) => {
        const commData = commission.toJSON ? commission.toJSON() : commission;
        const slabId = commData.slabId;

        if (!commissionsBySlab.has(slabId)) {
          commissionsBySlab.set(slabId, []);
        }

        commissionsBySlab.get(slabId).push({
          id: commData.id,
          operatorId: commData.operatorId,
          operatorName: commData.operatorName,
          operatorType: commData.operatorType,
          commAmt: commData.commAmt,
          commType: commData.commType,
          amtType: commData.amtType
        });
      });
    }

    // Get current user's slab ID
    const currentSlabId = existingUser.slabId || null;

    // Fetch successful subscriptions for this user
    const userSubscriptions = await dbService.findAll(model.subscription, {
      userId: userId,
      companyId: companyId,
      status: 'SUCCESS',
      isActive: true
    }, {
      attributes: ['slabId', 'status']
    });

    // Create a map of slabId -> has successful subscription
    const subscribedSlabs = new Set();
    if (userSubscriptions && userSubscriptions.length > 0) {
      userSubscriptions.forEach(sub => {
        const subData = sub.toJSON ? sub.toJSON() : sub;
        if (subData.slabId) {
          subscribedSlabs.add(subData.slabId);
        }
      });
    }

    // Format subscriptions - iterate through visible slabs in original order
    const subscriptions = visibleSlabs.map(slab => {
      const slabData = slab.toJSON ? slab.toJSON() : slab;
      const subscriptionAmount = slabData.subscriptionAmount || 0;
      const isFree = subscriptionAmount === 0;
      const hasSubscription = subscribedSlabs.has(slabData.id);
      const isCurrentSlab = slabData.id === currentSlabId;
      const alreadySubscribed = (isFree && hasSubscription) || isCurrentSlab;

      return {
        id: slabData.id,
        slabName: slabData.slabName,
        subscriptionAmount: subscriptionAmount,
        schemaMode: slabData.schemaMode,
        schemaType: slabData.schemaType,
        roleType: roleConfig.roleType,
        roleName: roleConfig.roleName,
        commissions: commissionsBySlab.get(slabData.id) || [],
        isCurrentSlab: isCurrentSlab,
        alreadySubscribed: alreadySubscribed,
        isSubscribed: hasSubscription
      };
    });

    return res.success({
      message: 'Subscriptions retrieved successfully',
      data: subscriptions,
      total: subscriptions.length,
      currentSlabId: currentSlabId
    });
  } catch (error) {
    console.error('Get all subscriptions error', error);
    return res.internalServerError({ message: error.message });
  }
};

module.exports = {
  getAllSubscriptions
}