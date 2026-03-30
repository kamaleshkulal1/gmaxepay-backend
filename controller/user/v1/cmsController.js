const { Op } = require('sequelize');
const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const cmsService = require('../../../services/cmsService');
const { generateTransactionID } = require('../../../utils/transactionID');

const initiateCms = async (req, res) => {
    try {

        const [existingUser, companyDetails] = await Promise.all([
            dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId }),
            dbService.findOne(model.company, { id: req.user.companyId })
        ]);
        if (!existingUser) return res.failure({ message: 'User not found' });
        if (!companyDetails) return res.failure({ message: 'Company not found' });

        const referenceId = generateTransactionID(companyDetails.companyName || 'GMAXEPAY');
        await dbService.createOne(model.cmsHistory, {
            refId: req.user.id,
            companyId: req.user.companyId,
            referenceId,
            mobileNo: existingUser?.mobileNo,
            status: 'PENDING',
            addedBy: req.user.id,
            updatedBy: req.user.id
        });

        const externalRes = await cmsService.initiateAirtelCms(referenceId);

        if (externalRes.status) {
            return res.success({
                message: externalRes.message || 'Success',
                data: {
                    redirectionUrl: externalRes.redirectionUrl || externalRes.redirecturl
                }
            });
        } else {
            await dbService.update(model.cmsHistory, { referenceId }, {
                status: 'FAILED',
                errorMsg: externalRes.message,
                responsePayload: externalRes
            });

            return res.failure({
                message: externalRes.message || 'Failed',
                data: externalRes
            });
        }

    } catch (err) {
        console.error('Initiate CMS error:', err);
        return res.failure({ message: err.message || 'Internal Server Error' });
    }
};

const getCmsReports = async (req, res) => {
    try {
        if (!req.user.companyId) return res.failure({ message: 'Company ID is required' });
        const dataToFind = req.body || {};
        let options = { order: [['createdAt', 'DESC']] };
        if (dataToFind.options) {
            options = {
                ...dataToFind.options,
                order: dataToFind.options.sort ? Object.entries(dataToFind.options.sort).map(([f, d]) => [f, d === -1 ? 'DESC' : 'ASC']) : [['createdAt', 'DESC']]
            };
        }
        options.include = [{ model: model.user, as: 'user', attributes: ['id', 'name', 'userId', 'mobileNo'], required: false }];

        const filter = {
            refId: req.user.id,
            companyId: req.user.companyId,
            status: { [Op.in]: ['SUCCESS', 'FAILED'] }
        };

        if (dataToFind.query) {
            if (dataToFind.query.startDate && dataToFind.query.endDate) {
                filter.createdAt = {
                    [Op.between]: [
                        new Date(dataToFind.query.startDate + 'T00:00:00.000Z'),
                        new Date(dataToFind.query.endDate + 'T23:59:59.999Z')
                    ]
                };
            } else if (dataToFind.query.startDate) {
                filter.createdAt = { [Op.gte]: new Date(dataToFind.query.startDate + 'T00:00:00.000Z') };
            } else if (dataToFind.query.endDate) {
                filter.createdAt = { [Op.lte]: new Date(dataToFind.query.endDate + 'T23:59:59.999Z') };
            }

            Object.keys(dataToFind.query).forEach(key => {
                if (key !== 'refId' && key !== 'companyId' && key !== 'startDate' && key !== 'endDate') {
                    filter[key] = dataToFind.query[key];
                }
            });
        }

        if (dataToFind.customSearch && typeof dataToFind.customSearch === 'object') {
            Object.entries(dataToFind.customSearch).forEach(([key, value]) => {
                if (value === undefined || value === null || String(value).trim() === '') return;
                const trimmedValue = String(value).trim();
                if (key === 'transactionId' || key === 'referenceId') {
                    filter.referenceId = { [Op.iLike]: `%${trimmedValue}%` };
                } else if (key === 'mobileNo') {
                    filter.mobileNo = { [Op.iLike]: `%${trimmedValue}%` };
                } else {
                    filter[key] = { [Op.iLike]: `%${trimmedValue}%` };
                }
            });
        }

        const result = await dbService.paginate(model.cmsHistory, filter, options);
        return res.status(200).send({
            status: 'SUCCESS',
            message: 'CMS reports retrieved successfully',
            data: result?.data || [],
            total: result?.total || 0,
            paginator: result?.paginator || { page: 1, paginate: 10, totalPages: 0 }
        });
    } catch (error) {
        console.error('Get CMS Reports error:', error);
        return res.failure({ message: error.message || 'Internal Server Error' });
    }
};

module.exports = {
    initiateCms,
    getCmsReports
};

