const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op, Sequelize } = require('sequelize');

/**
 * @description : create record of User in SQL table.
 * @param {Object} req : request including body for creating record.
 * @param {Object} res : response of created record.
 * @return {Object} : created User. {status, message, data}
 */

const createUser = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    let dataToCreate = { ...(req.body || {}) };
    const companyId = req.companyId;
    dataToCreate = {
      ...dataToCreate,
      isActive: true,
      addedBy: req.user.id,
      type: req.user.userType,
      companyId
    };

    let createdUser = await dbService.createOne(model.user, dataToCreate);
    if (!createdUser) {
      return res.failure({ message: 'Failed to create User' });
    }
    let userToReturn = {
      ...createdUser.dataValues
    };
    return res.success({
      message: 'User Created Successfully',
      data: userToReturn
    });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.validationError({ message: error.errors[0].message });
    }
    return res.internalServerError({ message: error.message });
  }
};

const findAllUsers = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    let dataToFind = req.body || {};
    let options = {};
    let query = {};

    // Build query from request body
    if (dataToFind.query) {
      query = { ...dataToFind.query };
    }

    // Filter by userRole (2=white label, 3=master distributor, 4=distributor, 5=retailer)
    // Only filter if userRole is explicitly provided in query
    if (query.userRole) {
      // userRole is already in query from dataToFind.query
    } else {
      // If no userRole specified, filter by allowed roles
      query.userRole = { [Op.in]: [2, 3, 4, 5] };
    }

    // Apply company filter
    const userRole = req.user.userRole;
    const userCompanyId = req.user.companyId;
    if (userRole === 1 && userCompanyId === 1) {
      // Don't filter by companyId - show all users
    } else {
      // Filter by companyId for userRole = 2 or other cases
      const companyId = req.companyId || userCompanyId;
      query.companyId = companyId;
    }

    // Handle kycStatus filter - map "pending" and "completed" to actual status values
    if (query.kycStatus) {
      const kycStatusValue = query.kycStatus;
      
      // Map "pending" to HALF_KYC and NO_KYC
      if (kycStatusValue === 'pending') {
        query.kycStatus = { [Op.in]: ['HALF_KYC', 'NO_KYC'] };
      }
      // Map "completed" to FULL_KYC
      else if (kycStatusValue === 'completed') {
        query.kycStatus = 'FULL_KYC';
      }
      // Handle string with || separator (e.g., "HALF_KYC || NO_KYC")
      else if (typeof kycStatusValue === 'string' && kycStatusValue.includes('||')) {
        const statuses = kycStatusValue.split('||').map(s => s.trim()).filter(s => s);
        if (statuses.length > 0) {
          query.kycStatus = { [Op.in]: statuses };
        }
      }
      // If it's already an array, use it directly
      else if (Array.isArray(kycStatusValue)) {
        query.kycStatus = { [Op.in]: kycStatusValue };
      }
      // Otherwise, use the value as is (e.g., "FULL_KYC", "HALF_KYC", "NO_KYC", "REJECTED")
    }

    // Handle options
    if (dataToFind.options !== undefined) {
      options = { ...dataToFind.options };
    }

    // Handle customSearch
    if (dataToFind.customSearch) {
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

    // Include company and wallet information
    options.include = [
      {
        model: model.company,
        as: 'company',
        attributes: ['id', 'companyName'],
        required: false
      },
      {
        model: model.wallet,
        as: 'wallet',
        attributes: ['id', 'mainWallet', 'apesWallet'],
        required: false
      }
    ];

    // Use pagination
    let foundUsers = await dbService.paginate(model.user, query, options);

    if (!foundUsers || !foundUsers.data || foundUsers.data.length === 0) {
      return res.success({
        message: 'Users Retrieved Successfully',
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

    // Map userRole to readable names
    const roleMap = {
      2: 'WL',
      3: 'MD',
      4: 'DI',
      5: 'RE'
    };

    // Transform the response
    const transformedData = foundUsers.data.map((user, index) => {
      const userData = user.toJSON ? user.toJSON() : user;
      const companyData = userData.company || {};
      const walletData = userData.wallet || {};

      // Determine KYC Status
      const kycStatus = userData.kycStatus === 'FULL_KYC' ? 'completed' : 'pending';

      // Get KYC Details
      const kycDetails = {
        kycStatus: userData.kycStatus || 'NO_KYC',
        kycSteps: userData.kycSteps || 0,
        mobileVerify: userData.mobileVerify || false,
        emailVerify: userData.emailVerify || false,
        aadharVerify: userData.aadharVerify || false,
        panVerify: userData.panVerify || false,
        shopDetailsVerify: userData.shopDetailsVerify || false,
        imageVerify: userData.imageVerify || false,
        profileImageWithShopVerify: userData.profileImageWithShopVerify || false,
        bankDetailsVerify: userData.bankDetailsVerify || false
      };

      // Format userAgentCode with correct prefix based on role
      return {
        id: userData.id,
        date: userData.createdAt || null,
        userId: userData.userId || null,
        name: userData.name || null,
        userRole: roleMap[userData.userRole] || `Role ${userData.userRole}`,
        mobileNo: userData.mobileNo || null,
        email: userData.email || null,
        parentName: companyData.companyName || null,
        parentRole: 'Enterprise',
        company: companyData.companyName || null,
        kycStatus: kycStatus,
        kycSteps: userData.kycSteps || 0,
        status: userData.isActive ? 'Active' : 'Inactive',
        kycDetails: kycDetails,
        wallet: {
          mainWallet: walletData.mainWallet || 0,
          apesWallet: walletData.apesWallet || 0
        }
      };
    });

    return res.success({
      message: 'Users Retrieved Successfully',
      data: transformedData,
      total: foundUsers.total,
      paginator: foundUsers.paginator
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

const getUser = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const { id } = req.params;
    const companyId = req.companyId;

    let foundUser = await dbService.findOne(model.user, {
      id,
      companyId
    });
    if (!foundUser) {
      return res.failure({ message: 'User not found' });
    }
    return res.success({
      message: 'User Retrieved Successfully',
      data: foundUser
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const { id } = req.params;
    const companyId = req.companyId;
    let dataToUpdate = { ...(req.body || {}) };
    dataToUpdate = {
      ...dataToUpdate,
      updatedBy: req.user.id,
      type: req.user.userType
    };

    let updatedUser = await dbService.update(
      model.user,
      { id, companyId },
      dataToUpdate
    );
    if (!updatedUser) {
      return res.failure({ message: 'Update User failed' });
    }
    return res.success({
      message: 'User Updated Successfully',
      data: updatedUser
    });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.validationError({ message: error.errors[0].message });
    }
    return res.internalServerError({ message: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const { id } = req.params;
    const companyId = req.companyId;

    let deletedUser = await dbService.destroy(model.user, { id, companyId });
    if (!deletedUser) {
      return res.failure({ message: 'Delete User failed' });
    }
    return res.success({
      message: 'User Deleted Successfully'
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

module.exports = {
  createUser,
  findAllUsers,
  getUser,
  updateUser,
  deleteUser
};