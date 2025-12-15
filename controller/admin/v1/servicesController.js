const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op } = require('sequelize');
const imageService = require('../../../services/imageService');

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

    // Handle optional image upload
    if (req.file && req.file.buffer) {
      try {
        const imageFileName = req.file.originalname || 'service.jpg';
        const uploadResult = await imageService.uploadImageToS3(
          req.file.buffer,
          imageFileName,
          'service', // type
          companyId || 'default',
          null, // subtype
          null // userId
        );
        
        // Store image as JSON object with key
        dataToCreate.image = { key: uploadResult.key };
      } catch (imageError) {
        console.error('Error uploading service image:', imageError);
        return res.failure({ 
          message: 'Failed to upload service image', 
          error: imageError.message 
        });
      }
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
    // Use toJSON to get proper image URL
    let serviceToReturn = createdServices.toJSON();
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
    let foundServices = await dbService.findAll(model.services, query);

    if (!foundServices || foundServices.length === 0) {
      return res.recordNotFound();
    }
    
    // Convert to JSON to include image URLs
    const servicesData = foundServices.map(service => service.toJSON());
    
    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Your request is successfully executed',
      data: servicesData
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ data: error.message });
  }
};

const getActiveServices = async (req, res) => {
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
    let query = { isActive: true };
    let foundServices = await dbService.findAll(model.services, query);
    if (!foundServices || foundServices.length === 0) {
      return res.recordNotFound();
    }
    return res.success({ message: 'Active Services fetched successfully', data: foundServices });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
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
        companyId: req.user?.companyId,
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

const getServiceById = async (req, res) => {
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

    const id = req.params.id;
    const foundService = await dbService.findOne(model.services, {
      id,
      isDelete: false
    });

    if (!foundService) {
      return res.recordNotFound({ message: 'Service not found' });
    }

    // Use toJSON to get proper image URL
    const serviceData = foundService.toJSON();
    return res.success({ data: serviceData });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
};

const updateService = async (req, res) => {
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

    const id = req.params.id;
    let dataToUpdate = { ...(req.body || {}) };

    // Check if service exists
    const existingService = await dbService.findOne(model.services, {
      id,
      isDelete: false
    });

    if (!existingService) {
      return res.recordNotFound({ message: 'Service not found' });
    }

    // Check if serviceName is being updated and if it already exists
    if (dataToUpdate.serviceName && dataToUpdate.serviceName !== existingService.serviceName) {
      const duplicateService = await dbService.findOne(model.services, {
        serviceName: dataToUpdate.serviceName,
        isDelete: false,
        id: { [Op.ne]: id } // Exclude current service
      });

      if (duplicateService) {
        return res.failure({
          message: 'Service name already exists',
          data: duplicateService.dataValues
        });
      }
    }

    // Handle image update
    if (req.file && req.file.buffer) {
      try {
        // Delete old image if it exists
        if (existingService.image) {
          try {
            await imageService.deleteImageFromS3(existingService.image);
          } catch (deleteError) {
            console.error('Error deleting old service image:', deleteError);
            // Continue even if deletion fails
          }
        }

        // Upload new image
        const imageFileName = req.file.originalname || 'service.jpg';
        const companyId = req.companyId || existingService.companyId;
        const uploadResult = await imageService.uploadImageToS3(
          req.file.buffer,
          imageFileName,
          'service',
          companyId || 'default',
          null,
          null
        );

        // Store image as JSON object with key
        dataToUpdate.image = { key: uploadResult.key };
      } catch (imageError) {
        console.error('Error uploading service image:', imageError);
        return res.failure({
          message: 'Failed to upload service image',
          error: imageError.message
        });
      }
    }

    // Prepare update data
    dataToUpdate = {
      ...dataToUpdate,
      updatedBy: req.user.id,
      type: req.user.userType
    };

    // Update service
    const updatedService = await dbService.update(
      model.services,
      { id },
      dataToUpdate
    );

    if (!updatedService) {
      return res.failure({ message: 'Failed to update Service' });
    }

    // Fetch updated service to return with image URL
    const updatedServiceData = await dbService.findOne(model.services, { id });
    const serviceToReturn = updatedServiceData.toJSON();

    return res.success({
      message: 'Service Updated Successfully',
      data: serviceToReturn
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

const deleteService = async (req, res) => {
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

    const id = req.params.id;

    // Check if service exists
    const existingService = await dbService.findOne(model.services, {
      id,
      isDelete: false
    });

    if (!existingService) {
      return res.recordNotFound({ message: 'Service not found' });
    }

    // Delete image from S3 if it exists
    if (existingService.image) {
      try {
        await imageService.deleteImageFromS3(existingService.image);
      } catch (deleteError) {
        console.error('Error deleting service image:', deleteError);
        // Continue even if deletion fails
      }
    }

    // Soft delete service
    const deletedService = await dbService.update(
      model.services,
      { id },
      {
        isDelete: true,
        isActive: false,
        updatedBy: req.user.id
      }
    );

    if (!deletedService) {
      return res.failure({ message: 'Failed to delete Service' });
    }

    return res.success({
      message: 'Service Deleted Successfully'
    });
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
  updateUserService,
  getServiceById,
  updateService,
  deleteService,
  getActiveServices
};
