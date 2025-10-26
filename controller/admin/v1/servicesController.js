const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op } = require('sequelize');

const registerService = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 9 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    let dataToCreate = { ...(req.body || {}) };
    const companyId = req.companyId;

    // Check if service with same name already exists
    const existingService = await dbService.findOne(model.services, {
      serviceName: dataToCreate.serviceName,
      isDelete: false
    });

    if (existingService) {
      return res.failure({
        message: 'Service already exists',
        data: existingService.dataValues
      });
    }

    dataToCreate = {
      ...dataToCreate,
      isActive: true,
      addedBy: req.user.id,
      type: req.user.userType,
      companyId
    };
    let createdServices = await dbService.createOne(
      model.services,
      dataToCreate
    );
    if (!createdServices) {
      return res.failure({ message: 'Failed to create Service' });
    }
    let serviceToReturn = {
      ...createdServices.dataValues
    };
    return res.success({
      message: 'Service Created Successfully',
      data: serviceToReturn
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

const findAllServices = async (req, res) => {
  try {
    let query = {};
    let foundPackage = await dbService.findAll(model.services, query);

    if (!foundPackage || foundPackage.length === 0) {
      return res.recordNotFound();
    }
    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Your request is successfully executed',
      data: foundPackage
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ data: error.message });
  }
};

const registerServicePackage = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 9 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    let dataToCreate = { ...(req.body || {}) };

    const packages = await dbService.findOne(model.packages, {
      id: dataToCreate.packageId
    });
    if (!packages) {
      return res.badRequest({ message: 'Package not found' });
    }

    const service = await dbService.findOne(model.services, {
      id: dataToCreate.serviceId
    });
    if (!service) {
      return res.badRequest({ message: 'Service not found' });
    }

    let where = {
      packageId: dataToCreate.packageId,
      serviceId: dataToCreate.serviceId
    };

    const api = await dbService.findOne(model.packageService, where);

    if (api) {
      if (dataToCreate.isActive == false) {
        await dbService.destroy(model.packageService, where);
        return res.success({ message: 'Data Deleted Successully' });
      }
      dataToCreate = {
        ...dataToCreate,
        updatedBy: req.user.id,
        isActive: true,
        isDelete: false
      };

      const apiCommsion = await dbService.update(
        model.packageService,
        { id: api.id },
        dataToCreate
      );
      return res.success({ data: apiCommsion });
    } else {
      dataToCreate = {
        ...dataToCreate,
        addedBy: req.user.id,
        isActive: true
      };

      const apiCommsion = await dbService.createOne(
        model.packageService,
        dataToCreate
      );

      res.success({ data: apiCommsion });
    }
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

const getServices = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 9 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }
    let id = req.params.id;
    let foundUser = await dbService.findAll(model.packageService, {
      packageId: id
    });
    if (!foundUser || foundUser.length === 0) {
      return res.recordNotFound();
    }
    return res.success({ data: foundUser });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

const updateUserPackage = async (req, res) => {
  try {
    const permissions = req.permission;
    const hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 28 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    let dataToUpdate = { ...req.body };
    const packageId = dataToUpdate.packageId;
    const userId = req.params.id;

    const [packages, userData] = await Promise.all([
      dbService.findOne(model.packages, { id: packageId }),
      dbService.findOne(model.user, { id: userId })
    ]);

    if (!packages) {
      return res.failure({ message: 'Package not found' });
    }

    if (!userData) {
      return res.badRequest({ data: 'User not found!' });
    }

    const packageService = await dbService.findAll(
      model.packageService,
      { packageId },
      { select: ['serviceId'] }
    );

    if (!packageService || packageService.length === 0) {
      return res.failure({
        message: 'No services found for the given package'
      });
    }

    const serviceIds = packageService.map((ps) => ps.dataValues.serviceId);

    const Services = await dbService.findAll(model.services, {
      id: serviceIds
    });

    if (!Services || Services.length === 0) {
      return res.failure({
        message: 'No services found for the given service IDs'
      });
    }

    await dbService.destroy(model.userPackage, { userId });

    const cost = packages.cost;
    const dataToInsert = Services.map((service) => ({
      userId,
      packageId,
      packageName: packages.packageName,
      cost: dataToUpdate.cost || cost,
      serviceId: service.id,
      serviceName: service.serviceName,
      isActive: true
    }));

    const createdPackage = await dbService.createMany(
      model.userPackage,
      dataToInsert
    );
    return res.success({ data: createdPackage });
  } catch (error) {
    console.error(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else if (error.name === 'SequelizeValidationError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error });
    }
  }
};

const processData = (data) => {
  const groupedData = {};
  data.forEach((item) => {
    const key = item.userId;
    if (!groupedData[key]) {
      groupedData[key] = {
        cost: item.cost,
        packageId: item.packageId,
        packageName: item.packageName,
        services: []
      };
    }
    groupedData[key].services.push({
      serviceId: item.serviceId,
      serviceName: item.serviceName,
      isActive: item.isActive
    });
  });
  return Object.values(groupedData);
};

const listUserPackage = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await dbService.findOne(model.user, { id: userId });
    if (!user) {
      return res.recordNotFound({ message: 'User not found' });
    }

    const packageService = await dbService.findAll(
      model.packageService,
      { packageId: user.packageId },
      { select: ['serviceId'] }
    );

    if (!packageService || packageService.length === 0) {
      return res.failure({
        message: 'No services found for the given package'
      });
    }

    const serviceIds = packageService.map((ps) => ps.dataValues.serviceId);

    const Services = await dbService.findAll(model.services, {
      id: serviceIds
    });

    if (!Services || Services.length === 0) {
      return res.failure({
        message: 'No services found for the given service IDs'
      });
    }

    const formattedResponse = processData(Services);

    if (!Services || Services.length === 0) {
      return res.recordNotFound({
        message: 'No services found for the given user'
      });
    }
    return res.success({ data: formattedResponse });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

const updateUserService = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 28 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    let dataToUpdate = { ...req.body };

    const userId = req.params.id;

    if (dataToUpdate.allTrue) {
      let foundPackage = await dbService.update(
        model.userPackage,
        { userId },
        { isActive: true }
      );
      return res.success({
        message: 'All Services are Active!',
        data: foundPackage
      });
    } else {
      const serviceId = dataToUpdate.serviceId;

      dataToUpdate = {
        ...dataToUpdate
      };

      let foundUser = await dbService.update(
        model.userPackage,
        { userId, serviceId },
        dataToUpdate
      );

      if (!foundUser || foundUser.length == 0) {
        return res.recordNotFound();
      }

      return res.success({ data: foundUser });
    }
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

module.exports = {
  registerService,
  findAllServices,
  registerServicePackage,
  getServices,
  updateUserPackage,
  listUserPackage,
  updateUserService
};
