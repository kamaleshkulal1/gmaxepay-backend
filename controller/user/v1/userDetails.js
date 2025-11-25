const dbService = require('../../../utils/dbService');
const model = require('../../../models/index');

const getProfile = async (req, res) => {
  try {
    const user = await dbService.findOne(model.user, { id: req.user.id });
    if (!user) {
      return res.notFound({ message: 'User not found' });
    }
    const outlet = await dbService.findOne(model.outlet, { refId: user.id });
    const userDetails = {
      userId: user.id,
      mobileNo: user.mobileNo,
      name: user.name,
      profileImage: user.profileImage ? `${process.env.AWS_CDN_URL}/${user.profileImage}` : null,
      referrerCode: user.referCode,
      outlet: outlet ? outlet.shopName : null
    }
    return res.success({ message: 'User profile retrieved successfully', data: userDetails });
  } catch (error) {
    console.log(error);
    return res.internalServerError({ message: error.message });
  }
}

module.exports = {
  getProfile
};