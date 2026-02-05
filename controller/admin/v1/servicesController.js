const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op } = require('sequelize');
const imageService = require('../../../services/imageService');
const { uploadImageToS3, deleteImageFromS3, getImageUrl, encryptS3Key } = imageService;

const registerService = async (req, res) => {
  try {
    const permissions = req.permission;
    const hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    if (req.user.userRole !== 1) {
      return res.failure({ message: "You are not authorized to create services" });
    }

    const dataToCreate = { ...(req.body || {}) };
    const companyId = req.companyId || req.user?.companyId;

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

    if (req.file) {
      try {
        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;
        const uploadResult = await uploadImageToS3(
          fileBuffer,
          fileName,
          'service',
          companyId,
          'icon'
        );
        dataToCreate.icon = encryptS3Key(uploadResult.key);
      } catch (error) {
        console.error('Error uploading service icon:', error);
        return res.failure({ message: 'Failed to upload service icon: ' + error.message });
      }
    }

    dataToCreate.addedBy = req.user.id;

    const createdService = await dbService.createOne(model.services, dataToCreate);
    if (!createdService) {
      return res.failure({ message: 'Failed to create Service' });
    }

    const serviceToReturn = { ...createdService.dataValues };
    if (serviceToReturn.icon) {
      serviceToReturn.iconUrl = getImageUrl(serviceToReturn.icon, false);
    }

    return res.success({
      message: 'Service Created Successfully',
      data: serviceToReturn
    });
  } catch (error) {
    console.error(error);
    return res.internalServerError({ message: error.message });
  }
};

const findAllServices = async (req, res) => {
  try {
    const dataToFind = req.body || {};
    let options = {};
    let query = {
      isDelete: false
    };

    if (dataToFind.query) {
      query = { ...query, ...dataToFind.query };
    }

    if (dataToFind.options !== undefined) {
      options = { ...dataToFind.options };
    }

    if (dataToFind?.customSearch && typeof dataToFind.customSearch === 'object') {
      const keys = Object.keys(dataToFind.customSearch);
      const searchOrConditions = [];

      for (const key of keys) {
        const value = dataToFind.customSearch[key];
        if (value === undefined || value === null || String(value).trim() === '') continue;

        if (key === 'serviceName') {
          searchOrConditions.push({
            serviceName: {
              [Op.iLike]: `%${String(value).trim()}%`
            }
          });
        } else if (key === 'description') {
          searchOrConditions.push({
            description: {
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

    const result = await dbService.paginate(model.services, query, {
      ...options,
      select: ['id', 'serviceName', 'icon', 'description', 'isActive', 'isDelete', 'createdAt', 'updatedAt']
    });

    const processedData = (result?.data || []).map(service => {
      const serviceData = service.toJSON ? service.toJSON() : service;
      if (serviceData.icon) {
        serviceData.iconUrl = getImageUrl(serviceData.icon, false);
      }
      return serviceData;
    });

    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Services retrieved successfully',
      data: processedData,
      total: result?.total || 0,
      paginator: result?.paginator || {
        page: options.page || 1,
        paginate: options.paginate || 10,
        totalPages: 0
      }
    });
  } catch (error) {
    console.error(error);
    return res.internalServerError({ message: error.message });
  }
};

const getServices = async (req, res) => {
  try {
    const permissions = req.permission;
    const hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 1 &&
        permission.dataValues.read === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const id = req.params.id;
    const foundPackageServices = await dbService.findAll(model.packageService, {
      packageId: id
    });

    if (!foundPackageServices || foundPackageServices.length === 0) {
      return res.recordNotFound();
    }

    const packageServicesWithIcons = await Promise.all(
      foundPackageServices.map(async (ps) => {
        const psData = { ...ps.dataValues };
        if (psData.serviceId) {
          const service = await dbService.findOne(model.services, {
            id: psData.serviceId,
            isDelete: false
          });
          if (service && service.icon) {
            psData.serviceIconUrl = getImageUrl(service.icon, false);
          }
        }
        return psData;
      })
    );

    return res.success({ data: packageServicesWithIcons });
  } catch (error) {
    console.error(error);
    return res.internalServerError({ message: error.message });
  }
};

const updateService = async (req, res) => {
  try {
    const permissions = req.permission;
    const hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 9 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: "User doesn't have Permission!" });
    }

    const dataToUpdate = { ...req.body };
    const serviceId = req.params.id;
    const companyId = req.companyId || req.user?.companyId;

    const existingService = await dbService.findOne(model.services, {
      id: serviceId,
      isDelete: false
    });

    if (!existingService) {
      return res.recordNotFound({ message: 'Service not found' });
    }

    if (dataToUpdate.hasOwnProperty('icon') && (dataToUpdate.icon === null || dataToUpdate.icon === '')) {
      if (existingService.icon) {
        try {
          await deleteImageFromS3(existingService.icon);
        } catch (error) {
          console.error('Error deleting old service icon:', error);
        }
      }
      dataToUpdate.icon = null;
    } else if (req.file) {
      try {
        if (existingService.icon) {
          try {
            await deleteImageFromS3(existingService.icon);
          } catch (error) {
            console.error('Error deleting old service icon:', error);
          }
        }

        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;
        const uploadResult = await uploadImageToS3(
          fileBuffer,
          fileName,
          'service',
          companyId,
          'icon'
        );
        dataToUpdate.icon = encryptS3Key(uploadResult.key);
      } catch (error) {
        console.error('Error uploading service icon:', error);
        return res.failure({ message: 'Failed to upload service icon: ' + error.message });
      }
    }

    dataToUpdate.updatedBy = req.user.id;

    const service = await dbService.update(
      model.services,
      { id: serviceId },
      dataToUpdate
    );

    if (!service || service.length === 0) {
      return res.failure({ message: 'Failed to update Service' });
    }

    const updatedService = await dbService.findOne(model.services, {
      id: serviceId,
      isDelete: false
    });

    const serviceData = updatedService ? { ...updatedService.dataValues } : service[0];
    if (serviceData.icon) {
      serviceData.iconUrl = getImageUrl(serviceData.icon, false);
    }

    return res.success({
      message: 'Service Updated Successfully',
      data: serviceData
    });
  } catch (error) {
    console.error(error);
    return res.internalServerError({ message: error.message });
  }
};

module.exports = {
  registerService,
  findAllServices,
  getServices,
  updateService
};
