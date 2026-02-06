const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');

const getServices = async (req, res) => {
  try {
    if([4,5].includes(req.user.userRole)) {
      return res.failure({ message: 'You are not authorized to access this resource' });
    }
    const dataToFind = req.body || {};
    let query = {};

    if (dataToFind.query) {
      query = { ...query, ...dataToFind.query };
    } else {
      query = { isDelete: false };
    }

    const services = await dbService.findAll(model.services, query);
    return res.success({
      data: services,
      message: 'Services retrieved successfully'
    });
  } catch (error) {
    return res.internalServerError({ message: error.message });
  }
};

module.exports = {
  getServices
};