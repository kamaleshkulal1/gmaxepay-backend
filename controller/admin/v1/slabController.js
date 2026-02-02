const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op, Sequelize } = require('sequelize');
const { generateTransactionID } = require('../../../utils/transactionID');

const processData = (data) => {
  const groupedData = {};

  data.forEach((item) => {
    const key = `${item.slabId}-${item.operatorId}`;

    const operatorMargin = item.operator || {};

    if (!groupedData[key]) {
      groupedData[key] = {
        slabId: item.slabId,
        operatorId: item.operatorId,
        operatorName: item.operatorName,
        operatorType: item.operatorType,
        marginCommAmt: operatorMargin.comm,
        marginCommType: operatorMargin.commType,
        marginAmtType: operatorMargin.amtType,
        instruments: []
      };
    }

    let instrument = groupedData[key].instruments.find(
      (inst) =>
        inst.paymentInstrument === item.paymentInstrumentName &&
        inst.cardType === item.cardTypeName
    );

    if (!instrument) {
      instrument = {
        paymentInstrument: item.paymentInstrumentName,
        cardType: item.cardTypeName,
        roles: []
      };
      groupedData[key].instruments.push(instrument);
    }

    instrument.roles.push({
      id: item.id,
      roleType: item.roleType,
      roleName: item.roleName,
      commType: item.commType,
      commAmt: item.commAmt,
      amtType: item.amtType,
      updatedAt: item.updatedAt
    });
  });

  return Object.values(groupedData);
};

const findAllslabComm = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    if(req.user.userRole!==1 && req.user.companyId!==companyId) {
      return res.failure({ message: 'You are not authorized to create slab' });
    }

    let dataToFind = req.body;
    const companyId = req.companyId ?? req.user?.companyId ?? null;
    let options = { order: [['id', 'ASC']] };
    let query = {};
    let foundUser;

    if (dataToFind && dataToFind.query) {
      query = dataToFind.query;
    }
    const filteredSlabs = await dbService.findAll(
      model.slab,
      {
        addedBy: 1,
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

    query.slabId = { [Op.in]: slabIds };

    if (dataToFind && dataToFind.isCountOnly) {
      foundUser = await dbService.count(model.pgCommercials, query);
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

    // Filter to only include roleType 1 (AD) and 2 (WU)
    query.roleType = { [Op.in]: [1, 2] };

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

    const formattedResponse = processData(foundUser);

    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Your request is successfully executed',
      data: formattedResponse,
      total: formattedResponse.length
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ data: error.message });
  }
};

const updateSlab = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }
    const slabId = req.params.id;
    const { slabName, schemaMode, schemaType, views, subscriptionAmount } = req.body;

    if (!slabId) {
      return res.failure({ message: 'slabId is required' });
    }

    // At least one field must be provided for update
    if (!slabName && !schemaMode && !schemaType && views === undefined && subscriptionAmount === undefined) {
      return res.failure({ message: 'At least one field (slabName, schemaMode, schemaType, views, subscriptionAmount) must be provided' });
    }

    const companyId = req.companyId ?? req.user?.companyId ?? null;

    // Find the slab
    const slab = await dbService.findOne(model.slab, {
      id: slabId,
      ...(companyId !== null && companyId !== undefined ? { companyId } : {})
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
        slabName: slabName.trim(),
        companyId: companyId,
        id: { [Op.ne]: slabId }
      });

      if (existingSlab) {
        return res.failure({ 
          message: `Slab with name "${slabName.trim()}" already exists for this company` 
        });
      }
    }

    if (schemaMode !== undefined) {
      if (!['global', 'private'].includes(schemaMode)) {
        return res.failure({ message: 'schemaMode must be either "global" or "private"' });
      }
      updateData.schemaMode = schemaMode;
    }

    if (schemaType !== undefined) {
      if (!['free', 'premium'].includes(schemaType)) {
        return res.failure({ message: 'schemaType must be either "free" or "premium"' });
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
      { id: slabId },
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
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.failure({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.failure({ message: error.errors[0].message });
    } else {
      return res.failure({ message: error.message });
    }
  }
};

const updateSlabComm = async (req, res) => {
  try {
    const permissions = req.permission || [];
    const hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }


    if(req.user.userRole!==1 && req.user.companyId!==companyId) {
      return res.failure({ message: 'You are not authorized to create slab' });
    }

    const { commAmt, commType, amtType } = req.body;
    const id = req.params.id;
    const companyId =  req.user.companyId;

    if(req.user.userRole!==1 && req.user.companyId!==companyId){
      return res.failure({ message: 'You are not authorized to update slab commission' });
    }
    if (commAmt === undefined && commType === undefined && amtType === undefined) {
      return res.failure({ message: 'At least one of commAmt, commType, or amtType must be provided' });
    }

    // Validate commType if provided
    if (commType !== undefined && !['com', 'sur'].includes(commType)) {
      return res.failure({ message: 'commType must be either "com" or "sur"' });
    }
    if(amtType !== undefined && !['fix', 'per'].includes(amtType)) {
      return res.failure({ message: 'amtType must be either "fix" or "per"' });
    }

    // Validate commAmt if provided
    if (commAmt !== undefined && (isNaN(commAmt) || commAmt < 0)) {
      return res.failure({ message: 'commAmt must be a valid non-negative number' });
    }
;

    // Find the slab commission entry
    const slabComm = await dbService.findOne(model.commSlab, {
      id
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
    if(amtType !== undefined) {
      updateData.amtType = amtType;
    }

    // Update the slab commission
    const updatedSlabComm = await dbService.update(
      model.commSlab,
      { id },
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
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.failure({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.failure({ message: error.errors[0].message });
    } else {
      return res.failure({ message: error.message });
    }
  }
};

const createSlab = async (req, res) => {
  try {
    const { slabName, schemaMode, schemaType, views, subscriptionAmount } = req.body;

    if(req.user.userRole!==1 && req.user.companyId!==companyId) {
      return res.failure({ message: 'You are not authorized to create slab' });
    }
    // Validate required fields
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

    // Get companyId from the user creating the slab
    const companyId = req.companyId ?? req.user?.companyId ?? null;
    
    if (!companyId) {
      return res.failure({ 
        message: 'Company ID is required. User must belong to a company.' 
      });
    }

    // Check if slab with same name already exists for this company
    const existingSlab = await dbService.findOne(model.slab, {
      slabName,
      companyId: companyId
    });

    if (existingSlab) {
      return res.failure({ 
        message: `Slab with name "${slabName}" already exists for this company` 
      });
    }

    const dataToCreate = {
      slabName: slabName,
      schemaMode,
      schemaType,
      companyId: companyId, 
      remark: null,
      isSignUpB2B: false,
      users: [],
      views: validatedViews,
      subscriptionAmount: validatedSubscriptionAmount,
      isActive: true,
      addedBy: req.user.id,
      type: req.user.userType
    };

    // Create the slab
    const createdSlab = await dbService.createOne(model.slab, dataToCreate);

    if (!createdSlab) {
      return res.failure({ message: 'Failed to create slab' });
    }

    const slabId = createdSlab.id;

    // Create default commissions for this slab + company
    const operators = await dbService.findAll(
      model.operator,
      { inSlab: true },
      { select: ['id', 'operatorName', 'operatorType'] }
    );

    if (operators && operators.length > 0) {
      const roleTypes = [1, 2];
      const roleNames = ['AD', 'WU'];

      const defaultCommissions = operators.flatMap((op) =>
        roleTypes.map((roleType, index) => ({
          slabId: slabId,
          companyId: companyId,
          operatorId: op.id,
          operatorName: op.operatorName,
          operatorType: op.operatorType,
          roleType,
          roleName: roleNames[index] || 'RE',
          commAmt: 0,
          commType: 'com',
          amtType: 'fix',
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
      message: 'Slab created successfully',
      data: createdSlab
    });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error.message });
    }
  }
};

const getAllSlabs = async (req, res) => {
  try {
    const companyId = req.user.companyId;
    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }
    
    if(req.user.userRole!==1 && req.user.companyId!==1) {
      return res.failure({ message: 'You are not authorized to get all slabs' });
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
      attributes: ['users', 'views', 'schemaMode']
    });

    const allUserIds = new Set();
    const allViewUserIds = new Set();
    
    if (allSlabs && allSlabs.length > 0) {
      allSlabs.forEach(slab => {
        const slabData = slab.toJSON ? slab.toJSON() : slab;
        const users = slabData.users || [];
        const views = slabData.views || [];
        
        if (Array.isArray(users) && users.length > 0) {
          users.forEach(userId => {
            if (userId) {
              allUserIds.add(userId);
            }
          });
        }
        
        // Collect view user IDs only for private slabs
        if (slabData.schemaMode === 'private' && Array.isArray(views) && views.length > 0) {
          views.forEach(userId => {
            if (userId) {
              allViewUserIds.add(userId);
            }
          });
        }
      });
    }

    const totalUsers = allUserIds.size;

    // Fetch user details with company information for view users
    let viewUsersMap = {};
    if (allViewUserIds.size > 0) {
      const viewUserIdsArray = Array.from(allViewUserIds);
      
      // Fetch users
      const viewUsers = await dbService.findAll(model.user, {
        id: { [Op.in]: viewUserIdsArray },
        isActive: true
      }, {
        attributes: ['id', 'name', 'companyId']
      });

      // Get unique company IDs
      const companyIds = new Set();
      if (viewUsers && viewUsers.length > 0) {
        viewUsers.forEach(user => {
          const userData = user.toJSON ? user.toJSON() : user;
          if (userData.companyId) {
            companyIds.add(userData.companyId);
          }
        });
      }

      // Fetch companies
      let companiesMap = {};
      if (companyIds.size > 0) {
        const companies = await dbService.findAll(model.company, {
          id: { [Op.in]: Array.from(companyIds) }
        }, {
          attributes: ['id', 'companyName']
        });

        if (companies && companies.length > 0) {
          companies.forEach(company => {
            const companyData = company.toJSON ? company.toJSON() : company;
            companiesMap[companyData.id] = companyData.companyName || null;
          });
        }
      }

      // Map users with their company names
      if (viewUsers && viewUsers.length > 0) {
        viewUsers.forEach(user => {
          const userData = user.toJSON ? user.toJSON() : user;
          viewUsersMap[userData.id] = {
            userId: userData.id,
            userName: userData.name || null,
            companyId: userData.companyId || null,
            companyName: userData.companyId ? (companiesMap[userData.companyId] || null) : null
          };
        });
      }
    }

    const result = await dbService.paginate(model.slab, query, {
      ...options,
      select: ['id', 'slabName', 'schemaMode', 'schemaType', 'subscriptionAmount', 'isActive', 'remark', 'users', 'views', 'createdAt', 'updatedAt']
    });

    const processedData = (result?.data || []).map(slab => {
      const slabData = slab.toJSON ? slab.toJSON() : slab;
      const users = slabData.users || [];
      const views = slabData.views || [];
      const totalUsersInSlab = Array.isArray(users) ? users.filter(id => id).length : 0;
      
      const { users: _, views: __, ...rest } = slabData;
      
      const responseData = {
        ...rest,
        totalUsers: totalUsersInSlab
      };

      // Only include view details for private slabs
      if (slabData.schemaMode === 'private') {
        const viewDetails = [];
        if (Array.isArray(views) && views.length > 0) {
          views.forEach(userId => {
            if (userId && viewUsersMap[userId]) {
              viewDetails.push(viewUsersMap[userId]);
            }
          });
        }
        responseData.totalViews = viewDetails.length;
        responseData.viewDetails = viewDetails;
      } else {
        // For global slabs, don't show view details
        responseData.totalViews = 0;
        responseData.viewDetails = [];
      }
      
      return responseData;
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
    console.log(error);
    return res.status(500).send({
      status: 'FAILURE',
      message: error.message || 'Internal server error'
    });
  }
};

const getAllCompanySlabList = async (req, res) => {
  try {
    const userId = req.params.id;
    
    if (!userId) {
      return res.failure({ message: 'User ID is required' });
    }

    const user = await dbService.findOne(model.user, {
      id: userId,
      isActive: true
    });

    if (!user) {
      return res.failure({ message: 'User not found' });
    }

    const companyId = user.companyId;
    if (!companyId) {
      return res.failure({ message: 'User does not belong to a company' });
    }

    const allSlabs = await dbService.findAll(model.slab, {
      isActive: true,
      addedBy: 1
    }, {
      attributes: ['id', 'slabName', 'schemaMode', 'views', 'subscriptionAmount']
    });

    if (!allSlabs || allSlabs.length === 0) {
      return res.success({
        message: 'No slabs found',
        data: [],
        total: 0
      });
    }

    const visibleSlabs = allSlabs.filter(slab => {
      const slabData = slab.toJSON ? slab.toJSON() : slab;

      if (slabData.schemaMode === 'global') {
        return true;
      }

      if (slabData.schemaMode === 'private') {
        const views = slabData.views || [];
        return Array.isArray(views) && views.includes(Number(userId));
      }

      return false;
    });

    const userIdNum = Number(userId);
    
    const userSubscriptions = await dbService.findAll(model.subscription, {
      userId: userIdNum,
      companyId: companyId,
      status: 'SUCCESS',
      isActive: true
    }, {
      attributes: ['slabId']
    });

    const subscribedSlabIds = new Set();
    if (userSubscriptions && userSubscriptions.length > 0) {
      userSubscriptions.forEach(sub => {
        const subData = sub.toJSON ? sub.toJSON() : sub;
        if (subData.slabId) {
          subscribedSlabIds.add(subData.slabId);
        }
      });
    }

    const slabNames = visibleSlabs.map(slab => {
      const slabData = slab.toJSON ? slab.toJSON() : slab;
      const subscriptionAmount = slabData.subscriptionAmount || 0;
      const isSubscribed = subscribedSlabIds.has(slabData.id);
      
      return {
        id: slabData.id,
        slabName: slabData.slabName,
        slabAmount: subscriptionAmount === 0 ? 'free' : subscriptionAmount,
        isSubscribed: isSubscribed
      };
    });

    return res.success({
      message: 'Company slab list retrieved successfully',
      data: slabNames,
      total: slabNames.length
    });
  } catch (error) {
    console.error('Get all company slab list error', error);
    return res.internalServerError({ message: error.message });
  }
};

const assignSlabToCompany = async (req, res) => {
  try {
    const { slabId, companyId } = req.body;
    
    if (req.user.companyId !== companyId && req.user.userRole !== 1) {
      return res.failure({ message: 'You are not authorized to assign this slab to this company' });
    }
    
    if (!slabId) {
      return res.failure({ message: 'slabId is required' });
    }
    
    if (!companyId) {
      return res.failure({ message: 'companyId is required' });
    }

    const slab = await dbService.findOne(model.slab, {
      id: slabId,
      isActive: true
    });

    if (!slab) {
      return res.failure({ message: 'Slab not found' });
    }

    const company = await dbService.findOne(model.company, { id: companyId });
    if (!company) {
      return res.failure({ message: 'Company not found' });
    }

    const companyAdmin = await dbService.findOne(model.user, {
      companyId: companyId,
      userRole: 2,
      isActive: true
    });

    if (!companyAdmin) {
      return res.failure({ message: 'Company admin not found' });
    }

    const previousSlabId = companyAdmin.slabId;
    const isSlabAssigned = Number(previousSlabId) === Number(slabId);
    const slabUsers = slab.users || [];
    const isUserInSlab = Array.isArray(slabUsers) && slabUsers.includes(companyAdmin.id);
    const slabViews = slab.views || [];
    const isUserInViews = Array.isArray(slabViews) && slabViews.includes(companyAdmin.id);

    // If admin was already assigned to some other slab, remove them from that slab's users array
    if (!isSlabAssigned && previousSlabId) {
      const previousSlab = await dbService.findOne(model.slab, { id: previousSlabId });
      if (previousSlab && Array.isArray(previousSlab.users) && previousSlab.users.length > 0) {
        const filteredUsers = previousSlab.users.filter((userId) => userId !== companyAdmin.id);
        if (filteredUsers.length !== previousSlab.users.length) {
          await dbService.update(
            model.slab,
            { id: previousSlabId },
            { users: filteredUsers }
          );
        }
      }
      // Remove admin from previous slab's views array
      if (previousSlab && Array.isArray(previousSlab.views) && previousSlab.views.length > 0) {
        const filteredViews = previousSlab.views.filter((userId) => userId !== companyAdmin.id);
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
        { id: companyAdmin.id },
        { slabId: slabId }
      );
    }

    // Ensure admin is present in the new slab's users array
    if (!isUserInSlab) {
      const updatedUsers = Array.isArray(slabUsers) ? [...slabUsers, companyAdmin.id] : [companyAdmin.id];
      await dbService.update(
        model.slab,
        { id: slabId },
        { users: updatedUsers }
      );
    }

    // Ensure admin is present in the new slab's views array (for downline visibility)
    if (!isUserInViews) {
      const updatedViews = Array.isArray(slabViews) ? [...slabViews, companyAdmin.id] : [companyAdmin.id];
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
        const roleTypes = [1, 2];
        const roleNames = ['AD', 'WU'];

        const defaultCommissions = operators.flatMap((op) =>
          roleTypes.map((roleType, index) => ({
            slabId: slabId,
            companyId: companyId,
            operatorId: op.id,
            operatorName: op.operatorName,
            operatorType: op.operatorType,
            roleType,
            roleName: roleNames[index] || 'RE',
            commAmt: 0,
            commType: 'com',
            amtType: 'fix',
            paymentMode: null,
            addedBy: req.user.id,
            updatedBy: req.user.id
          }))
        );

        if (defaultCommissions.length > 0) {
          await dbService.createMany(model.commSlab, defaultCommissions);
        }
      }
    }

    // Create subscription record when slab is assigned
    if (!isSlabAssigned) {
      // Check if subscription already exists
      const existingSubscription = await dbService.findOne(model.subscription, {
        slabId: slabId,
        userId: companyAdmin.id,
        companyId: companyId
      });

      if (!existingSubscription) {
        // New subscription - deduct subscriptionAmount from req.user.id's mainWallet
        const subscriptionAmount = parseFloat(slab.subscriptionAmount || 0);
        
        if (subscriptionAmount > 0) {
          // Get or create wallet for req.user.id
          let requesterWallet = await dbService.findOne(model.wallet, {
            refId: req.user.id,
            companyId: req.user.companyId
          });

          if (!requesterWallet) {
            requesterWallet = await dbService.createOne(model.wallet, {
              refId: req.user.id,
              companyId: req.user.companyId,
              roleType: req.user.userType,
              mainWallet: 0,
              apes1Wallet: 0,
              apes2Wallet: 0,
              addedBy: req.user.id,
              updatedBy: req.user.id
            });
          }

          const openingBalance = parseFloat(requesterWallet.mainWallet || 0);
          
          if (openingBalance < subscriptionAmount) {
            return res.failure({ 
              message: `Insufficient wallet balance. Required: ${subscriptionAmount}, Available: ${openingBalance}` 
            });
          }

          const closingBalance = parseFloat((openingBalance - subscriptionAmount).toFixed(2));
          
          // Generate transaction ID
          const requesterCompany = await dbService.findOne(model.company, { id: req.user.companyId });
          const transactionID = generateTransactionID(requesterCompany?.companyName || 'SYSTEM');

          // Update wallet
          await dbService.update(
            model.wallet,
            { refId: req.user.id, companyId: req.user.companyId },
            { mainWallet: closingBalance, updatedBy: req.user.id }
          );

          // Create wallet history entry
          await dbService.createOne(model.walletHistory, {
            refId: req.user.id,
            companyId: req.user.companyId,
            walletType: 'mainWallet',
            amount: subscriptionAmount,
            debit: subscriptionAmount,
            credit: 0,
            openingAmt: openingBalance,
            closingAmt: closingBalance,
            transactionId: transactionID,
            paymentStatus: 'SUCCESS',
            remark: `Slab subscription payment - ${slab.slabName || `Slab ID: ${slabId}`}`,
            addedBy: req.user.id,
            updatedBy: req.user.id
          });
        }

        // Create subscription record
        await dbService.createOne(model.subscription, {
          slabId: slabId,
          userId: companyAdmin.id,
          companyId: companyId,
          status: 'SUCCESS',
          addedBy: req.user.id,
          isActive: true
        });
      } else {
        // Subscription already exists - no deduction needed
        // Update existing subscription status to SUCCESS
        await dbService.update(
          model.subscription,
          {
            slabId: slabId,
            userId: companyAdmin.id,
            companyId: companyId
          },
          {
            status: 'SUCCESS',
            updatedBy: req.user.id,
            isActive: true
          }
        );
      }
    }

    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Slab assigned to company admin successfully',
      data: {
        slabId: slabId,
        companyId: companyId,
        adminId: companyAdmin.id,
        wasAlreadyAssigned: isSlabAssigned && isUserInSlab
      }
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send({
      status: 'FAILURE',
      message: error.message || 'Internal server error'
    });
  }
};


module.exports = {
  findAllslabComm,
  updateSlab,
  updateSlabComm,
  createSlab,
  getAllSlabs,
  assignSlabToCompany,
  getAllCompanySlabList,
};
