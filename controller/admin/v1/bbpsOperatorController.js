const model = require('../../../models');
const { Op } = require('sequelize');
const sequelize = require('sequelize');
const dbService = require('../../../utils/dbService');

const createOperatorCategory = async (req, res) => {
  try {
    const { name, custConvFee, flatFee, isCCF1Category, percentFee, gstRate } =
      req.body;

    if (!req.user || req.user.userRole !== 1) {
      return res.failure({ message: 'Unauthorized: Admin access required' });
    }

    if (!name) {
      return res.failure({ message: 'Category name is required' });
    }

    const category = await model.bbpsOperatorCategory.create({
      name,
      custConvFee: custConvFee ?? 0,
      flatFee: flatFee ?? 0,
      isCCF1Category: isCCF1Category ?? false,
      percentFee: percentFee ?? 0,
      gstRate: gstRate ?? 0,
      isActive: true,
      isDeleted: false,
      addedBy: req.user.id
    });

    return res.success({
      message: 'Operator Category created successfully',
      data: category
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.failure({
        message: 'Category name already exists'
      });
    }
    return res.failure({
      message: 'Failed to create category',
      error: error.message
    });
  }
};

const getOperatorCategories = async (req, res) => {
  try {
    const refId = req.user.id;

    const user = await dbService.findOne(
      model.user,
      { id: refId },
      { attributes: ['id'] }
    );

    if (!user) {
      return res.failure({ message: 'User Not Found' });
    }

    const categories = await model.bbpsOperatorCategory.findAll({
      where: {
        isDeleted: false
      },
      order: [['createdAt', 'DESC']]
    });

    return res.success({
      message: 'Fetched all categories successfully',
      data: categories
    });
  } catch (error) {
    return res.failure({
      message: 'Failed to get categories',
      error: error.message
    });
  }
};

const getOperatorAllCategories = async (req, res) => {
  try {
    const refId = req.user.id;
    let dataToFind = req.body;
    let options = {};
    let query = { isDeleted: false };

    const user = await dbService.findOne(
      model.user,
      { id: refId },
      { attributes: ['id'] }
    );

    if (!user) {
      return res.failure({ message: 'User Not Found' });
    }

    // Merge with query from body
    if (dataToFind && dataToFind.query) {
      query = {
        ...query,
        ...dataToFind.query
      };
    }

    // Handle options
    if (dataToFind && dataToFind.options !== undefined) {
      options = dataToFind.options;
    }

    // Handle customSearch
    if (dataToFind && dataToFind.customSearch) {
      const keys = Object.keys(dataToFind.customSearch);
      const orConditions = [];

      keys.forEach((key) => {
        const value = dataToFind.customSearch[key];
        if (typeof value === 'number') {
          orConditions.push(
            sequelize.where(sequelize.cast(sequelize.col(key), 'varchar'), {
              [Op.iLike]: `%${value}%`
            })
          );
        } else {
          orConditions.push({
            [key]: {
              [Op.iLike]: `%${value}%`
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

    // Use paginate for pagination support
    const categories = await dbService.paginate(
      model.bbpsOperatorCategory,
      query,
      options
    );

    if (!categories || !categories.data || categories.data.length === 0) {
      return res.status(200).send({
        status: 'SUCCESS',
        message: 'Fetched all categories successfully',
        data: [],
        total: 0,
        paginator: {
          itemCount: 0,
          perPage: options.paginate || 25,
          pageCount: 0,
          currentPage: options.page || 1
        }
      });
    }

    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Fetched all categories successfully',
      data: categories.data,
      total: categories.total,
      paginator: categories.paginator
    });
  } catch (error) {
    console.error('BBPS getOperatorAllCategories error:', error);
    return res.failure({
      message: 'Failed to get categories',
      error: error.message
    });
  }
};

const getOperatorCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.failure({ message: 'Category ID is required' });
    }

    const category = await model.bbpsOperatorCategory.findOne({
      where: {
        id,
        isDeleted: false
      }
    });

    if (!category) {
      return res.failure({ message: 'Operator category not found' });
    }

    return res.success({
      message: 'Operator category retrieved successfully',
      data: category
    });
  } catch (error) {
    return res.failure({
      message: 'Failed to retrieve operator category',
      error: error.message
    });
  }
};

const updateOperatorCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      isActive,
      custConvFee,
      flatFee,
      isCCF1Category,
      percentFee,
      gstRate,
      isDeleted
    } = req.body;

    if (!req.user || req.user.userRole !== 1) {
      return res.failure({ message: 'Unauthorized: Admin access required' });
    }

    if (!id) {
      return res.failure({ message: 'Category ID is required' });
    }

    const category = await dbService.findOne(model.bbpsOperatorCategory, {
      id,
      isDeleted: false
    });

    if (!category) {
      return res.failure({ message: 'Operator category not found' });
    }

    const updateData = {
      updatedBy: req.user.id
    };

    if (name !== undefined) updateData.name = name;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (custConvFee !== undefined) updateData.custConvFee = custConvFee;
    if (flatFee !== undefined) updateData.flatFee = flatFee;
    if (isCCF1Category !== undefined)
      updateData.isCCF1Category = isCCF1Category;
    if (percentFee !== undefined) updateData.percentFee = percentFee;
    if (gstRate !== undefined) updateData.gstRate = gstRate;
    if (isDeleted !== undefined) updateData.isDeleted = isDeleted;

    await model.bbpsOperatorCategory.update(updateData, {
      where: { id }
    });

    const updatedCategory = await dbService.findOne(
      model.bbpsOperatorCategory,
      {
        id
      }
    );

    return res.success({
      message: 'Operator category updated successfully',
      data: updatedCategory
    });
  } catch (error) {
    console.error('Update error:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.failure({ message: 'Category name already exists' });
    }
    return res.failure({
      message: 'Failed to update operator category',
      error: error.message
    });
  }
};

const updateAgentId = async (req, res) => {
  try {
    const { id } = req.params;
    const { agentId } = req.body;
    if (!req.user || req.user.userRole !== 1) {
      return res.failure({ message: 'Unauthorized: Admin access required' });
    }

    const existingUser = await dbService.findOne(
      model.user,
      {
        id: id
      },
      {
        attributes: ['bbpsAgentId']
      }
    );
    if (!existingUser) {
      return res.failure({ message: 'User not found' });
    }
    await dbService.update(model.user, { id: id }, { bbpsAgentId: agentId });
    const updatedUser = await dbService.findOne(model.user, {
      id
    });
    return res.success({
      message: 'Agent Id updated successfully',
      data: updatedUser
    });
  } catch (err) {
    console.err('Update error:', err);
  }
};

const deleteOperatorCategory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.failure({ message: 'Category ID is required' });
    }

    if (!req.user || req.user.userRole !== 1) {
      return res.failure({ message: 'Unauthorized: Admin access required' });
    }

    const category = await dbService.findOne(model.bbpsOperatorCategory, {
      id: id,
      isDeleted: false
    });

    if (!category) {
      return res.failure({ message: 'Operator category not found' });
    }

    const operatorCount = await model.bbpsOperator.count({
      where: {
        categoryId: id,
        isDeleted: false
      }
    });

    if (operatorCount > 0) {
      return res.failure({
        message: 'Cannot delete category with associated operators'
      });
    }

    await category.update({
      isDeleted: true,
      deletedBy: req.user.id
    });

    return res.success({
      message: 'Operator category deleted successfully'
    });
  } catch (error) {
    return res.failure({
      message: 'Failed to delete operator category',
      error: error.message
    });
  }
};

const createOperator = async (req, res) => {
  try {
    const { name, billerId, categoryId, initiatingChannel } = req.body;

    if (!req.user || req.user.userRole !== 1) {
      return res.failure({ message: 'Unauthorized: Admin access required' });
    }

    if (!name || !billerId || !categoryId || !initiatingChannel) {
      return res.failure({
        message:
          'Name, biller ID, category ID, and initiating channel are required'
      });
    }

    const category = await model.bbpsOperatorCategory.findOne({
      where: {
        id: categoryId,
        isActive: true,
        isDeleted: false
      }
    });

    if (!category) {
      return res.failure({
        message: 'Valid operator category not found'
      });
    }

    const existingOperator = await model.bbpsOperator.findOne({
      where: {
        billerId,
        isDeleted: false
      }
    });

    if (existingOperator) {
      return res.failure({
        message: 'Operator with this biller ID already exists'
      });
    }

    const operator = await model.bbpsOperator.create({
      name,
      billerId,
      categoryId,
      initChannel: initiatingChannel,
      isActive: true,
      isDeleted: false,
      addedBy: req.user.id,
      billerImage: null
    });

    return res.success({
      message: 'Operator created successfully',
      data: operator
    });
  } catch (error) {
    return res.failure({
      message: 'Failed to create operator',
      error: error.message
    });
  }
};

const uploadOperatorImage = async (req, res) => {
  try {
    const { billerId } = req.params;
    console.log('billerId', billerId);
    let { billerImage } = req.files || {};

    if (!billerId) {
      return res.failure({ message: 'Biller ID is required!' });
    }

    if (!req.user || req.user.userRole !== 1) {
      return res.failure({ message: 'Unauthorized: Admin access required' });
    }

    const existingOperator = await dbService.findOne(model.bbpsOperator, {
      billerId,
      isDeleted: false
    });

    if (!existingOperator) {
      return res.failure({ message: 'Operator not found with this biller ID' });
    }

    if (!billerImage) {
      return res.failure({ message: 'Biller image is required!' });
    }

    const formatImage = (image) =>
      Array.isArray(image)
        ? image.map((file) => ({
            filename: file.filename,
            mimetype: file.mimetype,
            originalname: file.originalname,
            size: file.size,
            path: file.path
          }))
        : [];

    const formattedBillerImage = formatImage(billerImage);

    console.log('formatted Image', formattedBillerImage);

    const updatedOperator = await model.bbpsOperator.update(
      {
        billerImage: formattedBillerImage,
        updatedBy: req.user?.id || null
      },
      {
        where: {
          billerId,
          isDeleted: false
        }
      }
    );

    if (!updatedOperator[0]) {
      return res.failure({ message: 'Failed to update operator image!' });
    }

    const updatedOperatorData = await model.bbpsOperator.findOne({
      where: {
        billerId,
        isDeleted: false
      }
    });

    return res.success({
      message: 'Operator image uploaded successfully',
      data: updatedOperatorData
    });
  } catch (error) {
    console.error('Error uploading operator image:', error);
    return res.failure({
      message: 'Internal server error',
      error: error.message
    });
  }
};

const getOperators = async (req, res) => {
  try {
    const { query = {}, options = {}, customSearch, isCountOnly } = req.body;
    const companyId = req.companyId;
    const userId = req.user?.id;

    // Extract operatorService from query if provided
    const operatorService = query.operatorService;
    let whereClause = { isDeleted: false };

    // If operatorService is provided, find the category and filter by categoryId
    if (operatorService) {
      const operatorCategory = await dbService.findOne(
        model.bbpsOperatorCategory,
        { name: operatorService, isDeleted: false }
      );
      
      if (!operatorCategory) {
        // Return empty result if category not found
        if (isCountOnly) {
          return res.success({ data: { totalRecords: 0 } });
        }
        return res.status(200).send({
          status: 'SUCCESS',
          message: 'Operators fetched successfully',
          data: [],
          total: 0,
          paginator: {
            itemCount: 0,
            perPage: options.paginate || 25,
            pageCount: 0,
            currentPage: options.page || 1
          }
        });
      }

      whereClause.categoryId = operatorCategory.id;
    }

    // Merge with remaining query parameters (excluding operatorService)
    const { operatorService: _, ...restQuery } = query;
    whereClause = {
      ...whereClause,
      ...restQuery
    };

    const userRecord = await model.user.findOne({
      where: { id: userId, companyId }
    });

    if (!userRecord) {
      return res.recordNotFound({ message: 'User not found' });
    }

    if (customSearch) {
      const keys = Object.keys(customSearch);
      const orConditions = [];

      keys.forEach((key) => {
        const value = customSearch[key];
        // Skip empty strings, null, or undefined values
        if (value === null || value === undefined || value === '') {
          return;
        }
        
        if (typeof value === 'number') {
          orConditions.push(
            sequelize.where(sequelize.cast(sequelize.col(key), 'varchar'), {
              [Op.iLike]: `%${value}%`
            })
          );
        } else if (typeof value === 'string' && value.trim() !== '') {
          orConditions.push({
            [key]: {
              [Op.iLike]: `%${value}%`
            }
          });
        }
      });

      if (orConditions.length > 0) {
        whereClause[Op.or] = orConditions;
      }
    }

    if (isCountOnly) {
      const count = await dbService.count(model.bbpsOperator, whereClause);
      return res.success({ data: { totalRecords: count } });
    }

    const foundOperators = await dbService.paginate(
      model.bbpsOperator,
      whereClause,
      options
    );

    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Operators fetched successfully',
      data: foundOperators?.data || [],
      total: foundOperators?.total || 0,
      paginator: foundOperators?.paginator || {
        itemCount: foundOperators?.total || 0,
        perPage: options.paginate || 25,
        pageCount: foundOperators?.pages || 0,
        currentPage: options.page || 1
      }
    });
  } catch (error) {
    console.error('Error in getOperators:', error);
    console.error('Error stack:', error.stack);
    return res.failure({
      message: 'Failed to fetch operators',
      error: error.message
    });
  }
};

const getOperatorById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.failure({ message: 'Operator ID is required' });
    }

    const operator = await model.bbpsOperator.findOne({
      where: {
        id,
        isDeleted: false
      },
      include: [
        {
          model: model.bbpsOperatorCategory,
          as: 'category',
          attributes: ['id', 'name'],
          where: {
            isDeleted: false
          }
        }
      ]
    });

    if (!operator) {
      return res.failure({ message: 'Operator not found' });
    }

    return res.success({
      message: 'Operator retrieved successfully',
      data: operator
    });
  } catch (error) {
    return res.failure({
      message: 'Failed to retrieve operator',
      error: error.message
    });
  }
};

const updateOperator = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, billerId, categoryId, isActive, initiatingChannel } =
      req.body;

    if (!req.user || req.user.userRole !== 1) {
      return res.failure({ message: 'Unauthorized: Admin access required' });
    }

    if (!id) {
      return res.failure({ message: 'Operator ID is required' });
    }

    const operator = await dbService.findOne(model.bbpsOperator, {
      id: id,
      isDeleted: false
    });

    if (!operator) {
      return res.failure({ message: 'Operator not found' });
    }

    const updateData = {
      updatedBy: req.user.id
    };

    if (name !== undefined) updateData.name = name;
    if (billerId !== undefined) updateData.billerId = billerId;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (initiatingChannel !== undefined)
      updateData.initChannel = initiatingChannel;

    if (categoryId !== undefined) {
      const category = await model.bbpsOperatorCategory.findOne({
        where: {
          id: categoryId,
          isActive: true,
          isDeleted: false
        }
      });

      if (!category) {
        return res.failure({ message: 'Valid operator category not found' });
      }
      updateData.categoryId = categoryId;
    }

    if (billerId !== undefined && billerId !== operator.billerId) {
      const existingOperator = await model.bbpsOperator.findOne({
        where: {
          billerId,
          isDeleted: false,
          id: { [Op.ne]: id }
        }
      });

      if (existingOperator) {
        return res.failure({
          message: 'Operator with this biller ID already exists'
        });
      }
    }

    await operator.update(updateData);

    return res.success({
      message: 'Operator updated successfully',
      data: operator
    });
  } catch (error) {
    return res.failure({
      message: 'Failed to update operator',
      error: error.message
    });
  }
};

const deleteOperator = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.failure({ message: 'Operator ID is required' });
    }

    if (!req.user || req.user.userRole !== 1) {
      return res.failure({ message: 'Unauthorized: Admin access required' });
    }

    const operator = await dbService.findOne(model.bbpsOperator, {
      id: id,
      isDeleted: false
    });

    if (!operator) {
      return res.failure({ message: 'Operator not found' });
    }

    await operator.update({
      isDeleted: true,
      deletedBy: req.user.id
    });

    return res.success({
      message: 'Operator deleted successfully'
    });
  } catch (error) {
    return res.failure({
      message: 'Failed to delete operator',
      error: error.message
    });
  }
};

const createPaymentInfo = async (req, res) => {
  try {
    const { initiatingChannel, paymentMethod, paymentInfo } = req.body;

    if (!req.user || req.user.userRole !== 1) {
      return res.failure({ message: 'Unauthorized: Admin access required.' });
    }

    if (!initiatingChannel) {
      return res.failure({ message: 'Payment channel name is required.' });
    }

    const existing = await dbService.findOne(model.bbpsPaymentInfo, {
      initiatingChannel
    });

    if (existing) {
      return res.failure({ message: 'Payment channel name already exists.' });
    }

    const record = await dbService.createOne(model.bbpsPaymentInfo, {
      initiatingChannel,
      paymentMethod,
      paymentInfo
    });

    return res.success({
      message: 'Payment info created successfully.',
      data: record
    });
  } catch (error) {
    return res.failure({
      message: 'Failed to create payment info.',
      error: error.message
    });
  }
};

const getAllPaymentInfo = async (req, res) => {
  try {
    const records = await dbService.findAll(
      model.bbpsPaymentInfo,
      {},
      { select: ['id', 'initiatingChannel', 'paymentMethod', 'paymentInfo'] }
    );

    return res.success({
      message: 'Payment info list fetched successfully.',
      data: records
    });
  } catch (error) {
    return res.failure({
      message: 'Failed to fetch payment info list.',
      error: error.message
    });
  }
};

const getPaymentInfoById = async (req, res) => {
  try {
    const { id } = req.params;

    const record = await dbService.findOne(model.bbpsPaymentInfo, { id });

    if (!record) {
      return res.failure({ message: 'Payment info not found.' });
    }

    return res.success({
      message: 'Payment info fetched successfully.',
      data: record
    });
  } catch (error) {
    return res.failure({
      message: 'Failed to fetch payment info.',
      error: error.message
    });
  }
};

const updatePaymentInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const { initiatingChannel, paymentMethod, paymentInfo } = req.body;

    if (!req.user || req.user.userRole !== 1) {
      return res.failure({ message: 'Unauthorized: Admin access required.' });
    }

    const record = await dbService.findOne(model.bbpsPaymentInfo, { id });

    if (!record) {
      return res.failure({ message: 'Payment info not found.' });
    }

    const updateData = {};
    if (initiatingChannel !== undefined)
      updateData.initiatingChannel = initiatingChannel;
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
    if (paymentInfo !== undefined) updateData.paymentInfo = paymentInfo;

    if (Object.keys(updateData).length === 0) {
      return res.failure({ message: 'No valid fields to update.' });
    }

    await dbService.update(model.bbpsPaymentInfo, { id }, updateData);

    const updated = { ...(record.toJSON?.() || record), ...updateData };

    return res.success({
      message: 'Payment info updated successfully.',
      data: updated
    });
  } catch (error) {
    console.error('Update Payment Info Error:', error);
    return res.failure({
      message: 'Failed to update payment info.',
      error: error.message
    });
  }
};

const deletePaymentInfo = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user || req.user.userRole !== 1) {
      return res.failure({ message: 'Unauthorized: Admin access required.' });
    }

    const record = await dbService.findOne(model.bbpsPaymentInfo, { id });

    if (!record) {
      return res.failure({ message: 'Payment info not found.' });
    }

    await dbService.deleteOne(model.bbpsPaymentInfo, { id });

    return res.success({
      message: 'Payment info deleted successfully.'
    });
  } catch (error) {
    return res.failure({
      message: 'Failed to delete payment info.',
      error: error.message
    });
  }
};

module.exports = {
  createOperatorCategory,
  getOperatorCategories,
  getOperatorCategoryById,
  updateOperatorCategory,
  deleteOperatorCategory,
  getOperatorAllCategories,
  createOperator,
  getOperators,
  getOperatorById,
  updateOperator,
  deleteOperator,
  uploadOperatorImage,
  updateAgentId,
  createPaymentInfo,
  getAllPaymentInfo,
  getPaymentInfoById,
  updatePaymentInfo,
  deletePaymentInfo
};
