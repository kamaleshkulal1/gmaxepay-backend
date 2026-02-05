const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op } = require('sequelize');

// Helper function to get raw data from Sequelize model instance
const getRawData = (instance) => instance.dataValues || instance;

// Helper function to check if slab is visible to user
const isSlabVisible = (slabData, userId) => {
  if (slabData.schemaMode === 'global') return true;
  if (slabData.schemaMode === 'private') {
    const views = slabData.views || [];
    return Array.isArray(views) && views.includes(userId);
  }
  return false;
};

const getAllSubscriptions = async (req, res) => {
  try {
    // Authorization check
    if (req.user.userRole !== 2) {
      return res.failure({ message: 'You are not authorized to access this resource' });
    }
    
    // Get company ID and user ID
    const companyId = req.companyId ?? req.user?.companyId ?? null;
    const userId = req.user.id;
    
    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    // Verify user exists
    const existingUser = await dbService.findOne(model.user, { 
      id: userId, 
      isActive: true, 
      companyId: companyId 
    });
    
    if (!existingUser) {
      return res.failure({ message: 'User not found' });
    }

    const currentSlabId = existingUser.slabId || null;

    // Fetch all active slabs created by admin (addedBy: 1)
    const allSlabs = await dbService.findAll(model.slab, { 
      isActive: true, 
      addedBy: 1
    }, {
      attributes: ['id', 'slabName', 'subscriptionAmount', 'schemaMode', 'schemaType', 'views', 'addedBy']
    });
    
    if (!allSlabs?.length) {
      return res.failure({ message: 'No slabs found' });
    }

    // Filter visible slabs and extract data in one pass
    const visibleSlabsData = [];
    const slabIds = [];
    const addedBySet = new Set();

    for (const slab of allSlabs) {
      const slabData = getRawData(slab);
      
      if (isSlabVisible(slabData, userId)) {
        visibleSlabsData.push(slabData);
        slabIds.push(slabData.id);
        if (slabData.addedBy) {
          addedBySet.add(slabData.addedBy);
        }
      }
    }

    if (!visibleSlabsData.length) {
      return res.failure({ message: 'No visible slabs found' });
    }

    // Prepare commission query
    const roleConfig = { roleType: 2, roleName: 'WU' };
    const commissionQuery = {
      slabId: { [Op.in]: slabIds },
      roleType: roleConfig.roleType,
      roleName: roleConfig.roleName
    };

    // Add addedBy filter if we have values
    if (addedBySet.size > 0) {
      const addedByArray = Array.from(addedBySet);
      commissionQuery.addedBy = addedByArray.length === 1 
        ? addedByArray[0] 
        : { [Op.in]: addedByArray };
    }

    // Fetch commissions and user subscriptions in parallel
    const [allCommissions, userSubscriptions] = await Promise.all([
      dbService.findAll(model.commSlab, commissionQuery, {
        attributes: ['id', 'slabId', 'operatorId', 'operatorName', 'operatorType', 'commAmt', 'commType', 'amtType']
      }),
      dbService.findAll(model.subscription, {
        userId: userId,
        companyId: companyId,
        status: 'SUCCESS',
        isActive: true
      }, {
        attributes: ['slabId']
      })
    ]);

    // Group commissions by slabId
    const commissionsBySlab = new Map();
    if (allCommissions?.length) {
      for (const commission of allCommissions) {
        const commData = getRawData(commission);
        const { slabId } = commData;
        
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
      }
    }

    // Create set of subscribed slab IDs
    const subscribedSlabIds = new Set();
    if (userSubscriptions?.length) {
      for (const sub of userSubscriptions) {
        const subData = getRawData(sub);
        if (subData.slabId) {
          subscribedSlabIds.add(subData.slabId);
        }
      }
    }

    // Build response data
    const subscriptions = visibleSlabsData.map(slabData => {
      const subscriptionAmount = slabData.subscriptionAmount || 0;
      const isFree = subscriptionAmount === 0;
      const hasSubscription = subscribedSlabIds.has(slabData.id);
      const isCurrentSlab = slabData.id === currentSlabId;
      
      return {
        id: slabData.id,
        slabName: slabData.slabName,
        subscriptionAmount,
        schemaMode: slabData.schemaMode,
        schemaType: slabData.schemaType,
        roleType: roleConfig.roleType,
        roleName: roleConfig.roleName,
        commissions: commissionsBySlab.get(slabData.id) || [],
        isCurrentSlab,
        alreadySubscribed: (isFree && hasSubscription) || isCurrentSlab,
        isSubscribed: hasSubscription
      };
    });

    return res.success({ 
      message: 'Subscriptions retrieved successfully', 
      data: subscriptions,
      total: subscriptions.length,
      currentSlabId
    });
  } catch (error) {
    console.error('Get all subscriptions error', error);
    return res.internalServerError({ message: error.message });
  }
};

module.exports = {
  getAllSubscriptions
};