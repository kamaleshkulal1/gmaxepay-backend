const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const { Op, Sequelize } = require('sequelize');
const { generateTransactionID } = require('../../../utils/transactionID');

const createSlab = async (req, res) => {
  try {
    const { slabName, schemaMode, schemaType, subscriptionAmount, views } = req.body;

    if(![3,4].includes(req.user.userRole)) {
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

    // Validate views based on schemaMode
    let validatedViews = [];
    if (schemaMode === 'private') {
      // If schemaMode is private, views is required
      if (views === undefined || views === null) {
        return res.failure({ 
          message: 'views is required when schemaMode is "private". Please specify which users can view this slab.' 
        });
      }
      if (!Array.isArray(views)) {
        return res.failure({ 
          message: 'views must be an array of user IDs' 
        });
      }
      // Ensure all items in views array are valid integers
      validatedViews = views.filter((userId) => {
        const id = Number(userId);
        return !isNaN(id) && id > 0;
      }).map((userId) => Number(userId));
      
      if (validatedViews.length === 0) {
        return res.failure({ 
          message: 'views array must contain at least one valid user ID when schemaMode is "private"' 
        });
      }
    } else {
      // If schemaMode is global, views is optional (anyone can view)
      if (views !== undefined && views !== null) {
        if (!Array.isArray(views)) {
          return res.failure({ 
            message: 'views must be an array of user IDs' 
          });
        }
        // Ensure all items in views array are valid integers
        validatedViews = views.filter((userId) => {
          const id = Number(userId);
          return !isNaN(id) && id > 0;
        }).map((userId) => Number(userId));
      }
    }

    // Validate subscriptionAmount based on schemaType
    let validatedSubscriptionAmount = 0;
    if (schemaType === 'premium') {
      // If schemaType is premium, subscriptionAmount is required
      if (subscriptionAmount === undefined || subscriptionAmount === null) {
        return res.failure({ 
          message: 'subscriptionAmount is required when schemaType is "premium"' 
        });
      }
      const amount = Number(subscriptionAmount);
      if (isNaN(amount) || amount < 0) {
        return res.failure({ 
          message: 'subscriptionAmount must be a valid non-negative number when schemaType is "premium"' 
        });
      }
      validatedSubscriptionAmount = amount;
    } else {
      // If schemaType is free, subscriptionAmount is optional (defaults to 0)
      if (subscriptionAmount !== undefined && subscriptionAmount !== null) {
        const amount = Number(subscriptionAmount);
        if (isNaN(amount) || amount < 0) {
          return res.failure({ 
            message: 'subscriptionAmount must be a valid non-negative number' 
          });
        }
        validatedSubscriptionAmount = amount;
      }
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
      subscriptionAmount: validatedSubscriptionAmount,
      views: validatedViews,
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
    if(![3,4].includes(req.user.userRole)) {
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
      addedBy: req.user.id,
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
    if(![3,4].includes(req.user.userRole)) {
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

    if(existingUser.slabId === null || existingUser.slabId === undefined) {
      return res.failure({ message: 'Pls Subscribe to a slab or contact your Admin' });
    }

    // Map userRole to roleType and roleName for fetching commercials
    const roleMapping = {
      3: { roleType: 3, roleName: 'MD' },
      4: { roleType: 4, roleName: 'DI' }
    };

    // Fetch commissions for the user's slab based on their role
    let myDeals = [];
    const roleConfig = roleMapping[req.user.userRole];
    if (roleConfig && existingUser.slabId) {
      myDeals = await dbService.findAll(model.commSlab, {
        slabId: existingUser.slabId,
        roleType: roleConfig.roleType,
        roleName: roleConfig.roleName,
        companyId: companyId
      });
    }

    // Create a map of operatorId -> commission data for quick lookup
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
    if(![3,4].includes(req.user.userRole)) {
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

    const { slabName, subscriptionAmount, schemaMode, schemaType, views } = req.body;
    const id = req.params.id;

    if (!id) {
      return res.failure({ message: 'Slab ID is required' });
    }

    if (!slabName && subscriptionAmount === undefined && schemaMode === undefined && schemaType === undefined && views === undefined) {
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

    // Determine the final schemaMode and schemaType (use new value if provided, otherwise existing)
    const finalSchemaMode = schemaMode !== undefined ? schemaMode : slab.schemaMode;
    const finalSchemaType = schemaType !== undefined ? schemaType : slab.schemaType;

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

    // Handle views update - validate based on final schemaMode
    if (views !== undefined) {
      if (views === null) {
        // If setting to null, check if schemaMode is private
        if (finalSchemaMode === 'private') {
          return res.failure({ 
            message: 'views cannot be empty when schemaMode is "private". Please provide at least one user ID.' 
          });
        }
        updateData.views = [];
      } else if (!Array.isArray(views)) {
        return res.failure({ 
          message: 'views must be an array of user IDs' 
        });
      } else {
        // Validate and sanitize views array - ensure all items are valid integers
        const validatedViews = views.filter((userId) => {
          const id = Number(userId);
          return !isNaN(id) && id > 0;
        }).map((userId) => Number(userId));
        
        // If schemaMode is private, views must have at least one user
        if (finalSchemaMode === 'private' && validatedViews.length === 0) {
          return res.failure({ 
            message: 'views array must contain at least one valid user ID when schemaMode is "private"' 
          });
        }
        updateData.views = validatedViews;
      }
    } else if (schemaMode !== undefined && finalSchemaMode === 'private') {
      // If schemaMode is being changed to private but views is not provided, check existing views
      const currentViews = slab.views || [];
      if (!Array.isArray(currentViews) || currentViews.length === 0) {
        return res.failure({ 
          message: 'views is required when schemaMode is "private". Please provide at least one user ID in the views array.' 
        });
      }
    }

    // Handle subscriptionAmount update - validate based on final schemaType
    if (subscriptionAmount !== undefined) {
      if (subscriptionAmount === null) {
        // If setting to null, check if schemaType is premium
        if (finalSchemaType === 'premium') {
          return res.failure({ 
            message: 'subscriptionAmount is required when schemaType is "premium". Please provide a valid amount.' 
          });
        }
        updateData.subscriptionAmount = 0;
      } else {
        const amount = Number(subscriptionAmount);
        if (isNaN(amount) || amount < 0) {
          return res.failure({ 
            message: 'subscriptionAmount must be a valid non-negative number' 
          });
        }
        // If schemaType is premium, subscriptionAmount must be greater than 0
        if (finalSchemaType === 'premium' && amount <= 0) {
          return res.failure({ 
            message: 'subscriptionAmount must be greater than 0 when schemaType is "premium"' 
          });
        }
        updateData.subscriptionAmount = amount;
      }
    } else if (schemaType !== undefined && finalSchemaType === 'premium') {
      // If schemaType is being changed to premium but subscriptionAmount is not provided, check existing amount
      const currentAmount = slab.subscriptionAmount || 0;
      if (currentAmount <= 0) {
        return res.failure({ 
          message: 'subscriptionAmount is required when schemaType is "premium". Please provide a valid amount greater than 0.' 
        });
      }
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

const upradeORChangeSlab = async (req, res) => {
  try {
    if (![3, 4, 5].includes(req.user.userRole)) {
      return res.failure({ message: 'You are not authorized to upgrade or change slab' });
    }

    const slabId = req.params.id;
    const companyId = req.companyId ?? req.user?.companyId ?? null;

    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    const existingUser = await dbService.findOne(model.user, {
      id: req.user.id,
      companyId: companyId,
      isActive: true
    });

    if (!existingUser) {
      return res.failure({ message: 'User not found' });
    }

    if (!slabId) {
      return res.failure({ message: 'slabId is required' });
    }

    // Find parent user (reportingTo) or company admin to determine which slabs to show
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

    const slab = await dbService.findOne(model.slab, {
      id: slabId,
      companyId: companyId,
      isActive: true,
      addedBy: addedByUserId
    });

    if (!slab) {
      return res.failure({ message: 'Slab not found' });
    }

    const company = await dbService.findOne(model.company, { id: companyId });
    if (!company) {
      return res.failure({ message: 'Company not found' });
    }

    const previousSlabId = existingUser.slabId;
    const isSlabAssigned = Number(previousSlabId) === Number(slabId);
    const slabUsers = slab.users || [];
    const isUserInSlab = Array.isArray(slabUsers) && slabUsers.includes(existingUser.id);
    const slabViews = slab.views || [];
    const isUserInViews = Array.isArray(slabViews) && slabViews.includes(existingUser.id);

    // Check wallet balance early before any database operations
    if (!isSlabAssigned) {
      // Check if subscription already exists
      const existingSubscription = await dbService.findOne(model.subscription, {
        slabId: slabId,
        userId: existingUser.id,
        companyId: companyId
      });

      if (!existingSubscription) {
        const subscriptionAmount = parseFloat(slab.subscriptionAmount || 0);

        if (subscriptionAmount > 0) {
          // Get or create wallet for existingUser.id
          let requesterWallet = await dbService.findOne(model.wallet, {
            refId: existingUser.id,
            companyId: companyId
          });

          if (!requesterWallet) {
            requesterWallet = await dbService.createOne(model.wallet, {
              refId: existingUser.id,
              companyId: companyId,
              roleType: existingUser.userType,
              mainWallet: 0,
              apes1Wallet: 0,
              apes2Wallet: 0,
              addedBy: existingUser.id,
              updatedBy: existingUser.id
            });
          }

          const openingBalance = parseFloat(requesterWallet.mainWallet || 0);

          if (openingBalance < subscriptionAmount) {
            return res.failure({
              message: `Insufficient wallet balance. Required: ${subscriptionAmount}, Available: ${openingBalance}`
            });
          }
        }
      }
    }

    // If user was already assigned to some other slab, remove them from that slab's users array
    if (!isSlabAssigned && previousSlabId) {
      const previousSlab = await dbService.findOne(model.slab, { id: previousSlabId });
      if (previousSlab && Array.isArray(previousSlab.users) && previousSlab.users.length > 0) {
        const filteredUsers = previousSlab.users.filter((userId) => userId !== existingUser.id);
        if (filteredUsers.length !== previousSlab.users.length) {
          await dbService.update(
            model.slab,
            { id: previousSlabId },
            { users: filteredUsers }
          );
        }
      }
      // Remove user from previous slab's views array
      if (previousSlab && Array.isArray(previousSlab.views) && previousSlab.views.length > 0) {
        const filteredViews = previousSlab.views.filter((userId) => userId !== existingUser.id);
        if (filteredViews.length !== previousSlab.views.length) {
          await dbService.update(
            model.slab,
            { id: previousSlabId },
            { views: filteredViews }
          );
        }
      }
    }

    if (!isSlabAssigned) {
      await dbService.update(
        model.user,
        { id: existingUser.id },
        { slabId: slabId }
      );
    }

    // Ensure user is present in the new slab's users array
    if (!isUserInSlab) {
      const updatedUsers = Array.isArray(slabUsers) ? [...slabUsers, existingUser.id] : [existingUser.id];
      await dbService.update(
        model.slab,
        { id: slabId },
        { users: updatedUsers }
      );
    }

    // Ensure user is present in the new slab's views array (for visibility)
    if (!isUserInViews) {
      const updatedViews = Array.isArray(slabViews) ? [...slabViews, existingUser.id] : [existingUser.id];
      await dbService.update(
        model.slab,
        { id: slabId },
        { views: updatedViews }
      );
    }

    const originalCompanyId = slab.companyId;

    // 1) Try to copy existing commissions from the slab's original company
    if (originalCompanyId !== companyId) {
      const existingCommissions = await dbService.findAll(model.commSlab, {
        slabId: slabId,
        companyId: originalCompanyId
      });

      if (existingCommissions && existingCommissions.length > 0) {
        const existingForNewCompany = await dbService.findAll(model.commSlab, {
          slabId: slabId,
          companyId: companyId
        });

        if (!existingForNewCompany || existingForNewCompany.length === 0) {
          const commissionsToCreate = existingCommissions.map((comm) => {
            const commData = comm.toJSON ? comm.toJSON() : comm;
            return {
              slabId: slabId,
              companyId: companyId,
              operatorId: commData.operatorId,
              operatorName: commData.operatorName,
              operatorType: commData.operatorType,
              roleType: commData.roleType,
              roleName: commData.roleName,
              commAmt: commData.commAmt || 0,
              commType: commData.commType || 'com',
              amtType: commData.amtType || 'fix',
              paymentMode: commData.paymentMode || null,
              addedBy: req.user.id,
              updatedBy: req.user.id
            };
          });

          await dbService.createMany(model.commSlab, commissionsToCreate);
        }
      }
    }

    // 2) If still no commissions for this slab + company, create default ones
    const companyCommissions = await dbService.findAll(model.commSlab, {
      slabId: slabId,
      companyId: companyId
    });

    if (!companyCommissions || companyCommissions.length === 0) {
      const operators = await dbService.findAll(
        model.operator,
        { inSlab: true },
        { select: ['id', 'operatorName', 'operatorType'] }
      );

      if (operators && operators.length > 0) {
        let rolesToCreate = [];
        
        if (existingUser.userRole === 3) {
          // MD can create commissions for MD, DI, and RE
          rolesToCreate = [
            { roleType: 3, roleName: 'MD' },
            { roleType: 4, roleName: 'DI' },
            { roleType: 5, roleName: 'RE' }
          ];
        } else if (existingUser.userRole === 4) {
          // DI can create commissions for DI and RE
          rolesToCreate = [
            { roleType: 4, roleName: 'DI' },
            { roleType: 5, roleName: 'RE' }
          ];
        } else if (existingUser.userRole === 5) {
          // RE can create commissions for RE only
          rolesToCreate = [
            { roleType: 5, roleName: 'RE' }
          ];
        }

        if (rolesToCreate.length > 0) {
          const defaultCommissions = operators.flatMap((op) =>
            rolesToCreate.map((roleConfig) => ({
              slabId: slabId,
              companyId: companyId,
              operatorId: op.id,
              operatorName: op.operatorName,
              operatorType: op.operatorType,
              roleType: roleConfig.roleType,
              roleName: roleConfig.roleName,
              commAmt: 0,
              commType: 'com',
              amtType: 'fix',
              paymentMode: null,
              addedBy: existingUser.id,
              updatedBy: existingUser.id
            }))
          );

          if (defaultCommissions.length > 0) {
            await dbService.createMany(model.commSlab, defaultCommissions);
          }
        }
      }
    }

    // Create subscription record when slab is assigned
    if (!isSlabAssigned) {
      // Check if subscription already exists
      const existingSubscription = await dbService.findOne(model.subscription, {
        slabId: slabId,
        userId: existingUser.id,
        companyId: companyId
      });

      if (!existingSubscription) {
        // New subscription - deduct subscriptionAmount from existingUser.id's mainWallet
        const subscriptionAmount = parseFloat(slab.subscriptionAmount || 0);

        if (subscriptionAmount > 0) {
          // Get wallet (already checked balance above, wallet exists or was created)
          const requesterWallet = await dbService.findOne(model.wallet, {
            refId: existingUser.id,
            companyId: companyId
          });

          const openingBalance = parseFloat(requesterWallet.mainWallet || 0);
          const closingBalance = parseFloat((openingBalance - subscriptionAmount).toFixed(2));

          // Generate transaction ID
          const requesterCompany = await dbService.findOne(model.company, { id: companyId });
          const transactionID = generateTransactionID(requesterCompany?.companyName || 'SYSTEM');

          // Update wallet
          await dbService.update(
            model.wallet,
            { refId: existingUser.id, companyId: companyId },
            { mainWallet: closingBalance, updatedBy: existingUser.id }
          );

          // Create wallet history entry
          await dbService.createOne(model.walletHistory, {
            refId: existingUser.id,
            companyId: companyId,
            walletType: 'mainWallet',
            amount: subscriptionAmount,
            debit: subscriptionAmount,
            credit: 0,
            openingAmt: openingBalance,
            closingAmt: closingBalance,
            transactionId: transactionID,
            paymentStatus: 'SUCCESS',
            remark: `Slab subscription payment - ${slab.slabName || `Slab ID: ${slabId}`}`,
            addedBy: existingUser.id,
            updatedBy: existingUser.id
          });
        }

        // Create subscription record
        await dbService.createOne(model.subscription, {
          slabId: slabId,
          userId: existingUser.id,
          companyId: companyId,
          status: 'SUCCESS',
          addedBy: existingUser.id,
          isActive: true
        });
      } else {
        // Subscription already exists - no deduction needed
        // Update existing subscription status to SUCCESS
        await dbService.update(
          model.subscription,
          {
            slabId: slabId,
            userId: existingUser.id,
            companyId: companyId
          },
          {
            status: 'SUCCESS',
            updatedBy: existingUser.id,
            isActive: true
          }
        );
      }
    }

    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Slab assigned to user successfully',
      data: {
        slabId: slabId,
        companyId: companyId,
        userId: existingUser.id,
        wasAlreadyAssigned: isSlabAssigned && isUserInSlab
      }
    });
  } catch (error) {
    console.error('Upgrade or change slab error', error);
    return res.status(500).send({
      status: 'FAILURE',
      message: error.message || 'Internal server error'
    });
  }
};

module.exports = {
  createSlab,
  getAllSlabs,
  findAllslabComm,
  updateSlabComm,
  updateSlabDetails,
  upradeORChangeSlab
};
