const  model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op } = require('sequelize');

const getAllSubscriptions = async (req, res) => {
  try {
    if(![3,4,5].includes(req.user.userRole)) {
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
      companyId: companyId, 
      isActive: true, 
      addedBy: existingUser.reportingTo 
    });
    
    if(!allSlabs || allSlabs.length === 0) {
        return res.failure({ message: 'No slabs found' });
    }

    const slabIds = allSlabs.map((s) => s.id || s.dataValues?.id).filter(Boolean);
    if (!slabIds.length) {
      return res.failure({ message: 'No slabs found' });
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

    // Fetch commissions for all slabs based on user's role
    const allSlabCommissions = await dbService.findAll(model.commSlab, {
      slabId: { [Op.in]: slabIds },
      roleType: roleConfig.roleType,
      roleName: roleConfig.roleName,
      companyId: companyId,
      isActive: true
    }, {
      include: [
        {
          model: model.operator,
          as: 'operator',
          attributes: ['comm', 'commType', 'amtType']
        }
      ]
    });

    // Group commissions by slabId
    const commissionsBySlab = {};
    if (allSlabCommissions && allSlabCommissions.length > 0) {
      allSlabCommissions.forEach((commission) => {
        const commData = commission.toJSON ? commission.toJSON() : commission;
        const slabId = commData.slabId;
        if (!commissionsBySlab[slabId]) {
          commissionsBySlab[slabId] = [];
        }
        commissionsBySlab[slabId].push(commData);
      });
    }

    // Format subscriptions with slab details and commission summary
    const subscriptions = allSlabs.map(slab => {
      const slabData = slab.toJSON ? slab.toJSON() : slab;
      const slabCommissions = commissionsBySlab[slabData.id] || [];
      
      
      return {
        id: slabData.id,
        slabName: slabData.slabName,
        subscriptionAmount: slabData.subscriptionAmount,
        schemaMode: slabData.schemaMode,
        schemaType: slabData.schemaType,
        roleType: roleConfig.roleType,
        roleName: roleConfig.roleName,
        commissions: slabCommissions.map(comm => ({
          id: comm.id,
          operatorId: comm.operatorId,
          operatorName: comm.operatorName,
          operatorType: comm.operatorType,
          commAmt: comm.commAmt,
          commType: comm.commType,
          amtType: comm.amtType,
          operatorComm: comm.operator?.comm || 0,
          operatorCommType: comm.operator?.commType || 'com',
          operatorAmtType: comm.operator?.amtType || 'fix'
        }))
      };
    });

    return res.success({ 
      message: 'Subscriptions retrieved successfully', 
      data: subscriptions,
      total: subscriptions.length
    });
  } catch (error) {
    console.error('Get all subscriptions error', error);
    return res.internalServerError({ message: error.message });
  }
};

module.exports = {
  getAllSubscriptions
}