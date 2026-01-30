const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op } = require('sequelize');

const getAllSubscriptions = async (req, res) => {
  try {
    if (req.user.userRole !== 2) {
      return res.failure({ message: 'You are not authorized to access this resource' });
    }
    
    const companyId = req.companyId ?? req.user?.companyId ?? null;
    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    const existingUser = await dbService.findOne(model.user, { id: req.user.id, isActive: true, companyId: companyId });
    if(!existingUser) {
        return res.failure({ message: 'User not found' });
    }
    
    const allSlabs = await dbService.findAll(model.slab, { 
      isActive: true, 
      addedBy: 1
    });
    
    if(!allSlabs || allSlabs.length === 0) {
        return res.failure({ message: 'No slabs found' });
    }

    const slabIds = allSlabs.map((s) => s.id || s.dataValues?.id).filter(Boolean);
    if (!slabIds.length) {
      return res.failure({ message: 'No slabs found' });
    }

    const roleConfig = { roleType: 2, roleName: 'WU' };

    // Fetch commissions for all slabs based on company admin role
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

    const subscriptions = allSlabs.map(slab => {
      const slabData = slab.toJSON ? slab.toJSON() : slab;
      return {
        id: slabData.id,
        slabName: slabData.slabName,
        subscriptionAmount: slabData.subscriptionAmount,
        schemaMode: slabData.schemaMode,
        schemaType: slabData.schemaType,
        roleType: roleConfig.roleType,
        roleName: roleConfig.roleName,
        commissions: commissionsBySlab.get(slabData.id) || [],
        isCurrentSlab: slabData.id === currentSlabId
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
};