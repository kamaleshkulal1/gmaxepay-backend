const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const { Op, Sequelize } = require('sequelize');

const createSlab = async (req, res) => {
  try {
    const { slabName, schemaMode, schemaType, subscriptionAmount } = req.body;

    if( req.user.userRole !== 3 && req.user.userRole !== 4 ) {
      return res.failure({ message: 'You are not authorized to access this resource' });
    }

    if (!slabName) {
      return res.failure({ 
        message: 'slabName is required' 
      });
    }

    if (!schemaMode) {
      return res.failure({ 
        message: 'schemaMode is required' 
      });
    }

    if (!schemaType) {
      return res.failure({ 
        message: 'schemaType is required' 
      });
    }

    if (subscriptionAmount === undefined || subscriptionAmount === null) {
      return res.failure({ 
        message: 'subscriptionAmount is required' 
      });
    }

    // Validate schemaMode
    if (!['global', 'private'].includes(schemaMode)) {
      return res.failure({ 
        message: 'schemaMode must be either "global" or "private"' 
      });
    }

    // Validate schemaType
    if (!['free', 'premium'].includes(schemaType)) {
      return res.failure({ 
        message: 'schemaType must be either "free" or "premium"' 
      });
    }

    // Validate subscriptionAmount
    if (isNaN(subscriptionAmount) || subscriptionAmount < 0) {
      return res.failure({ 
        message: 'subscriptionAmount must be a valid non-negative number' 
      });
    }

    const companyId = req.user.companyId || null;
    
    if (!companyId) {
      return res.failure({ 
        message: 'Company ID is required. User must belong to a company.' 
      });
    }

    const existingSlab = await dbService.findOne(model.slab, {
      slabName: slabName,
      addedBy: req.user.id,
      companyId: companyId
    });

    if (existingSlab) {
      return res.failure({ 
        message: `Slab with name "${slabName.trim()}" already exists for this company` 
      });
    }

    const dataToCreate = {
      slabName: slabName.trim(),
      schemaMode,
      schemaType,
      subscriptionAmount: subscriptionAmount,
      companyId: companyId, 
      remark: null,
      isSignUpB2B: false,
      users: [],
      isActive: true,
      addedBy: req.user.id,
      type: req.user.userType
    };

    // Create the slab
    const createdSlab = await dbService.createOne(model.slab, dataToCreate);

    if (!createdSlab) {
      return res.failure({ message: 'Failed to create slab' });
    }

    const slabId = createdSlab.id || createdSlab.dataValues?.id;

    // Get all operators that are in slab
    const operators = await dbService.findAll(
      model.operator,
      { inSlab: true },
      { select: ['id', 'operatorName', 'operatorType', 'commType', 'amtType'] }
    );

    
    if (operators && operators.length > 0) {
      let roleTypes, roleNames;
      if (req.user.userRole === 3) {
        roleTypes = [3, 4, 5];
        roleNames = ['MD', 'DI', 'RE'];
      } else if (req.user.userRole === 4) {
        roleTypes = [4, 5];
        roleNames = ['DI', 'RE'];
      }

      const defaultCommissions = operators.flatMap((op) =>
        roleTypes.map((roleType, index) => ({
          slabId: slabId,
          companyId: companyId,
          operatorId: op.id,
          operatorName: op.operatorName,
          operatorType: op.operatorType,
          roleType,
          roleName: roleNames[index],
          commAmt: 0,
          commType: op.commType || 'com',
          amtType: op.amtType || 'fix',
          paymentMode: null,
          addedBy: req.user.id,
          updatedBy: req.user.id
        }))
      );

      if (defaultCommissions.length > 0) {
        await dbService.createMany(model.commSlab, defaultCommissions);
      }
    }

    return res.success({
      message: 'Slab created successfully for downline roles',
      data: createdSlab
    });
  } catch (error) {
    console.error('Create slab error', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error.message });
    }
  }
};

const processData = (data, myDealsMap = {}) => {
  const groupedData = {};

  data.forEach((item) => {
    const itemData = item.toJSON ? item.toJSON() : item;
    const operatorData = itemData.operator || {};
    const key = `${itemData.slabId}-${itemData.operatorId}`;
    const myDeal = myDealsMap[itemData.operatorId] || {};

    if (!groupedData[key]) {
      groupedData[key] = {
        slabId: itemData.slabId,
        operatorId: itemData.operatorId,
        operatorName: itemData.operatorName,
        operatorType: itemData.operatorType,
        marginCommAmt: myDeal.commAmt !== undefined ? myDeal.commAmt : (operatorData.comm || 0),
        marginCommType: myDeal.commType || operatorData.commType || 'com',
        marginAmtType: myDeal.amtType || operatorData.amtType || 'fix',
        instruments: []
      };
    }

    let instrument = groupedData[key].instruments.find(
      (inst) =>
        inst.paymentInstrument === itemData.paymentInstrumentName &&
        inst.cardType === itemData.cardTypeName
    );

    if (!instrument) {
      instrument = {
        paymentInstrument: itemData.paymentInstrumentName,
        cardType: itemData.cardTypeName,
        roles: []
      };
      groupedData[key].instruments.push(instrument);
    }

    instrument.roles.push({
      id: itemData.id,
      roleType: itemData.roleType,
      roleName: itemData.roleName,
      commType: itemData.commType,
      commAmt: itemData.commAmt,
      amtType: itemData.amtType,
      updatedAt: itemData.updatedAt
    });
  });

  return Object.values(groupedData);
};

const getAllSlabs = async (req, res) => {
  try {
    if (req.user.userRole !== 2) {
      return res.failure({ message: 'You are not authorized to access this resource' });
    }

    const companyId = req.companyId ?? req.user?.companyId ?? null;
    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }
    
    const dataToFind = req.body || {};
    let options = {};
    let query = {
      companyId: companyId,
      isActive: true
    };

    if (dataToFind && dataToFind.query) {
      query = { ...query, ...dataToFind.query };
    }

    if (dataToFind && dataToFind.options !== undefined) {
      options = { ...dataToFind.options };
    }

    if (dataToFind?.customSearch && typeof dataToFind.customSearch === 'object') {
      const keys = Object.keys(dataToFind.customSearch);
      const searchOrConditions = [];

      for (const key of keys) {
        const value = dataToFind.customSearch[key];
        if (value === undefined || value === null || String(value).trim() === '') continue;

        if (key === 'slabName') {
          searchOrConditions.push({
            slabName: {
              [Op.iLike]: `%${String(value).trim()}%`
            }
          });
        }
      }

      if (searchOrConditions.length > 0) {
        if (searchOrConditions.length === 1) {
          Object.assign(query, searchOrConditions[0]);
        } else {
          query[Op.and] = [
            { [Op.or]: searchOrConditions }
          ];
        }
      }
    }

    const allSlabs = await dbService.findAll(model.slab, query, {
      attributes: ['users']
    });

    const allUserIds = new Set();
    if (allSlabs && allSlabs.length > 0) {
      allSlabs.forEach(slab => {
        const users = slab.users || [];
        if (Array.isArray(users) && users.length > 0) {
          users.forEach(userId => {
            if (userId) {
              allUserIds.add(userId);
            }
          });
        }
      });
    }

    const totalUsers = allUserIds.size;

    const result = await dbService.paginate(model.slab, query, {
      ...options,
      select: ['id', 'slabName', 'schemaMode', 'schemaType', 'subscriptionAmount', 'isActive', 'remark', 'users', 'createdAt', 'updatedAt']
    });

    const processedData = (result?.data || []).map(slab => {
      const slabData = slab.toJSON ? slab.toJSON() : slab;
      const users = slabData.users || [];
      const totalUsersInSlab = Array.isArray(users) ? users.filter(id => id).length : 0;
      
      const { users: _, ...rest } = slabData;
      
      return {
        ...rest,
        totalUsers: totalUsersInSlab
      };
    });

    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Slabs retrieved successfully',
      data: processedData,
      total: result?.total || 0,
      paginator: result?.paginator || {
        page: options.page || 1,
        paginate: options.paginate || 10,
        totalPages: 0
      }
    });
  } catch (error) {
    console.error('Get all slabs error', error);
    return res.status(500).send({
      status: 'FAILURE',
      message: error.message || 'Internal server error'
    });
  }
};

const findAllslabComm = async (req, res) => {
  try {
    if (req.user.userRole !== 2) {
      return res.failure({ message: 'You are not authorized to access this resource' });
    }

    let dataToFind = req.body;
    const companyId = req.companyId ?? req.user?.companyId ?? null;
    
    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    let options = { order: [['id', 'ASC']] };
    let query = {};
    let foundUser;

    if (dataToFind && dataToFind.query) {
      query = dataToFind.query;
    }

    const filteredSlabs = await dbService.findAll(
      model.slab,
      {
        companyId: companyId,
        id: req.params.id,
        isActive: true
      },
      {
        attributes: ['id']
      }
    );

    if (!filteredSlabs || filteredSlabs.length === 0) {
      return res.failure({ message: 'No slabs found' });
    }

    const slabIds = filteredSlabs.map((s) => s.id || s.dataValues?.id).filter(Boolean);

    if (!slabIds.length) {
      return res.failure({ message: 'No slabs found' });
    }

    // Get user's slabId to find their WU commissions (myDeals)
    const existingUser = await dbService.findOne(model.user, {
      id: req.user.id,
      companyId: companyId
    });

    if (!existingUser) {
      return res.failure({ message: 'User not found' });
    }

    // Fetch all WU commissions for the user's slab, grouped by operatorId
    let myDeals = [];
    if (existingUser.slabId) {
      myDeals = await dbService.findAll(model.commSlab, {
        slabId: existingUser.slabId,
        roleType: 2,
        roleName: 'WU'
      });
    }

    // Create a map of operatorId -> WU commission data for quick lookup
    const myDealsMap = {};
    if (myDeals && myDeals.length > 0) {
      myDeals.forEach((deal) => {
        // Handle both Sequelize model instances and plain objects
        const dealData = deal.toJSON ? deal.toJSON() : deal;
        const operatorId = dealData.operatorId;
        if (operatorId) {
          myDealsMap[operatorId] = {
            commAmt: dealData.commAmt,
            commType: dealData.commType,
            amtType: dealData.amtType
          };
        }
      });
    }

    query.slabId = { [Op.in]: slabIds };
    query.companyId = companyId;

    if (dataToFind && dataToFind.isCountOnly) {
      foundUser = await dbService.count(model.commSlab, query);
      if (!foundUser) {
        return res.recordNotFound();
      }
      foundUser = { totalRecords: foundUser };
      return res.success({ data: foundUser });
    }

    if (dataToFind && dataToFind.options !== undefined) {
      options = dataToFind.options;
    }

    if (dataToFind && dataToFind.customSearch) {
      const keys = Object.keys(dataToFind.customSearch);
      const orConditions = [];

      keys.forEach((key) => {
        if (typeof dataToFind.customSearch[key] === 'number') {
          orConditions.push(
            Sequelize.where(Sequelize.cast(Sequelize.col(key), 'varchar'), {
              [Op.iLike]: `%${dataToFind.customSearch[key]}%`
            })
          );
        } else {
          orConditions.push({
            [key]: {
              [Op.iLike]: `%${dataToFind.customSearch[key]}%`
            }
          });
        }
      });

      if (orConditions.length > 0) {
        query = {
          ...query,
          [Op.or]: orConditions
        };
      }
    }

    // Filter to only include downline roles (WU, MD, DI, RE) - Role types: 2, 3, 4, 5
    query.roleType = { [Op.in]: [2, 3, 4, 5] };

    foundUser = await dbService.findAll(model.commSlab, query, {
      ...options,
      include: [
        {
          model: model.operator,
          as: 'operator',
          attributes: ['comm', 'commType', 'amtType']
        }
      ]
    });

    if (!foundUser || foundUser.length === 0) {
      return res.failure({ message: 'No slabs Commissions found' });
    }

    // Pass myDealsMap to processData to use WU commissions as margin
    const formattedResponse = processData(foundUser, myDealsMap);

    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Your request is successfully executed',
      data: formattedResponse,
      total: formattedResponse.length
    });
  } catch (error) {
    console.error('Find all slab comm error', error);
    return res.internalServerError({ data: error.message });
  }
};

const updateSlabComm = async (req, res) => {
  try {
    if (req.user.userRole !== 2) {
      return res.failure({ message: 'You are not authorized to update slab commission' });
    }

    const { commAmt, commType, amtType } = req.body;
    const id = req.params.id;
    const companyId = req.companyId ?? req.user?.companyId ?? null;

    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    if (commAmt === undefined && commType === undefined && amtType === undefined) {
      return res.failure({ message: 'At least one of commAmt, commType, or amtType must be provided' });
    }

    // Validate commType if provided
    if (commType !== undefined && !['com', 'sur'].includes(commType)) {
      return res.failure({ message: 'commType must be either "com" or "sur"' });
    }
    if (amtType !== undefined && !['fix', 'per'].includes(amtType)) {
      return res.failure({ message: 'amtType must be either "fix" or "per"' });
    }

    // Validate commAmt if provided
    if (commAmt !== undefined && (isNaN(commAmt) || commAmt < 0)) {
      return res.failure({ message: 'commAmt must be a valid non-negative number' });
    }

    // Find the slab commission entry
    const slabComm = await dbService.findOne(model.commSlab, {
      id,
      companyId: companyId
    });

    if (!slabComm) {
      return res.failure({ message: 'Slab commission entry not found' });
    }

    // Build update data
    const updateData = {
      updatedBy: req.user.id
    };

    if (commAmt !== undefined) {
      updateData.commAmt = parseFloat(commAmt);
    }

    if (commType !== undefined) {
      updateData.commType = commType;
    }
    if (amtType !== undefined) {
      updateData.amtType = amtType;
    }

    // Update the slab commission
    const updatedSlabComm = await dbService.update(
      model.commSlab,
      { id, companyId: companyId },
      updateData
    );

    if (!updatedSlabComm || updatedSlabComm.length === 0) {
      return res.failure({ message: 'Failed to update slab commission' });
    }

    return res.success({
      message: 'Slab commission updated successfully',
      data: updatedSlabComm[0]
    });
  } catch (error) {
    console.error('Update slab comm error', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.failure({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.failure({ message: error.errors[0].message });
    } else {
      return res.failure({ message: error.message });
    }
  }
};

const updateSlabDetails = async (req, res) => {
  try {
    if (req.user.userRole !== 2) {
      return res.failure({ message: 'You are not authorized to update slab details' });
    }

    const { slabName, subscriptionAmount, schemaMode, schemaType } = req.body;
    const id = req.params.id;

    if (!id) {
      return res.failure({ message: 'Slab ID is required' });
    }

    if (!slabName && subscriptionAmount === undefined && schemaMode === undefined && schemaType === undefined) {
      return res.failure({ message: 'Please provide at least one field to update' });
    }

    const companyId = req.companyId ?? req.user?.companyId ?? null;

    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    // Find the slab
    const slab = await dbService.findOne(model.slab, {
      id: id,
      companyId: companyId
    });

    if (!slab) {
      return res.failure({ message: 'Slab not found' });
    }

    // Build update data
    const updateData = {
      updatedBy: req.user.id
    };

    if (slabName !== undefined) {
      if (!slabName || slabName.trim() === '') {
        return res.failure({ message: 'slabName cannot be empty' });
      }
      updateData.slabName = slabName.trim();
      
      // Check if new slabName already exists for this company (excluding current slab)
      const existingSlab = await dbService.findOne(model.slab, {
        slabName: slabName,
        addedBy: req.user.id,
        companyId: companyId,
        id: { [Op.ne]: id }
      });

      if (existingSlab) {
        return res.failure({ 
          message: `Slab with name "${slabName.trim()}" already exists for this company` 
        });
      }
    }

    if (subscriptionAmount !== undefined) {
      if (subscriptionAmount === null) {
        return res.failure({ message: 'subscriptionAmount cannot be null' });
      }
      if (isNaN(subscriptionAmount) || subscriptionAmount < 0) {
        return res.failure({ message: 'subscriptionAmount must be a valid non-negative number' });
      }
      updateData.subscriptionAmount = parseFloat(subscriptionAmount);
    }

    if (schemaMode !== undefined) {
      // Validate schemaMode
      if (!['global', 'private'].includes(schemaMode)) {
        return res.failure({ 
          message: 'schemaMode must be either "global" or "private"' 
        });
      }
      updateData.schemaMode = schemaMode;
    }

    if (schemaType !== undefined) {
      // Validate schemaType
      if (!['free', 'premium'].includes(schemaType)) {
        return res.failure({ 
          message: 'schemaType must be either "free" or "premium"' 
        });
      }
      updateData.schemaType = schemaType;
    }

    // Update the slab
    const updatedSlab = await dbService.update(
      model.slab,
      { id: id, companyId: companyId },
      updateData
    );

    if (!updatedSlab || updatedSlab.length === 0) {
      return res.failure({ message: 'Failed to update slab' });
    }

    return res.success({
      message: 'Slab updated successfully',
      data: updatedSlab[0]
    });
  } catch (error) {
    console.error('Update slab details error', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.failure({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.failure({ message: error.errors[0].message });
    } else {
      return res.failure({ message: error.message });
    }
  }
};

module.exports = {
  createSlab,
  getAllSlabs,
  findAllslabComm,
  updateSlabComm,
  updateSlabDetails
};
