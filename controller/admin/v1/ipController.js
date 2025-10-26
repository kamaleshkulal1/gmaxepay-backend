const { ipInfo, ipListType } = require('../../../model');
const dbService = require('../../../utils/dbService');

const createIp = async (req, res) => {
  try {
    const dataToCreate = { ...req.body };

    const createdIp = await dbService.createOne(ipInfo, dataToCreate);

    const foundType = await dbService.findOne(ipListType, {
      ipType: dataToCreate.ipType
    });

    if (!foundType) {
      return res.failure({ message: 'No IP Type Found exists!' });
    }

    if (!createdIp) {
      return res.failure({ message: 'Failed to create IP' });
    }

    return res.success({
      message: 'IP created successfully',
      data: createdIp
    });
  } catch (error) {
    console.log(error);
    res.failure({ message: 'Error creating IP' });
  }
};

const listIp = async (req, res) => {
  try {
    let dataToFind = req.body;
    let options = {};
    let query = {};
    let foundData;

    if (dataToFind && dataToFind.query) {
      query = dataToFind.query;
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

    foundData = await dbService.paginate(ipInfo, query, options);

    if (!foundData) {
      return res.recordNotFound();
    }
    return res.status(200).send({
      status: 'SUCCESS',
      message: 'Your request is successfully executed',
      data: foundData.data,
      total: foundData.total
    });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ data: error.message });
  }
};

const updateIp = async (req, res) => {
  try {
    const id = req.params.id;
    const dataToUpdate = { ...req.body };
    const foundData = await dbService.findOne(ipInfo, { id: id });
    if (!foundData) {
      return res.recordNotFound();
    }

    if (dataToUpdate.ipType) {
      const foundType = await dbService.findOne(ipListType, {
        ipType: dataToUpdate.ipType
      });
      if (!foundType) {
        return res.failure({ message: 'No IP Type Found exists!' });
      }
    }

    const updatedIp = await dbService.update(ipInfo, { id: id }, dataToUpdate);
    if (!updatedIp) {
      return res.failure({
        message: ' Failed to Update Ip Information'
      });
    }

    return res.success({
      message: 'Ip Information Updated Successfully',
      data: updatedIp
    });
  } catch (error) {
    res.status(400).send({ message: 'Error updating IP' });
  }
};

const getIp = async (req, res) => {
  try {
    const id = req.params.id;
    const foundData = await dbService.findOne(ipInfo, { id: id });
    if (!foundData) {
      return res.recordNotFound();
    }

    return res.success({
      message: 'Ip Information Updated Successfully',
      data: foundData
    });
  } catch (error) {
    res.status(500).send({ message: 'Error fetching IP' });
  }
};

const deleteIp = async (req, res) => {
  try {
    const id = req.params.id;
    const foundData = await dbService.findOne(ipInfo, { id: id });
    if (!foundData) {
      return res.recordNotFound();
    }
    const deletedIp = await dbService.destroy(ipInfo, { id: id });

    return res.success({
      message: 'Ip Deleted Successfully',
      data: deletedIp
    });
  } catch (error) {
    res.status(400).send({ message: 'Error deleting IP' });
  }
};

const listType = async (req, res) => {
  try {
    const foundData = await dbService.findAll(ipListType);
    if (!foundData) {
      return res.recordNotFound();
    }

    return res.success({
      message: 'Ip Fetched Successfully',
      data: foundData
    });
  } catch (error) {
    res.status(400).send({ message: 'Error fetching IP' });
  }
};

const showIp = async (req, res) => {
  try {
    let ipAddress = req.headers['x-forwarded-for'];

    return res.success({
      message: 'Your Ip is',
      data: ipAddress
    });
  } catch (error) {
    res.status(400).send({ message: 'Error deleting IP' });
  }
};

module.exports = {
  createIp,
  listIp,
  updateIp,
  getIp,
  deleteIp,
  listType,
  showIp
};
