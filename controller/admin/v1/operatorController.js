const { operator, operatorType, state, user } = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const model = require('../../../models/index');
const fs = require('fs');

const registerService = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 24 &&
        permission.dataValues.write === true
    );

    if (!hasPermission) {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    let dataToCreate = { ...(req.body || {}) };
    let { operator_image } = req.files || {};
    const companyId = req.companyId;

    if (operator_image) {
      operator_image.map((file) => ({
        filename: file.filename,
        mimetype: file.mimetype,
        originalname: file.originalname,
        size: file.size,
        path: file.path
      }));
    }

    dataToCreate = {
      ...dataToCreate,
      image: operator_image,
      addedBy: req.user.id,
      type: req.user.userType
    };

    let createdUser = await dbService.createOne(operator, dataToCreate);
    if (!createdUser) {
      return res.failure({ message: 'Create Operator failed' });
    }
    let userToReturn = {
      ...createdUser.dataValues
    };
    const [slabs, ranges, paymentInstruments, cardTypes] = await Promise.all([
      dbService.findAll(model.slab, {companyId}, { select: ['id'] }),
      dbService.findAll(
        model.range,
        { operatorType: userToReturn.operatorType },
        { select: ['id', 'min', 'max'] }
      ),
      dbService.findAll(
        model.paymentInstrument,
        {},
        { select: ['id', 'name', 'isCardType'] }
      ),
      dbService.findAll(model.cardType, {}, { select: ['id', 'name'] })
    ]);

    let roleTypes;
    let roleNames;

    if (userToReturn.operatorType === 'BBPS') {
      roleTypes = [2, 4, 6, 7, 8];
      roleNames = ['AD', 'RE', 'DI', 'AU','WU'];
    } else {
      roleTypes = [2, 4, 6];
      roleNames = ['AD', 'RE', 'DI','WU'];
    }

    const dataToInsert = slabs.flatMap((slab) =>
      roleTypes.map((roleType, index) => ({
        slabId: slab.id,
        operatorId: userToReturn.id,
        operatorName: userToReturn.operatorName,
        operatorType: userToReturn.operatorType,
        roleType,
        roleName: roleNames[index],
        commAmt: 0,
        commType: 'com',
        amtType: 'fix',
        companyId
      }))
    );

    const dataToInsertRangeComm = slabs.flatMap((slab) =>
      ranges.flatMap((range) =>
        roleTypes.map((roleType, index) => ({
          slabId: slab.id,
          operatorId: userToReturn.id,
          operatorName: userToReturn.operatorName,
          operatorType: userToReturn.operatorType,
          rangeId: range.id,
          min: range.min,
          max: range.max,
          roleType,
          roleName: roleNames[index],
          commAmt: 0,
          commType: 'com',
          amtType: 'fix',
          companyId
        }))
      )
    );

    const dataToInsertRangeCharges = slabs.flatMap((slab) =>
      ranges.flatMap((range) =>
        roleTypes.map((roleType, index) => ({
          slabId: slab.id,
          operatorId: userToReturn.id,
          operatorName: userToReturn.operatorName,
          operatorType: userToReturn.operatorType,
          rangeId: range.id,
          min: range.min,
          max: range.max,
          roleType,
          roleName: roleNames[index],
          commAmt: 0,
          commType: 'com',
          amtType: 'fix',
          companyId
        }))
      )
    );

    let dataToInsertPgCommercials = [];

    if (userToReturn.operatorType === 'PayIn') {
      for (const slab of slabs) {
        roleTypes.map((roleType, index) => {
          for (const paymentInstrument of paymentInstruments) {
            if (paymentInstrument.isCardType) {
              for (const cardType of cardTypes) {
                dataToInsertPgCommercials.push({
                  slabId: slab.id,
                  operatorId: userToReturn.id,
                  operatorName: userToReturn.operatorName,
                  operatorType: userToReturn.operatorType,
                  roleType,
                  roleName: roleNames[index],
                  commAmt: 0,
                  commType: 'com',
                  amtType: 'fix',
                  paymentInstrumentId: paymentInstrument.id,
                  paymentInstrumentName: paymentInstrument.name,
                  cardTypeId: cardType.id,
                  cardTypeName: cardType.name,
                  companyId
                });
              }
            } else {
              dataToInsertPgCommercials.push({
                slabId: slab.id,
                operatorId: userToReturn.id,
                operatorName: userToReturn.operatorName,
                operatorType: userToReturn.operatorType,
                roleType,
                roleName: roleNames[index],
                commAmt: 0,
                commType: 'com',
                amtType: 'fix',
                paymentInstrumentId: paymentInstrument.id,
                paymentInstrumentName: paymentInstrument.name,
                cardTypeId: null,
                cardTypeName: null,
                companyId
              });
            }
          }
        });
      }
    }

    if (userToReturn.operatorType === 'BBPS') {
    }

    await Promise.all([
      dbService.createMany(model.commSlab, dataToInsert),
      dbService.createMany(model.distributorSlabCom, dataToInsert),
      dbService.createMany(model.rangeCommission, dataToInsertRangeComm),
      dbService.createMany(model.rangeCharges, dataToInsertRangeCharges),
      dbService.createMany(model.pgCommercials, dataToInsertPgCommercials, {
        ignoreDuplicates: true
      })
    ]);

    return res.success({
      message: 'New Operator Created Successfully',
      data: userToReturn
    });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error });
    }
  }
};

const findAllService = async (req, res) => {
  try {
    let dataToFind = req.body;
    const companyId = req.companyId;
    let options = {};
    let query = {};
    let foundUser;

    if (dataToFind && dataToFind.query) {
      query = dataToFind.query;
    }

    if (dataToFind && dataToFind.isCountOnly) {
      foundUser = await dbService.count(operator, query);
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

    foundUser = await dbService.paginate(model.operator, query, options);

    if (!foundUser || foundUser.length === 0) {
      return res.recordNotFound();
    }
    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Your request is successfully executed',
      data: foundUser.data,
      total: foundUser.total
    });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error });
    }
  }
};

const getService = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 24 &&
        permission.dataValues.read === true
    );

    let foundUser;
    if (hasPermission) {
      foundUser = await dbService.findOne(operator, { id: req.params.id });
    } else {
      foundUser = await dbService.findOne(operator, {
        id: req.params.id,
        addedBy: req.user.id
      });
    }
    if (!foundUser) {
      return res.recordNotFound();
    }
    return res.success({ data: foundUser });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error });
    }
  }
};

const partialUpdateService = async (req, res) => {
  try {
    let permissions = req.permission;
    let hasPermission = permissions.some(
      (permission) =>
        permission.dataValues.permissionId === 24 &&
        permission.dataValues.write === true
    );

    let dataToUpdate = { ...req.body };
    let id = req.params.id;

    const operatorExist = await dbService.findOne(operator, { id: id });
    if (!operatorExist) {
      return res.badRequest({ message: `Operator Doesn't Exist!` });
    }

    let { operator_image } = req.files || {};

    if (operator_image && operator_image.length > 0) {
      if (operatorExist.image && operatorExist.image.length > 0) {
        if (fs.existsSync(operatorExist.image[0].path)) {
          fs.unlinkSync(operatorExist.image[0].path);
        }
      }

      const newImages = operator_image.map((file) => ({
        filename: file.filename,
        mimetype: file.mimetype,
        originalname: file.originalname,
        size: file.size,
        path: file.path
      }));

      dataToUpdate = {
        ...dataToUpdate,
        updatedBy: req.user.id,
        image: newImages
      };
    } else {
      dataToUpdate = {
        ...dataToUpdate,
        updatedBy: req.user.id
      };
    }

    if (dataToUpdate.operatorName || dataToUpdate.operatorType) {
      const updateData = {
        operatorName: dataToUpdate.operatorName,
        operatorType: dataToUpdate.operatorType
      };

      const promises = [
        dbService.update(
          model.cicleCommision,
          { operatorId: operatorExist.id },
          updateData
        ),
        dbService.update(
          model.apiCommision,
          { operatorId: operatorExist.id },
          updateData
        ),
        dbService.update(
          model.commSlab,
          { operatorId: operatorExist.id },
          updateData
        ),
        dbService.update(
          model.apiOperatorCircle,
          { operatorId: operatorExist.id },
          updateData
        ),
        dbService.update(
          model.apiOperatorOptional,
          { operatorId: operatorExist.id },
          updateData
        ),
        dbService.update(
          model.apiSwitch,
          { operatorId: operatorExist.id },
          updateData
        ),
        dbService.update(
          model.apiSwitchBuffer,
          { operatorId: operatorExist.id },
          updateData
        )
      ];

      await Promise.all(promises);
    }

    let updatedUser;
    if (hasPermission || req.user.id == operatorExist.addedBy) {
      updatedUser = await dbService.update(
        operator,
        { id: req.params.id },
        dataToUpdate
      );
    } else {
      return res.failure({ message: `User doesn't have Permission!` });
    }
    return res.success({ data: updatedUser });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error });
    }
  }
};

const deleteService = async (req, res) => {
  try {
    const foundApi = await dbService.findOne(operator, {
      id: req.params.id
    });

    if (!foundApi) {
      return res.recordNotFound();
    }

    let dataToUpdate = {
      isDelete: true,
      isActive: false,
      updatedBy: req.user.id
    };

    if (req.user.id === foundApi.addedBy) {
      await dbService.update(template, { id: foundApi.id }, dataToUpdate);
    } else if (hasPermission) {
      await dbService.update(template, { id: foundApi.id }, dataToUpdate);
    } else {
      return res.failure({ message: `User doesn't have Permission!` });
    }

    return res.success({
      msg: 'Record has been deleted successfully',
      data: dataToUpdate
    });
  } catch (error) {
    console.log(error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.validationError({ message: error.errors[0].message });
    } else {
      return res.internalServerError({ message: error });
    }
  }
};

const findAlloperatorType = async (req, res) => {
  try {
    let query = {};
    const datas = await dbService.findAll(operatorType, query);

    return res.success({ data: datas });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ data: error.message });
  }
};

const findAllstate = async (req, res) => {
  try {
    let query = {};
    const datas = await dbService.findAll(state, query);

    return res.success({ data: datas });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ data: error.message });
  }
};
const operatorList = async (req, res) => {
  try {
    let query = { ...req.body };
    const datas = await dbService.findAll(model.operator, query, {
      select: ['id', 'operatorName']
    });

    return res.success({ data: datas });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ data: error.message });
  }
};

module.exports = {
  registerService,
  findAllService,
  getService,
  partialUpdateService,
  deleteService,
  findAllstate,
  findAlloperatorType,
  operatorList
};
