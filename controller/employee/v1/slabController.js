const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op, Sequelize } = require('sequelize');
const { generateTransactionID } = require('../../../utils/transactionID');

const processData = (data) => {
    const groupedData = {};

    data.forEach((item) => {
        const key = `${item.slabId}-${item.operatorId}`;

        const operatorMargin = item.operator || {};

        if (!groupedData[key]) {
            groupedData[key] = {
                slabId: item.slabId,
                operatorId: item.operatorId,
                operatorName: item.operatorName,
                operatorType: item.operatorType,
                marginCommAmt: operatorMargin.comm,
                marginCommType: operatorMargin.commType,
                marginAmtType: operatorMargin.amtType,
                instruments: []
            };
        }

        let instrument = groupedData[key].instruments.find(
            (inst) =>
                inst.paymentInstrument === item.paymentInstrumentName &&
                inst.cardType === item.cardTypeName
        );

        if (!instrument) {
            instrument = {
                paymentInstrument: item.paymentInstrumentName,
                cardType: item.cardTypeName,
                roles: []
            };
            groupedData[key].instruments.push(instrument);
        }

        instrument.roles.push({
            id: item.id,
            roleType: item.roleType,
            roleName: item.roleName,
            commType: item.commType,
            commAmt: item.commAmt,
            amtType: item.amtType,
            updatedAt: item.updatedAt
        });
    });

    return Object.values(groupedData);
};

const findAllslabComm = async (req, res) => {
    try {
        let permissions = req.permission;
        let hasPermission = permissions.some(
            (permission) =>
                permission.dataValues.permissionId === 1 &&
                permission.dataValues.read === true
        );

        if (!hasPermission) {
            return res.failure({ message: `User doesn't have Permission!` });
        }

        if (req.user.userRole !== 6 && req.user.companyId !== companyId) {
            return res.failure({ message: 'You are not authorized to create slab' });
        }

        let dataToFind = req.body;
        const companyId = req.companyId ?? req.user?.companyId ?? null;
        let options = { order: [['id', 'ASC']] };
        let query = {};
        let foundUser;

        if (dataToFind && dataToFind.query) {
            query = dataToFind.query;
        }
        const filteredSlabs = await dbService.findAll(
            model.slab,
            {
                addedBy: 1,
                id: req.params.id,
                isActive: true
            },
            {
                attributes: ['id']
            }
        );

        if (!filteredSlabs || filteredSlabs.length === 0) {
            return res.failure({ message: 'No slabs found' });
        }

        const slabIds = filteredSlabs.map((s) => s.id || s.dataValues?.id).filter(Boolean);

        if (!slabIds.length) {
            return res.failure({ message: 'No slabs found' });
        }

        query.slabId = { [Op.in]: slabIds };

        if (dataToFind && dataToFind.isCountOnly) {
            foundUser = await dbService.count(model.pgCommercials, query);
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
                        Sequelize.where(Sequelize.cast(Sequelize.col(key), 'varchar'), {
                            [Op.iLike]: `%${dataToFind.customSearch[key]}%`
                        })
                    );
                } else {
                    orConditions.push({
                        [key]: {
                            [Op.iLike]: `%${dataToFind.customSearch[key]}%`
                        }
                    });
                }
            });

            if (orConditions.length > 0) {
                query = {
                    ...query,
                    [Op.or]: orConditions
                };
            }
        }

        query.roleType = { [Op.in]: [1, 2] };

        foundUser = await dbService.findAll(model.commSlab, query, {
            ...options,
            include: [
                {
                    model: model.operator,
                    as: 'operator',
                    attributes: ['comm', 'commType', 'amtType']
                }
            ]
        });

        if (!foundUser || foundUser.length === 0) {
            return res.failure({ message: 'No slabs Commissions found' });
        }

        const formattedResponse = processData(foundUser);

        return res.status(200).send({
            status: 'SUCCESS',
            message: 'Your request is successfully executed',
            data: formattedResponse,
            total: formattedResponse.length
        });
    } catch (error) {
        console.log(error);
        return res.internalServerError({ data: error.message });
    }
};

const updateSlab = async (req, res) => {
    try {
        let permissions = req.permission;
        let hasPermission = permissions.some(
            (permission) =>
                permission.dataValues.permissionId === 1 &&
                permission.dataValues.write === true
        );

        if (!hasPermission) {
            return res.failure({ message: `User doesn't have Permission!` });
        }
        const slabId = req.params.id;
        const { slabName, schemaMode, schemaType, views, subscriptionAmount } = req.body;

        if (!slabId) {
            return res.failure({ message: 'slabId is required' });
        }

        if (!slabName && !schemaMode && !schemaType && views === undefined && subscriptionAmount === undefined) {
            return res.failure({ message: 'At least one field (slabName, schemaMode, schemaType, views, subscriptionAmount) must be provided' });
        }

        const companyId = req.companyId ?? req.user?.companyId ?? null;

        const slab = await dbService.findOne(model.slab, {
            id: slabId,
            ...(companyId !== null && companyId !== undefined ? { companyId } : {})
        });

        if (!slab) {
            return res.failure({ message: 'Slab not found' });
        }

        const finalSchemaMode = schemaMode !== undefined ? schemaMode : slab.schemaMode;
        const finalSchemaType = schemaType !== undefined ? schemaType : slab.schemaType;

        const updateData = {
            updatedBy: 1
        };

        if (slabName !== undefined) {
            if (!slabName || slabName.trim() === '') {
                return res.failure({ message: 'slabName cannot be empty' });
            }
            updateData.slabName = slabName.trim();

            const existingSlab = await dbService.findOne(model.slab, {
                slabName: slabName.trim(),
                companyId: companyId,
                id: { [Op.ne]: slabId }
            });

            if (existingSlab) {
                return res.failure({
                    message: `Slab with name "${slabName.trim()}" already exists for this company`
                });
            }
        }

        if (schemaMode !== undefined) {
            if (!['global', 'private'].includes(schemaMode)) {
                return res.failure({ message: 'schemaMode must be either "global" or "private"' });
            }
            updateData.schemaMode = schemaMode;
        }

        if (schemaType !== undefined) {
            if (!['free', 'premium'].includes(schemaType)) {
                return res.failure({ message: 'schemaType must be either "free" or "premium"' });
            }
            updateData.schemaType = schemaType;
        }

        if (views !== undefined) {
            if (views === null) {
                if (finalSchemaMode === 'private') {
                    return res.failure({
                        message: 'views cannot be empty when schemaMode is "private". Please provide at least one user ID.'
                    });
                }
                updateData.views = [];
            } else if (!Array.isArray(views)) {
                return res.failure({
                    message: 'views must be an array of user IDs'
                });
            } else {
                const validatedViews = views.filter((userId) => {
                    const id = Number(userId);
                    return !isNaN(id) && id > 0;
                }).map((userId) => Number(userId));

                if (finalSchemaMode === 'private' && validatedViews.length === 0) {
                    return res.failure({
                        message: 'views array must contain at least one valid user ID when schemaMode is "private"'
                    });
                }
                updateData.views = validatedViews;
            }
        } else if (schemaMode !== undefined && finalSchemaMode === 'private') {
            const currentViews = slab.views || [];
            if (!Array.isArray(currentViews) || currentViews.length === 0) {
                return res.failure({
                    message: 'views is required when schemaMode is "private". Please provide at least one user ID in the views array.'
                });
            }
        }

        if (subscriptionAmount !== undefined) {
            if (subscriptionAmount === null) {
                if (finalSchemaType === 'premium') {
                    return res.failure({
                        message: 'subscriptionAmount is required when schemaType is "premium". Please provide a valid amount.'
                    });
                }
                updateData.subscriptionAmount = 0;
            } else {
                const amount = Number(subscriptionAmount);
                if (isNaN(amount) || amount < 0) {
                    return res.failure({
                        message: 'subscriptionAmount must be a valid non-negative number'
                    });
                }
                if (finalSchemaType === 'premium' && amount <= 0) {
                    return res.failure({
                        message: 'subscriptionAmount must be greater than 0 when schemaType is "premium"'
                    });
                }
                updateData.subscriptionAmount = amount;
            }
        } else if (schemaType !== undefined && finalSchemaType === 'premium') {
            const currentAmount = slab.subscriptionAmount || 0;
            if (currentAmount <= 0) {
                return res.failure({
                    message: 'subscriptionAmount is required when schemaType is "premium". Please provide a valid amount greater than 0.'
                });
            }
        }

        const updatedSlab = await dbService.update(
            model.slab,
            { id: slabId },
            updateData
        );

        if (!updatedSlab || updatedSlab.length === 0) {
            return res.failure({ message: 'Failed to update slab' });
        }

        return res.success({
            message: 'Slab updated successfully',
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

const updateSlabComm = async (req, res) => {
    try {
        const permissions = req.permission || [];
        const hasPermission = permissions.some(
            (permission) =>
                permission.dataValues.permissionId === 1 &&
                permission.dataValues.write === true
        );

        if (!hasPermission) {
            return res.failure({ message: `User doesn't have Permission!` });
        }


        if (req.user.userRole !== 6 && req.user.companyId !== companyId) {
            return res.failure({ message: 'You are not authorized to create slab' });
        }

        const { commAmt, commType, amtType } = req.body;
        const id = req.params.id;
        const companyId = req.user.companyId;

        if (req.user.userRole !== 6 && req.user.companyId !== companyId) {
            return res.failure({ message: 'You are not authorized to update slab commission' });
        }
        if (commAmt === undefined && commType === undefined && amtType === undefined) {
            return res.failure({ message: 'At least one of commAmt, commType, or amtType must be provided' });
        }

        if (commType !== undefined && !['com', 'sur'].includes(commType)) {
            return res.failure({ message: 'commType must be either "com" or "sur"' });
        }
        if (amtType !== undefined && !['fix', 'per'].includes(amtType)) {
            return res.failure({ message: 'amtType must be either "fix" or "per"' });
        }

        if (commAmt !== undefined && (isNaN(commAmt) || commAmt < 0)) {
            return res.failure({ message: 'commAmt must be a valid non-negative number' });
        }
        ;

        const slabComm = await dbService.findOne(model.commSlab, {
            id
        });

        if (!slabComm) {
            return res.failure({ message: 'Slab commission entry not found' });
        }

        const updateData = {
            updatedBy: 1
        };

        if (commAmt !== undefined) {
            updateData.commAmt = parseFloat(commAmt);
        }

        if (commType !== undefined) {
            updateData.commType = commType;
        }
        if (amtType !== undefined) {
            updateData.amtType = amtType;
        }

        const updatedSlabComm = await dbService.update(
            model.commSlab,
            { id },
            updateData
        );

        if (!updatedSlabComm || updatedSlabComm.length === 0) {
            return res.failure({ message: 'Failed to update slab commission' });
        }

        return res.success({
            message: 'Slab commission updated successfully',
            data: updatedSlabComm[0]
        });
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.failure({ message: error.errors[0].message });
        } else if (error.name === 'SequelizeValidationError') {
            return res.failure({ message: error.errors[0].message });
        } else {
            return res.failure({ message: error.message });
        }
    }
};

const createSlab = async (req, res) => {
    try {
        const { slabName, schemaMode, schemaType, views, subscriptionAmount } = req.body;

        if (req.user.userRole !== 6 && req.user.companyId !== 1) {
            return res.failure({ message: 'You are not authorized to create slab' });
        }
        if (!slabName) {
            return res.failure({
                message: 'slabName is required'
            });
        }

        if (!schemaMode) {
            return res.failure({
                message: 'schemaMode is required'
            });
        }

        if (!schemaType) {
            return res.failure({
                message: 'schemaType is required'
            });
        }

        if (!['global', 'private'].includes(schemaMode)) {
            return res.failure({
                message: 'schemaMode must be either "global" or "private"'
            });
        }

        if (!['free', 'premium'].includes(schemaType)) {
            return res.failure({
                message: 'schemaType must be either "free" or "premium"'
            });
        }

        let validatedViews = [];
        if (schemaMode === 'private') {
            if (views === undefined || views === null) {
                return res.failure({
                    message: 'views is required when schemaMode is "private". Please specify which users can view this slab.'
                });
            }
            if (!Array.isArray(views)) {
                return res.failure({
                    message: 'views must be an array of user IDs'
                });
            }
            validatedViews = views.filter((userId) => {
                const id = Number(userId);
                return !isNaN(id) && id > 0;
            }).map((userId) => Number(userId));

            if (validatedViews.length === 0) {
                return res.failure({
                    message: 'views array must contain at least one valid user ID when schemaMode is "private"'
                });
            }
        } else {
            if (views !== undefined && views !== null) {
                if (!Array.isArray(views)) {
                    return res.failure({
                        message: 'views must be an array of user IDs'
                    });
                }
                validatedViews = views.filter((userId) => {
                    const id = Number(userId);
                    return !isNaN(id) && id > 0;
                }).map((userId) => Number(userId));
            }
        }

        let validatedSubscriptionAmount = 0;
        if (schemaType === 'premium') {
            if (subscriptionAmount === undefined || subscriptionAmount === null) {
                return res.failure({
                    message: 'subscriptionAmount is required when schemaType is "premium"'
                });
            }
            const amount = Number(subscriptionAmount);
            if (isNaN(amount) || amount < 0) {
                return res.failure({
                    message: 'subscriptionAmount must be a valid non-negative number when schemaType is "premium"'
                });
            }
            validatedSubscriptionAmount = amount;
        } else {
            if (subscriptionAmount !== undefined && subscriptionAmount !== null) {
                const amount = Number(subscriptionAmount);
                if (isNaN(amount) || amount < 0) {
                    return res.failure({
                        message: 'subscriptionAmount must be a valid non-negative number'
                    });
                }
                validatedSubscriptionAmount = amount;
            }
        }

        const companyId = req.companyId ?? req.user?.companyId ?? null;

        if (!companyId) {
            return res.failure({
                message: 'Company ID is required. User must belong to a company.'
            });
        }

        const existingSlab = await dbService.findOne(model.slab, {
            slabName,
            companyId: companyId
        });

        if (existingSlab) {
            return res.failure({
                message: `Slab with name "${slabName}" already exists for this company`
            });
        }

        const dataToCreate = {
            slabName: slabName,
            schemaMode,
            schemaType,
            companyId: companyId,
            remark: null,
            isSignUpB2B: false,
            users: [],
            views: validatedViews,
            subscriptionAmount: validatedSubscriptionAmount,
            isActive: true,
            addedBy: 1,
            addedByRole: 1,
            type: 1
        };

        const createdSlab = await dbService.createOne(model.slab, dataToCreate);

        if (!createdSlab) {
            return res.failure({ message: 'Failed to create slab' });
        }

        const slabId = createdSlab.id;

        const operators = await dbService.findAll(
            model.operator,
            { inSlab: true },
            { select: ['id', 'operatorName', 'operatorType'] }
        );

        if (operators && operators.length > 0) {
            const roleTypes = [1, 2];
            const roleNames = ['AD', 'WU'];

            const defaultCommissions = operators.flatMap((op) =>
                roleTypes.map((roleType, index) => ({
                    slabId: slabId,
                    companyId: companyId,
                    operatorId: op.id,
                    operatorName: op.operatorName,
                    operatorType: op.operatorType,
                    roleType,
                    roleName: roleNames[index] || 'RE',
                    commAmt: 0,
                    commType: 'com',
                    amtType: 'fix',
                    paymentMode: null,
                    addedBy: 1,
                    updatedBy: 1
                }))
            );

            if (defaultCommissions.length > 0) {
                await dbService.createMany(model.commSlab, defaultCommissions);
            }
        }

        return res.success({
            message: 'Slab created successfully',
            data: createdSlab
        });
    } catch (error) {
        console.log(error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.validationError({ message: error.errors[0].message });
        } else {
            return res.internalServerError({ message: error.message });
        }
    }
};

const getAllSlabs = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        if (!companyId) {
            return res.failure({ message: 'Company ID is required' });
        }

        if (req.user.userRole !== 6 && req.user.companyId !== 1) {
            return res.failure({ message: 'You are not authorized to get all slabs' });
        }

        const dataToFind = req.body || {};
        let options = {};
        let query = {
            companyId: companyId,
            isActive: true
        };

        if (dataToFind && dataToFind.query) {
            query = { ...query, ...dataToFind.query };
        }

        if (dataToFind && dataToFind.options !== undefined) {
            options = { ...dataToFind.options };
        }

        if (dataToFind?.customSearch && typeof dataToFind.customSearch === 'object') {
            const keys = Object.keys(dataToFind.customSearch);
            const searchOrConditions = [];

            for (const key of keys) {
                const value = dataToFind.customSearch[key];
                if (value === undefined || value === null || String(value).trim() === '') continue;

                if (key === 'slabName') {
                    searchOrConditions.push({
                        slabName: {
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

        const allSlabs = await dbService.findAll(model.slab, query, {
            attributes: ['users', 'views', 'schemaMode']
        });

        const allUserIds = new Set();
        const allViewUserIds = new Set();

        if (allSlabs && allSlabs.length > 0) {
            allSlabs.forEach(slab => {
                const slabData = slab.toJSON ? slab.toJSON() : slab;
                const users = slabData.users || [];
                const views = slabData.views || [];

                if (Array.isArray(users) && users.length > 0) {
                    users.forEach(userId => {
                        if (userId) {
                            allUserIds.add(userId);
                        }
                    });
                }

                if (slabData.schemaMode === 'private' && Array.isArray(views) && views.length > 0) {
                    views.forEach(userId => {
                        if (userId) {
                            allViewUserIds.add(userId);
                        }
                    });
                }
            });
        }

        const totalUsers = allUserIds.size;

        let viewUsersMap = {};
        if (allViewUserIds.size > 0) {
            const viewUserIdsArray = Array.from(allViewUserIds);

            const viewUsers = await dbService.findAll(model.user, {
                id: { [Op.in]: viewUserIdsArray },
                isActive: true
            }, {
                attributes: ['id', 'name', 'companyId']
            });

            const companyIds = new Set();
            if (viewUsers && viewUsers.length > 0) {
                viewUsers.forEach(user => {
                    const userData = user.toJSON ? user.toJSON() : user;
                    if (userData.companyId) {
                        companyIds.add(userData.companyId);
                    }
                });
            }

            let companiesMap = {};
            if (companyIds.size > 0) {
                const companies = await dbService.findAll(model.company, {
                    id: { [Op.in]: Array.from(companyIds) }
                }, {
                    attributes: ['id', 'companyName']
                });

                if (companies && companies.length > 0) {
                    companies.forEach(company => {
                        const companyData = company.toJSON ? company.toJSON() : company;
                        companiesMap[companyData.id] = companyData.companyName || null;
                    });
                }
            }

            if (viewUsers && viewUsers.length > 0) {
                viewUsers.forEach(user => {
                    const userData = user.toJSON ? user.toJSON() : user;
                    viewUsersMap[userData.id] = {
                        userId: userData.id,
                        userName: userData.name || null,
                        companyId: userData.companyId || null,
                        companyName: userData.companyId ? (companiesMap[userData.companyId] || null) : null
                    };
                });
            }
        }

        const result = await dbService.paginate(model.slab, query, {
            ...options,
            select: ['id', 'slabName', 'schemaMode', 'schemaType', 'subscriptionAmount', 'isActive', 'remark', 'users', 'views', 'createdAt', 'updatedAt']
        });

        const processedData = (result?.data || []).map(slab => {
            const slabData = slab.toJSON ? slab.toJSON() : slab;
            const users = slabData.users || [];
            const views = slabData.views || [];
            const totalUsersInSlab = Array.isArray(users) ? users.filter(id => id).length : 0;

            const { users: _, views: __, ...rest } = slabData;

            const responseData = {
                ...rest,
                totalUsers: totalUsersInSlab
            };

            if (slabData.schemaMode === 'private') {
                const viewDetails = [];
                if (Array.isArray(views) && views.length > 0) {
                    views.forEach(userId => {
                        if (userId && viewUsersMap[userId]) {
                            viewDetails.push(viewUsersMap[userId]);
                        }
                    });
                }
                responseData.totalViews = viewDetails.length;
                responseData.viewDetails = viewDetails;
            } else {
                responseData.totalViews = 0;
                responseData.viewDetails = [];
            }

            return responseData;
        });

        return res.status(200).send({
            status: 'SUCCESS',
            message: 'Slabs retrieved successfully',
            data: processedData,
            total: result?.total || 0,
            paginator: result?.paginator || {
                page: options.page || 1,
                paginate: options.paginate || 10,
                totalPages: 0
            }
        });
    } catch (error) {
        console.log(error);
        return res.status(500).send({
            status: 'FAILURE',
            message: error.message || 'Internal server error'
        });
    }
};

const getAllCompanySlabList = async (req, res) => {
    try {
        const userId = req.params.id;

        if (!userId) {
            return res.failure({ message: 'User ID is required' });
        }

        const user = await dbService.findOne(model.user, {
            id: userId,
            isActive: true
        });

        if (!user) {
            return res.failure({ message: 'User not found' });
        }

        const companyId = user.companyId;
        if (!companyId) {
            return res.failure({ message: 'User does not belong to a company' });
        }

        const allSlabs = await dbService.findAll(model.slab, {
            isActive: true,
            addedBy: 1
        }, {
            attributes: ['id', 'slabName', 'schemaMode', 'views', 'subscriptionAmount']
        });

        if (!allSlabs || allSlabs.length === 0) {
            return res.success({
                message: 'No slabs found',
                data: [],
                total: 0
            });
        }

        const visibleSlabs = allSlabs.filter(slab => {
            const slabData = slab.toJSON ? slab.toJSON() : slab;

            if (slabData.schemaMode === 'global') {
                return true;
            }

            if (slabData.schemaMode === 'private') {
                const views = slabData.views || [];
                return Array.isArray(views) && views.includes(Number(userId));
            }

            return false;
        });

        const userIdNum = Number(userId);

        const userSubscriptions = await dbService.findAll(model.subscription, {
            userId: userIdNum,
            companyId: companyId,
            status: 'SUCCESS',
            isActive: true
        }, {
            attributes: ['slabId']
        });

        const subscribedSlabIds = new Set();
        if (userSubscriptions && userSubscriptions.length > 0) {
            userSubscriptions.forEach(sub => {
                const subData = sub.toJSON ? sub.toJSON() : sub;
                if (subData.slabId) {
                    subscribedSlabIds.add(subData.slabId);
                }
            });
        }

        const slabNames = visibleSlabs.map(slab => {
            const slabData = slab.toJSON ? slab.toJSON() : slab;
            const subscriptionAmount = slabData.subscriptionAmount || 0;
            const isSubscribed = subscribedSlabIds.has(slabData.id);

            return {
                id: slabData.id,
                slabName: slabData.slabName,
                slabAmount: subscriptionAmount === 0 ? 'free' : subscriptionAmount,
                isSubscribed: isSubscribed
            };
        });

        return res.success({
            message: 'Company slab list retrieved successfully',
            data: slabNames,
            total: slabNames.length
        });
    } catch (error) {
        console.error('Get all company slab list error', error);
        return res.internalServerError({ message: error.message });
    }
};

const assignSlabToCompany = async (req, res) => {
    try {
        const { slabId, companyId } = req.body;

        if (req.user.companyId !== 1 && req.user.userRole !== 6) {
            return res.failure({ message: 'You are not authorized to assign this slab to this company' });
        }

        if (!slabId) {
            return res.failure({ message: 'slabId is required' });
        }

        if (!companyId) {
            return res.failure({ message: 'companyId is required' });
        }

        const slab = await dbService.findOne(model.slab, {
            id: slabId,
            isActive: true
        });

        if (!slab) {
            return res.failure({ message: 'Slab not found' });
        }

        const company = await dbService.findOne(model.company, { id: companyId });
        if (!company) {
            return res.failure({ message: 'Company not found' });
        }

        const companyAdmin = await dbService.findOne(model.user, {
            companyId: companyId,
            userRole: 2,
            isActive: true
        });

        if (!companyAdmin) {
            return res.failure({ message: 'Company admin not found' });
        }

        const previousSlabId = companyAdmin.slabId;
        const isSlabAssigned = Number(previousSlabId) === Number(slabId);
        const slabUsers = slab.users || [];
        const isUserInSlab = Array.isArray(slabUsers) && slabUsers.includes(companyAdmin.id);
        const slabViews = slab.views || [];
        const isUserInViews = Array.isArray(slabViews) && slabViews.includes(companyAdmin.id);

        if (!isSlabAssigned && previousSlabId) {
            const previousSlab = await dbService.findOne(model.slab, { id: previousSlabId });
            if (previousSlab && Array.isArray(previousSlab.users) && previousSlab.users.length > 0) {
                const filteredUsers = previousSlab.users.filter((userId) => userId !== companyAdmin.id);
                if (filteredUsers.length !== previousSlab.users.length) {
                    await dbService.update(
                        model.slab,
                        { id: previousSlabId },
                        { users: filteredUsers }
                    );
                }
            }
            if (previousSlab && Array.isArray(previousSlab.views) && previousSlab.views.length > 0) {
                const filteredViews = previousSlab.views.filter((userId) => userId !== companyAdmin.id);
                if (filteredViews.length !== previousSlab.views.length) {
                    await dbService.update(
                        model.slab,
                        { id: previousSlabId },
                        { views: filteredViews }
                    );
                }
            }
        }

        if (!isSlabAssigned) {
            await dbService.update(
                model.user,
                { id: companyAdmin.id },
                { slabId: slabId }
            );
        }

        if (!isUserInSlab) {
            const updatedUsers = Array.isArray(slabUsers) ? [...slabUsers, companyAdmin.id] : [companyAdmin.id];
            await dbService.update(
                model.slab,
                { id: slabId },
                { users: updatedUsers }
            );
        }

        if (!isUserInViews) {
            const updatedViews = Array.isArray(slabViews) ? [...slabViews, companyAdmin.id] : [companyAdmin.id];
            await dbService.update(
                model.slab,
                { id: slabId },
                { views: updatedViews }
            );
        }

        const originalCompanyId = slab.companyId;

        if (originalCompanyId !== companyId) {
            const existingCommissions = await dbService.findAll(model.commSlab, {
                slabId: slabId,
                companyId: originalCompanyId
            });

            if (existingCommissions && existingCommissions.length > 0) {
                const existingForNewCompany = await dbService.findAll(model.commSlab, {
                    slabId: slabId,
                    companyId: companyId
                });

                if (!existingForNewCompany || existingForNewCompany.length === 0) {
                    const commissionsToCreate = existingCommissions.map((comm) => {
                        const commData = comm.toJSON ? comm.toJSON() : comm;
                        return {
                            slabId: slabId,
                            companyId: companyId,
                            operatorId: commData.operatorId,
                            operatorName: commData.operatorName,
                            operatorType: commData.operatorType,
                            roleType: commData.roleType,
                            roleName: commData.roleName,
                            commAmt: commData.commAmt || 0,
                            commType: commData.commType || 'com',
                            amtType: commData.amtType || 'fix',
                            paymentMode: commData.paymentMode || null,
                            addedBy: 1,
                            updatedBy: 1
                        };
                    });

                    await dbService.createMany(model.commSlab, commissionsToCreate);
                }
            }
        }

        const companyCommissions = await dbService.findAll(model.commSlab, {
            slabId: slabId,
            companyId: companyId
        });

        if (!companyCommissions || companyCommissions.length === 0) {
            const operators = await dbService.findAll(
                model.operator,
                { inSlab: true },
                { select: ['id', 'operatorName', 'operatorType'] }
            );

            if (operators && operators.length > 0) {
                const roleTypes = [1, 2];
                const roleNames = ['AD', 'WU'];

                const defaultCommissions = operators.flatMap((op) =>
                    roleTypes.map((roleType, index) => ({
                        slabId: slabId,
                        companyId: companyId,
                        operatorId: op.id,
                        operatorName: op.operatorName,
                        operatorType: op.operatorType,
                        roleType,
                        roleName: roleNames[index] || 'RE',
                        commAmt: 0,
                        commType: 'com',
                        amtType: 'fix',
                        paymentMode: null,
                        addedBy: 1,
                        updatedBy: 1
                    }))
                );

                if (defaultCommissions.length > 0) {
                    await dbService.createMany(model.commSlab, defaultCommissions);
                }
            }
        }

        if (!isSlabAssigned) {
            const existingSubscription = await dbService.findOne(model.subscription, {
                slabId: slabId,
                userId: companyAdmin.id,
                companyId: companyId
            });

            if (!existingSubscription) {
                const subscriptionAmount = parseFloat(slab.subscriptionAmount || 0);

                if (subscriptionAmount > 0) {
                    let requesterWallet = await dbService.findOne(model.wallet, {
                        refId: 1,
                        companyId: req.user.companyId
                    });

                    if (!requesterWallet) {
                        requesterWallet = await dbService.createOne(model.wallet, {
                            refId: 1,
                            companyId: req.user.companyId,
                            roleType: 1,
                            mainWallet: 0,
                            apes1Wallet: 0,
                            apes2Wallet: 0,
                            addedBy: 1,
                            updatedBy: 1
                        });
                    }

                    const openingBalance = parseFloat(requesterWallet.mainWallet || 0);

                    if (openingBalance < subscriptionAmount) {
                        return res.failure({
                            message: `Insufficient wallet balance. Required: ${subscriptionAmount}, Available: ${openingBalance}`
                        });
                    }

                    const closingBalance = parseFloat((openingBalance - subscriptionAmount).toFixed(2));

                    const requesterCompany = await dbService.findOne(model.company, { id: req.user.companyId });
                    const transactionID = generateTransactionID(requesterCompany?.companyName || 'SYSTEM');

                    await dbService.update(
                        model.wallet,
                        { refId: 1, companyId: 1 },
                        { mainWallet: closingBalance, updatedBy: 1 }
                    );

                    await dbService.createOne(model.walletHistory, {
                        refId: 1,
                        companyId: req.user.companyId,
                        walletType: 'mainWallet',
                        amount: subscriptionAmount,
                        debit: subscriptionAmount,
                        credit: 0,
                        openingAmt: openingBalance,
                        closingAmt: closingBalance,
                        transactionId: transactionID,
                        paymentStatus: 'SUCCESS',
                        remark: `Slab subscription payment - ${slab.slabName || `Slab ID: ${slabId}`}`,
                        addedBy: 1,
                        updatedBy: 1
                    });
                }

                await dbService.createOne(model.subscription, {
                    slabId: slabId,
                    userId: companyAdmin.id,
                    companyId: companyId,
                    status: 'SUCCESS',
                    addedBy: 1,
                    isActive: true
                });
            } else {
                await dbService.update(
                    model.subscription,
                    {
                        slabId: slabId,
                        userId: companyAdmin.id,
                        companyId: companyId
                    },
                    {
                        status: 'SUCCESS',
                        updatedBy: 1,
                        isActive: true
                    }
                );
            }
        }

        return res.status(200).send({
            status: 'SUCCESS',
            message: 'Slab assigned to company admin successfully',
            data: {
                slabId: slabId,
                companyId: companyId,
                adminId: companyAdmin.id,
                wasAlreadyAssigned: isSlabAssigned && isUserInSlab
            }
        });
    } catch (error) {
        console.log(error);
        return res.status(500).send({
            status: 'FAILURE',
            message: error.message || 'Internal server error'
        });
    }
};


module.exports = {
    findAllslabComm,
    updateSlab,
    updateSlabComm,
    createSlab,
    getAllSlabs,
    assignSlabToCompany,
    getAllCompanySlabList,
};
