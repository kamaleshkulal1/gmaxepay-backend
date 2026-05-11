const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const { Op } = require('sequelize');

const getAllAepsAPISwitch = async (req, res) => {
    try {
        if (![1].includes(req.user.userRole)) {
            return res.failure({ message: 'You are not authorized to get AEPS API switches' });
        }
        const dataToFind = req.body || {};
        let options = {};
        let query = {};

        if (dataToFind && dataToFind.query) {
            query = { ...dataToFind.query };
        }

        if (dataToFind && dataToFind.options !== undefined) {
            options = { ...dataToFind.options };
        }

        const result = await dbService.paginate(model.aepsAPISwitch, query, options);

        return res.success({
            message: 'AEPS API switches retrieved successfully',
            data: result?.data || [],
            total: result?.total || 0,
            paginator: result?.paginator
        });
    } catch (error) {
        console.log('Get AEPS API switch error:', error);
        return res.failure({ message: error.message || 'Internal server error' });
    }
}

const createAepsAPISwitch = async (req, res) => {
    try {
        if (![1].includes(req.user.userRole)) {
            return res.failure({ message: 'You are not authorized to create AEPS API switch' });
        }
        const { name, isActive, companyId } = req.body;
        if (!name) {
            return res.failure({ message: 'Name is required' });
        }

        const dataToCreate = {
            name,
            isActive: isActive || false,
            companyId: companyId || null,
            addedBy: req.user.id,
            updatedBy: req.user.id
        };

        const result = await dbService.createOne(model.aepsAPISwitch, dataToCreate);

        return res.success({
            message: 'AEPS API switch created successfully',
            data: result
        });
    } catch (error) {
        console.log('Create AEPS API switch error:', error);
        return res.failure({ message: error.message || 'Internal server error' });
    }
}

const switchAepsAPI = async (req, res) => {
    try {
        if (![1].includes(req.user.userRole)) {
            return res.failure({ message: 'You are not authorized to switch AEPS API' });
        }

        const { id, companyId } = req.body;
        if (!id) {
            return res.failure({ message: 'API Switch ID is required' });
        }

        const query = {};
        if (companyId) {
            query.companyId = companyId;
        } else {
            query.companyId = null; // Global
        }

        // Deactivate all others for this company/global
        await dbService.update(model.aepsAPISwitch,
            {
                ...query,
                id: { [Op.ne]: id }
            },
            { isActive: false, updatedBy: req.user.id }
        );

        // Activate the chosen one
        await dbService.update(model.aepsAPISwitch,
            { id: id },
            { isActive: true, updatedBy: req.user.id }
        );

        return res.success({
            message: 'AEPS API switched successfully'
        });
    } catch (error) {
        console.log('Switch AEPS API error:', error);
        return res.failure({ message: error.message || 'Internal server error' });
    }
}

const updateAepsAPISwitch = async (req, res) => {
    try {
        if (![1].includes(req.user.userRole)) {
            return res.failure({ message: 'You are not authorized to update AEPS API switch' });
        }
        const { id, ...dataToUpdate } = req.body;
        if (!id) {
            return res.failure({ message: 'ID is required' });
        }

        dataToUpdate.updatedBy = req.user.id;

        const result = await dbService.update(model.aepsAPISwitch, { id }, dataToUpdate);

        return res.success({
            message: 'AEPS API switch updated successfully',
            data: result
        });
    } catch (error) {
        console.log('Update AEPS API switch error:', error);
        return res.failure({ message: error.message || 'Internal server error' });
    }
}

const deleteAepsAPISwitch = async (req, res) => {
    try {
        if (![1].includes(req.user.userRole)) {
            return res.failure({ message: 'You are not authorized to delete AEPS API switch' });
        }
        const { id } = req.body;
        if (!id) {
            return res.failure({ message: 'ID is required' });
        }

        await dbService.deleteMany(model.aepsAPISwitch, { id });

        return res.success({
            message: 'AEPS API switch deleted successfully'
        });
    } catch (error) {
        console.log('Delete AEPS API switch error:', error);
        return res.failure({ message: error.message || 'Internal server error' });
    }
}

module.exports = {
    getAllAepsAPISwitch,
    createAepsAPISwitch,
    switchAepsAPI,
    updateAepsAPISwitch,
    deleteAepsAPISwitch
};
