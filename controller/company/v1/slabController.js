const dbService = require('../../../utils/dbService');
const model = require('../../../models/index');
const { Op } = require('sequelize');

const getSlab = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.companyId ?? req.user?.companyId ?? null;
        
        if (!companyId) {
            return res.failure({ message: 'Company ID is required' });
        }

        const slab = await dbService.findOne(model.slab, { 
            id,
            companyId,
            slabScope: 'private'
        });
        
        if(!slab) return res.failure({ message: 'Slab not found' });
        return res.success({ message: 'Slab fetched successfully', data: slab });
    } catch (error) {
        console.error(error);
        return res.failure({ message: error.message });
    }
};

const createSubSlab = async (req, res) => {
    try {
        const { templateType, slabName, slabType, remark } = req.body;
        const companyId = req.companyId ?? req.user?.companyId ?? null;

        if (!companyId) {
            return res.badRequest({ message: 'Company ID is required' });
        }

        // Validate required fields
        if (!templateType) {
            return res.badRequest({ 
                message: 'templateType is required' 
            });
        }

        // Validate templateType
        if (!['Basic', 'Gold', 'Platinum'].includes(templateType)) {
            return res.badRequest({ 
                message: 'templateType must be one of: Basic, Gold, Platinum' 
            });
        }

        // Get company details
        const company = await dbService.findOne(model.company, { id: companyId });
        if (!company) {
            return res.badRequest({ message: 'Company not found' });
        }

        // Check if subslab with same templateType already exists for this company
        const existingSlab = await dbService.findOne(model.slab, {
            companyId: companyId,
            templateType: templateType,
            slabScope: 'private'
        });

        if (existingSlab) {
            return res.badRequest({ 
                message: `Subslab with template type "${templateType}" already exists for this company` 
            });
        }

        // Create subslab name: CompanyName.TemplateType or use provided name
        const subSlabName = slabName || `${company.companyName}.${templateType}`;

        const dataToCreate = {
            slabName: subSlabName,
            templateType,
            slabType: slabType || 'level',
            slabScope: 'private',
            companyId: companyId,
            remark: remark || null,
            isSignUpB2B: false,
            users: [],
            isActive: true,
            addedBy: req.user.id,
            type: req.user.userType
        };

        // Create the subslab
        const createdSlab = await dbService.createOne(model.slab, dataToCreate);

        if (!createdSlab) {
            return res.failure({ message: 'Failed to create subslab' });
        }

        // Get current user to check reportingTo
        const currentUser = await dbService.findOne(model.user, { 
            id: req.user.id 
        });

        if (!currentUser) {
            return res.failure({ message: 'User not found' });
        }

        // Determine role types based on reportingTo
        let roleTypes = [];
        let roleNames = [];

        if (currentUser.reportingTo !== null && currentUser.reportingTo !== undefined) {
            // Check if reportingTo belongs to the same companyId
            const reportingToUser = await dbService.findOne(model.user, {
                id: currentUser.reportingTo,
                companyId: companyId
            });

            if (reportingToUser) {
                // If reportingTo belongs to companyId: use roles 1, 3, 4, 5 (AD, MD, DI, RE)
                roleTypes = [1, 3, 4, 5];
                roleNames = ['AD', 'MD', 'DI', 'RE'];
            } else {
                // If reportingTo doesn't belong to companyId: use role 5 (RE - Retailer)
                roleTypes = [5];
                roleNames = ['RE'];
            }
        } else {
            // If reportingTo is null: they are retailer, can set commission (role 5)
            roleTypes = [5];
            roleNames = ['RE'];
        }

        // Initialize commission structures
        let operators = await dbService.findAll(
            model.operator,
            {},
            { select: ['id', 'operatorName', 'operatorType'] }
        );

        let cardTypes = await dbService.findAll(
            model.cardType,
            {},
            { select: ['id', 'name'] }
        );

        let paymentInstruments = await dbService.findAll(
            model.paymentInstrument,
            {},
            { select: ['id', 'name', 'isCardType'] }
        );

        let dataToInsert = [];
        let dataToInsertRangeComm = [];
        let dataToInsertRangeCharges = [];
        let dataToInsertPgCommercials = [];

        // Create commission entries for all operators and roles
        operators.forEach((operator) => {
            roleTypes.forEach((roleType, index) => {
                dataToInsert.push({
                    slabId: createdSlab.id,
                    operatorId: operator.id,
                    operatorName: operator.operatorName,
                    operatorType: operator.operatorType,
                    roleType,
                    roleName: roleNames[index],
                    commAmt: 0,
                    commType: 'com',
                    amtType: 'fix',
                    companyId: companyId
                });
            });
        });

        // Create range commission entries
        for (const operator of operators) {
            const ranges = await dbService.findAll(
                model.range,
                { operatorType: operator.operatorType },
                { select: ['id', 'min', 'max'] }
            );
            for (const range of ranges) {
                roleTypes.forEach((roleType, index) => {
                    dataToInsertRangeComm.push({
                        slabId: createdSlab.id,
                        operatorId: operator.id,
                        operatorName: operator.operatorName,
                        operatorType: operator.operatorType,
                        rangeId: range.id,
                        min: range.min,
                        max: range.max,
                        roleType,
                        roleName: roleNames[index],
                        commAmt: 0,
                        commType: 'com',
                        amtType: 'fix',
                        companyId: companyId
                    });
                });
            }
        }

        // Create range charges entries
        for (const operator of operators) {
            const ranges = await dbService.findAll(
                model.range,
                { operatorType: operator.operatorType },
                { select: ['id', 'min', 'max'] }
            );
            for (const range of ranges) {
                roleTypes.forEach((roleType, index) => {
                    dataToInsertRangeCharges.push({
                        slabId: createdSlab.id,
                        operatorId: operator.id,
                        operatorName: operator.operatorName,
                        operatorType: operator.operatorType,
                        rangeId: range.id,
                        min: range.min,
                        max: range.max,
                        roleType,
                        roleName: roleNames[index],
                        commAmt: 0,
                        commType: 'com',
                        amtType: 'fix',
                        companyId: companyId
                    });
                });
            }
        }

        // Create PG commercial entries
        const payInOperators = operators.filter(
            (op) => op.operatorType === 'PayIn'
        );

        for (const operator of payInOperators) {
            for (const roleType of roleTypes) {
                const roleIndex = roleTypes.indexOf(roleType);
                const roleNameValue = roleNames[roleIndex] || 'RE';

                for (const paymentInstrument of paymentInstruments) {
                    if (paymentInstrument.isCardType) {
                        for (const cardType of cardTypes) {
                            dataToInsertPgCommercials.push({
                                slabId: createdSlab.id,
                                operatorId: operator.id,
                                operatorName: operator.operatorName,
                                operatorType: operator.operatorType,
                                roleType,
                                roleName: roleNameValue,
                                commAmt: 0,
                                commType: 'com',
                                amtType: 'fix',
                                paymentInstrumentId: paymentInstrument.id,
                                paymentInstrumentName: paymentInstrument.name,
                                cardTypeId: cardType.id,
                                cardTypeName: cardType.name,
                                companyId: companyId
                            });
                        }
                    } else {
                        dataToInsertPgCommercials.push({
                            slabId: createdSlab.id,
                            operatorId: operator.id,
                            operatorName: operator.operatorName,
                            operatorType: operator.operatorType,
                            roleType,
                            roleName: roleNameValue,
                            commAmt: 0,
                            commType: 'com',
                            amtType: 'fix',
                            paymentInstrumentId: paymentInstrument.id,
                            paymentInstrumentName: paymentInstrument.name,
                            cardTypeId: null,
                            cardTypeName: null,
                            companyId: companyId
                        });
                    }
                }
            }
        }

        // Insert all commission data
        await Promise.all([
            dbService.createMany(model.commSlab, dataToInsert),
            dbService.createMany(model.rangeCommission, dataToInsertRangeComm),
            dbService.createMany(model.rangeCharges, dataToInsertRangeCharges)
        ]);

        if (dataToInsertPgCommercials.length > 0) {
            await dbService.createMany(
                model.pgCommercials,
                dataToInsertPgCommercials
            );
        }

        return res.success({
            message: 'Subslab created successfully',
            data: createdSlab
        });
    } catch (error) {
        console.error(error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.validationError({ message: error.errors[0].message });
        } else {
            return res.internalServerError({ message: error.message });
        }
    }
};

const getAllSubSlabs = async (req, res) => {
    try {
        const companyId = req.companyId ?? req.user?.companyId ?? null;

        if (!companyId) {
            return res.badRequest({ message: 'Company ID is required' });
        }

        const subSlabs = await dbService.findAll(
            model.slab,
            {
                companyId: companyId,
                slabScope: 'private',
                isActive: true
            },
            {
                select: ['id', 'slabName', 'templateType', 'slabType', 'remark', 'createdAt', 'updatedAt'],
                order: [['templateType', 'ASC'], ['slabName', 'ASC']]
            }
        );

        if (!subSlabs || subSlabs.length === 0) {
            return res.success({
                message: 'No subslabs found',
                data: []
            });
        }

        return res.success({
            message: 'Subslabs retrieved successfully',
            data: subSlabs
        });
    } catch (error) {
        console.error(error);
        return res.internalServerError({ message: error.message });
    }
};

const updateSubSlab = async (req, res) => {
    try {
        const { id } = req.params;
        const { slabName, templateType, slabType, slabScope, remark } = req.body;
        const companyId = req.companyId ?? req.user?.companyId ?? null;

        if (!companyId) {
            return res.badRequest({ message: 'Company ID is required' });
        }

        if (!id) {
            return res.failure({ message: 'Subslab id is required' });
        }

        // At least one field must be provided for update
        if (!slabName && !templateType && !slabType && !slabScope && !remark) {
            return res.failure({ 
                message: 'At least one field (slabName, templateType, slabType, slabScope, remark) must be provided' 
            });
        }

        // Find the subslab
        const slab = await dbService.findOne(model.slab, {
            id,
            companyId,
            slabScope: 'private'
        });

        if (!slab) {
            return res.failure({ message: 'Subslab not found' });
        }

        // Build update data
        const updateData = {
            updatedBy: req.user.id
        };

        if (slabName !== undefined) {
            if (!slabName || slabName.trim() === '') {
                return res.failure({ message: 'slabName cannot be empty' });
            }
            updateData.slabName = slabName.trim();
        }

        if (templateType !== undefined) {
            if (!['Basic', 'Gold', 'Platinum'].includes(templateType)) {
                return res.failure({ message: 'templateType must be one of: Basic, Gold, Platinum' });
            }
            updateData.templateType = templateType;
        }

        if (slabType !== undefined) {
            if (!['level', 'channel'].includes(slabType)) {
                return res.failure({ message: 'slabType must be either "level" or "channel"' });
            }
            updateData.slabType = slabType;
        }

        if (slabScope !== undefined) {
            if (!['global', 'private'].includes(slabScope)) {
                return res.failure({ message: 'slabScope must be either "global" or "private"' });
            }
            updateData.slabScope = slabScope;
        }

        if (remark !== undefined) {
            updateData.remark = remark;
        }

        // Update the subslab
        const updatedSlab = await dbService.update(
            model.slab,
            { id },
            updateData
        );

        if (!updatedSlab || updatedSlab.length === 0) {
            return res.failure({ message: 'Failed to update subslab' });
        }

        return res.success({
            message: 'Subslab updated successfully',
            data: updatedSlab[0]
        });
    } catch (error) {
        console.log(error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.failure({ message: error.errors[0].message });
        } else if (error.name === 'SequelizeValidationError') {
            return res.failure({ message: error.errors[0].message });
        } else {
            return res.failure({ message: error.message });
        }
    }
};

module.exports = {
    getSlab,
    createSubSlab,
    getAllSubSlabs,
    updateSubSlab
};