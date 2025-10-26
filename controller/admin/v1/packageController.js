const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { USER_TYPES } = require('../../../constants/authConstant');

const registerPackage = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 13 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }
    // Only SUPER_ADMIN can create packages
    if (req.user?.userType !== USER_TYPES.SUPER_ADMIN) {
      return res.failure({ message: "Only SUPER_ADMIN can create packages" });
    }

    // Allow companyId to be nullable or explicitly provided by SUPER_ADMIN
    const companyId = req.companyId ?? req.user?.companyId ?? null;
    let dataToCreate = { ...(req.body || {}) };
    // If SUPER_ADMIN passes companyId in body, honor it; otherwise keep computed value (may be null)
    const resolvedCompanyId =
      req.user?.userType === USER_TYPES.SUPER_ADMIN &&
      Object.prototype.hasOwnProperty.call(dataToCreate, 'companyId')
        ? dataToCreate.companyId
        : companyId;
    dataToCreate = {
      ...dataToCreate,
      addedBy: req.user.id,
      type: req.user.userType,
      companyId: resolvedCompanyId
    };

    if (dataToCreate.isDefault) {
      let datas = await dbService.findOne(model.packages, { isDefault: true });
      if (datas) {
        return res.failure({ message: 'Only one isDefault can be True!' });
      }
    }

    let createdPackage = await dbService.createOne(
      model.packages,
      dataToCreate
    );
    if (!createdPackage) {
      return res.failure({ message: 'Failed to create Package' });
    }
    let packageToReturn = {
      ...createdPackage.dataValues
    };
    return res.success({
      message: 'Package Created Successfully',
      data: packageToReturn
    });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error });
    }
  }
};

const findAllPackage = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 13 &&
        permission.dataValues.read === true
    );
    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }
    const companyId = req.companyId ?? req.user?.companyId ?? null;
    let dataToFind = req.body;
    let options = {};
    let query = {};

    if (dataToFind && dataToFind.query) {
      query = dataToFind.query;
    }
    // Apply company filter only when companyId is not null
    if (companyId !== null && companyId !== undefined) {
      query = { ...query, companyId };
    }

    if (dataToFind && dataToFind.isCountOnly) {
      let countOptions = { ...query };
      foundPackage = await dbService.count(model.packages, countOptions);
      if (!foundPackage) {
        return res.recordNotFound();
      }
      foundPackage = { totalRecords: foundPackage };
      return res.success({ data: foundPackage });
    }

    if (dataToFind && dataToFind.customSearch) {
      const keys = Object.keys(dataToFind.customSearch);
      const orConditions = [];

      keys.forEach((key) => {
        if (typeof dataToFind.customSearch[key] === 'number') {
          orConditions.push(
            sequelize.where(sequelize.cast(sequelize.col(key), 'varchar'), {
              $iLike: `%${dataToFind.customSearch[key]}%`
            })
          );
        } else {
          orConditions.push({
            [key]: {
              $iLike: `%${dataToFind.customSearch[key]}%`
            }
          });
        }
      });

      if (orConditions.length > 0) {
        query = {
          ...query,
          ['$or']: orConditions
        };
      }
    }

    options = {
      ...options,
      include: [
        {
          model: model.packageService,
          as: 'PackageServices',
          attributes: ['packageId', 'serviceId', 'isActive'],
          include: [
            {
              model: model.services,
              as: 'service',
              attributes: ['id', 'serviceName']
            }
          ]
        }
      ]
    };

    if (dataToFind && dataToFind.options) {
      options = {
        ...options,
        sort: dataToFind.options.sort,
        page: dataToFind.options.page,
        paginate: dataToFind.options.paginate
      };
    }

    let foundPackage = await dbService.smspaginate(
      model.packages,
      query,
      options
    );

    if (!foundPackage || foundPackage.length === 0) {
      return res.recordNotFound();
    }

    const allServices = await dbService.findAll(
      model.services,
      { isActive: true },
      { select: ['id', 'serviceName'] }
    );

    foundPackage.data.forEach((pkg) => {
      const existingServiceIds = pkg.PackageServices.map((ps) => ps.serviceId);
      const missingServices = allServices.filter(
        (service) => !existingServiceIds.includes(service.id)
      );

      missingServices.forEach((service) => {
        pkg.PackageServices.push({
          packageId: pkg.id,
          serviceId: service.id,
          isActive: false,
          service: {
            serviceName: service.serviceName
          }
        });
      });

      pkg.PackageServices.sort((a, b) => a.serviceId - b.serviceId);
    });

    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Your request is successfully executed',
      data: foundPackage.data,
      total: foundPackage.total
    });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error });
    }
  }
};

const getPackage = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 13 &&
        permission.dataValues.read === true
    );
    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    let foundPackage;
    foundPackage = await dbService.findOne(model.packages, {
      id: req.params.id
    });

    if (!foundPackage) {
      return res.recordNotFound();
    }
    return res.success({ data: foundPackage });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

const partialUpdatePackage = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 13 &&
        permission.dataValues.write === true
    );
    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    let dataToUpdate = { ...req.body };

    const existingPackage = await dbService.findOne(model.packages, {
      id: req.params.id
    });

    if (!existingPackage) {
      return res.failure({ message: 'Package Not found!' });
    }

    let updatedPackage;

    if (dataToUpdate.isDefault === true) {
      const existingDefault = await dbService.findOne(model.packages, {
        isDefault: true
      });

      if (existingDefault && existingDefault.id !== existingPackage.id) {
        await dbService.update(
          model.packages,
          { id: existingDefault.id },
          { isDefault: false }
        );
      }
    }
    updatedPackage = await dbService.update(
      model.packages,
      { id: req.params.id },
      dataToUpdate
    );

    return res.success({ data: updatedPackage[0] });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error });
    }
  }
};

const deletePackage = async (req, res) => {
  try {
    let permissions = req.permission || [];
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 13 &&
        permission.dataValues.write === true
    );
    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const foundApi = await dbService.findOne(model.packages, {
      id: req.params.id
    });

    if (!foundApi) {
      return res.recordNotFound();
    }

    let dataToUpdate = {
      isActive: false,
      isDelete: true,
      updatedBy: req.user.id
    };

    let dsada;

    dsada = await dbService.update(
      model.packages,
      { id: foundApi.id },
      dataToUpdate
    );

    return res.success({
      msg: 'Record has been deleted successfully',
      data: dsada
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError();
  }
};

const getUserPackage = async (req, res) => {
  const userId = req.params.id;
  const companyId = req.companyId;
  const foundApi = await dbService.findOne(model.userPackage, {
    userId,
    companyId
  });

  if (!foundApi) {
    return res.badRequest({ message: 'No Data Found!' });
  }

  return res.success({ data: foundApi });
};

module.exports = {
  registerPackage,
  findAllPackage,
  getPackage,
  partialUpdatePackage,
  getUserPackage,
  deletePackage
};
