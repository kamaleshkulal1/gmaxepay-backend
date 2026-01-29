const model = require('../../../models');
const dbService = require('../../../utils/dbService');

const getAllCustomerBanks = async (req, res) => {
    try {
        const user = req.user;
        
        // Get all customer banks for the user
        const customerBanks = await dbService.findAll(
            model.customerBank,
            {
                refId: user.id,
                companyId: user.companyId,
                isActive: true
            },
            {
                order: [['isPrimary', 'DESC'], ['createdAt', 'DESC']]
            }
        );
        
        return res.success({
            message: 'Customer banks retrieved successfully',
            data: {
                banks: customerBanks,
                total: customerBanks.length,
                primaryBank: customerBanks.find(bank => bank.isPrimary === true) || null
            }
        });
        
    } catch (error) {
        console.log('Get customer banks error:', error);
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

const getPrimaryCustomerBank = async (req, res) => {
    try {
        const user = req.user;
        
        // Get primary customer bank
        const primaryBank = await dbService.findOne(
            model.customerBank,
            {
                refId: user.id,
                companyId: user.companyId,
                isActive: true,
                isPrimary: true
            }
        );
        
        if (!primaryBank) {
            return res.notFound({ message: 'Primary bank account not found' });
        }
        
        return res.success({
            message: 'Primary bank account retrieved successfully',
            data: primaryBank
        });
        
    } catch (error) {
        console.log('Get primary bank error:', error);
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

const getCustomerBankById = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        
        if (!id) {
            return res.validationError({ message: 'Bank ID is required' });
        }
        
        const customerBank = await dbService.findOne(
            model.customerBank,
            {
                id: id,
                refId: user.id,
                companyId: user.companyId,
                isActive: true
            }
        );
        
        if (!customerBank) {
            return res.notFound({ message: 'Customer bank not found' });
        }
        
        return res.success({
            message: 'Customer bank retrieved successfully',
            data: customerBank
        });
        
    } catch (error) {
        console.log('Get customer bank by ID error:', error);
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

module.exports = {
    getAllCustomerBanks,
    getPrimaryCustomerBank,
    getCustomerBankById
};

