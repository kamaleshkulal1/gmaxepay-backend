const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const inspayService = require('../../../services/inspayService');
const { Op, Sequelize } = require('sequelize');

const recharge = async (req, res) => {
    try {
        const { mobileNumber, opcode, amount, circle, value1, value2, value3, value4 } = req.body;
        
        // Validate required fields
        if (!mobileNumber) {
            return res.failure({ message: 'Mobile number is required' });
        }
        if (!opcode) {
            return res.failure({ message: 'Operator code is required' });
        }
        if (!amount) {
            return res.failure({ message: 'Amount is required' });
        }
        if (!circle) {
            return res.failure({ message: 'Circle is required' });
        }

        // Helper function for rounding
        const round2 = (num) => {
            const n = Number(num);
            return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
        };

        const amountNumber = round2(parseFloat(amount));

        // Parallel database queries for user and operator
        const [existingUser, operator] = await Promise.all([
            dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId }),
            dbService.findOne(model.operator, { operatorCode: opcode })
        ]);

        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        if (!operator) {
            return res.failure({ message: 'Operator not found' });
        }

        // Calculate commissions with optimized function
        const calcCommByAmtType = (base) => {
            if (base === null || base === undefined) return null;
            const baseNum = Number(base || 0);
            if (!Number.isFinite(baseNum)) return 0;
            
            return operator.amtType === 'per' 
                ? round2((amountNumber * baseNum) / 100)
                : round2(baseNum);
        };

        // Calculate all commissions
        const superadminComm = calcCommByAmtType(operator?.superadminComm);
        const whitelabelComm = calcCommByAmtType(operator?.whitelabelComm);
        const masterDistributorCom = calcCommByAmtType(
            operator?.masterDistributorCom ?? operator?.masterDistrbutorCom
        );
        const distributorCom = calcCommByAmtType(operator?.distributorCom);
        const retailerCommBase = operator?.retailerCom ?? operator?.reatilerCom ?? operator?.comm;
        const retailerCom = calcCommByAmtType(retailerCommBase);

        // Calculate total commission credit
        const retailerNetCredit = round2(
            (superadminComm || 0) + 
            (whitelabelComm || 0) + 
            (masterDistributorCom || 0) + 
            (distributorCom || 0) + 
            (retailerCom || 0)
        );
        // Start wallet lookup and recharge service in parallel
        const [response, wallet] = await Promise.all([
            inspayService.Recharge(mobileNumber, opcode, amount, value1, value2, value3, value4),
            model.wallet.findOne({
                where: { refId: req.user.id, companyId: req.user.companyId }
            })
        ]);   
             // Extract response data
        const orderid = response.orderid;
        const isSuccess = response.status === 'Success' || response.status === 'SUCCESS';
        const isPending = response.status === 'Pending' || response.status === 'PENDING';
        const paymentStatus = isSuccess ? 'SUCCESS' : (isPending ? 'PENDING' : 'FAILURE');

        // Create wallet if doesn't exist
        let currentWallet = wallet;
        if (!currentWallet) {
            currentWallet = await model.wallet.create({
                refId: req.user.id,
                companyId: req.user.companyId,
                roleType: req.user.userType,
                mainWallet: 0,
                apes1Wallet: 0,
                apes2Wallet: 0,
                addedBy: req.user.id,
                updatedBy: req.user.id
            });
        }

        const openingMainWallet = round2(currentWallet.mainWallet || 0);
        const creditToApply = isSuccess ? retailerNetCredit : 0;
        const closingMainWallet = isSuccess ? round2(openingMainWallet + creditToApply) : openingMainWallet;
         if(isSuccess) response.operatorName = operator?.operatorName;
        // Prepare service transaction data
        const serviceTransactionData = {
            refId: req.user.id,
            companyId: req.user.companyId,
            serviceType: 'MobileRecharge',
            mobileNumber,
            opcode,
            circle: circle || null,
            amount: amountNumber,
            orderid,
            txid: response.txid || null,
            status: paymentStatus,
            opid: response.opid || null,
            message: response.message || null,
            value1: value1 || null,
            value2: value2 || null,
            value3: value3 || null,
            value4: value4 || null,
            apiResponse: response,
            superadminComm: paymentStatus === 'SUCCESS' ? superadminComm : 0,
            whitelabelComm: paymentStatus === 'SUCCESS' ? whitelabelComm : 0,
            masterDistributorCom: paymentStatus === 'SUCCESS' ? masterDistributorCom : 0,
            distributorCom: paymentStatus === 'SUCCESS' ? distributorCom : 0,
            retailerCom: paymentStatus === 'SUCCESS' ? retailerCom : 0,
            isActive: true,
            addedBy: req.user.id
        };

        // Execute wallet update and service transaction creation in parallel
        const updates = [
            dbService.createOne(model.serviceTransaction, serviceTransactionData)
        ];

        if (isSuccess && creditToApply > 0) {
            updates.push(
                currentWallet.update({
                    mainWallet: closingMainWallet,
                    updatedBy: req.user.id
                })
            );
        }

        const [rechargeRecord] = await Promise.all(updates);

        // Prepare response data (only orderid and apiResponse)
        const responseData = {
            orderid,
            apiResponse: response
        };

        if (isSuccess) {
            return res.success({ 
                message: response.message || 'Recharge successful', 
                data: responseData
            });
        } else if (isPending) {
            return res.success({ 
                message: response.message || 'Recharge in process', 
                data: responseData
            });
        } else {
            return res.failure({ 
                message: response.message || 'Recharge failed',
                data: responseData
            });
        }
    } catch (error) {
        console.error('Recharge error:', error);
        return res.internalServerError({ message: error.message });
    }
};

const findMobileNumberOperator = async (req, res) => {
    try {
        const { mobileNumber } = req.body;
        if(!mobileNumber){
            return res.failure({ message: 'Mobile number is required' });
        }
        const [existingUser, response] = await Promise.all([
            dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId }),
            inspayService.operatorFetch(mobileNumber)
        ]);

        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        console.log('response', response);

        // Check if response exists
        if (!response) {
            return res.failure({ message: 'Failed to fetch operator information' });
        }
        
        // Use 'company' field from response (API returns 'company' not 'operatorName')
        const operatorName = response?.company || response?.operatorName;
        if (!operatorName) {
            return res.failure({ message: response.message || 'Operator name not found in response' });
        }
        
        const operatorNameUpper = operatorName.toUpperCase();
        console.log('operatorNameUpper', operatorNameUpper);
        if (operatorNameUpper !== 'BSNL') {
            const operator = await dbService.findOne(model.operator, { operatorName: operatorNameUpper });
            console.log('operator', operator);
            if (!operator) {
                return res.failure({ message: 'Operator not found' });
            }
            response.operatorCode = operator.operatorCode;
        }
        
        if (response.status === 'Success' || response.status.toUpperCase() === 'SUCCESS') {
            return res.success({ message: 'Operator retrieved successfully', data: response });
        } else {
            return res.failure({ message: response.message || 'Failed to fetch operator' });
        }
    } catch (error) {
        console.log(error);
        return res.failure({ message: error.message });
    }
};

const  findAllRechargePlanFetch = async (req, res) => {
    try {
        const { mobileNumber,opCode,circle } = req.body;
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        if(!mobileNumber){
            return res.failure({ message: 'Mobile number is required' });
        }
        if(!opCode){
            return res.failure({ message: 'Operator code is required' });
        }
        if(!circle){
            return res.failure({ message: 'Circle is required' });
        }
        const operator = await dbService.findOne(model.operator,{operatorCode:opCode});
        if (!operator) {
            return res.failure({ message: 'Operator not found' });
        }
        const response = await inspayService.rechargePlanFetch(mobileNumber,opCode,circle);
        console.log('response', response);
        if (response.status === 'Success') {
            return res.success({ message: 'Recharge plan retrieved successfully', data: response });
        } else {
            return res.failure({ message: response.message || 'Failed to fetch recharge plan' });
        }
    } catch (error) {
        console.log(error);
        return res.failure({ message: error.message });
    }
};

const findRechargeOfferFetch = async (req, res) => {
    try {
        const { mobileNumber,opCode,circle } = req.body;
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        if(!mobileNumber){
            return res.failure({ message: 'Mobile number is required' });
        }
        if(!opCode){
            return res.failure({ message: 'Operator code is required' });
        }
        if(!circle){
            return res.failure({ message: 'Circle is required' });
        }
        const operator = await dbService.findOne(model.operator,{operatorCode:opCode});
        if (!operator) {
            return res.failure({ message: 'Operator not found' });
        }
        const response = await inspayService.RechargeOfferFetch(mobileNumber,opCode,circle);
        console.log('response', response);
        if (response.status === 'Success') {
            return res.success({ message: 'Recharge offer retrieved successfully', data: response });
        } else {
            return res.failure({ message: response.message || 'Failed to fetch recharge offer' });
        }
    } catch (error) {   
        console.log(error);
        return res.failure({ message: error.message });
    }
};

const getRechargeHistory = async (req, res) => {
    try {
        if(![4,5].includes(req.user.userRole)){
            return res.failure({ message: 'You are not authorized to access this resource' });
        }
        const rechargeHistory = await dbService.findAll(model.serviceTransaction, { 
            refId: req.user?.id, 
            companyId: req.user?.companyId,
            serviceType: 'MobileRecharge'
        }, {
            order: [['createdAt', 'DESC']]
        });
        if (!rechargeHistory || rechargeHistory.length === 0) {
            return res.success({ message: 'No recharge history found', data: [] });
        }
        return res.success({ message: 'Recharge history retrieved successfully', data: rechargeHistory });
        } catch (error) {
        console.log(error);
        return res.internalServerError({ message: error.message });
    }
};

const getDownlineRechargeReports = async (req, res) => {
    try {
        if (![3, 4].includes(req.user.userRole)) {
            return res.failure({ message: 'You are not authorized to access this resource' });
        }

        if (!req.user.companyId) {
            return res.failure({ message: 'Company ID is required' });
        }

        const getAllDownlineUserIds = async (userId, userRole, companyId) => {
            const allUserIds = new Set();
            const allowedRoles = userRole === 3 ? [4, 5] : [5];
            let currentLevelUsers = [{ id: userId, userRole }];
            
            while (currentLevelUsers.length > 0) {
                const currentLevelIds = currentLevelUsers.map(u => u.id);
                const nextLevelUsers = await dbService.findAll(model.user, {
                    reportingTo: { [Op.in]: currentLevelIds },
                    companyId: companyId,
                    userRole: { [Op.in]: allowedRoles },
                    isDeleted: false
                }, {
                    attributes: ['id', 'userRole']
                });

                nextLevelUsers.forEach(user => {
                    if (user.id !== userId) {
                        allUserIds.add(user.id);
                    }
                });

                currentLevelUsers = nextLevelUsers;
            }

            return Array.from(allUserIds);
        };

        const downlineUserIds = await getAllDownlineUserIds(req.user.id, req.user.userRole, req.user.companyId);

        if (!downlineUserIds || downlineUserIds.length === 0) {
            return res.status(200).send({
                status: 'SUCCESS',
                message: 'No downline users found',
                data: [],
                total: 0,
                paginator: {
                    page: 1,
                    paginate: 10,
                    totalPages: 0
                }
            });
        }

        const dataToFind = req.body || {};
        let options = {};
        let query = {
            refId: { [Op.in]: downlineUserIds },
            companyId: req.user.companyId
        };

        if (dataToFind.query) {
            Object.keys(dataToFind.query).forEach(key => {
                if (key !== 'refId' && key !== 'companyId') {
                    query[key] = dataToFind.query[key];
                }
            });
        }

        if (dataToFind.options !== undefined) {
            options = { ...dataToFind.options };
            
            if (dataToFind.options.sort) {
                const sortEntries = Object.entries(dataToFind.options.sort);
                options.order = sortEntries.map(([field, direction]) => {
                    return [field, direction === -1 ? 'DESC' : 'ASC'];
                });
            } else {
                options.order = [['createdAt', 'DESC']];
            }
        } else {
            options.order = [['createdAt', 'DESC']];
        }

        if (dataToFind.customSearch && Object.keys(dataToFind.customSearch).length > 0) {
            const searchConditions = [];
            const customSearch = dataToFind.customSearch;

            if (customSearch.transactionId) {
                const searchValue = String(customSearch.transactionId).trim();
                if (searchValue) {
                    searchConditions.push({
                        transactionId: {
                            [Op.iLike]: `%${searchValue}%`
                        }
                    });
                }
            }

            if (customSearch.mobileNumber) {
                const searchValue = String(customSearch.mobileNumber).trim();
                if (searchValue) {
                    searchConditions.push({
                        mobileNumber: {
                            [Op.iLike]: `%${searchValue}%`
                        }
                    });
                }
            }

            if (customSearch.name) {
                const searchName = String(customSearch.name).trim();
                if (searchName) {
                    const matchingUsers = await dbService.findAll(model.user, {
                        id: { [Op.in]: downlineUserIds },
                        companyId: req.user.companyId,
                        name: {
                            [Op.iLike]: `%${searchName}%`
                        },
                        isDeleted: false
                    }, {
                        attributes: ['id']
                    });

                    const matchingUserIds = matchingUsers.map(u => u.id);
                    if (matchingUserIds.length > 0) {
                        searchConditions.push({
                            refId: { [Op.in]: matchingUserIds }
                        });
                    }
                }
            }

            if (searchConditions.length > 0) {
                query = {
                    ...query,
                    [Op.and]: [
                        { [Op.or]: searchConditions }
                    ]
                };
            } else {
                return res.status(200).send({
                    status: 'SUCCESS',
                    message: 'Recharge reports retrieved successfully',
                    data: [],
                    total: 0,
                    paginator: {
                        page: options.page || 1,
                        paginate: options.paginate || 10,
                        totalPages: 0
                    }
                });
            }
        }

        options.include = [
            {
                model: model.user,
                as: 'user',
                attributes: ['id', 'name', 'userId', 'mobileNo'],
                required: false
            }
        ];

        const result = await dbService.paginate(model.serviceTransaction, query, options);

        if (!result || !result.data || result.data.length === 0) {
            return res.status(200).send({
                status: 'SUCCESS',
                message: 'No recharge reports found',
                data: [],
                total: result?.total || 0,
                paginator: result?.paginator || {
                    page: options.page || 1,
                    paginate: options.paginate || 10,
                    totalPages: 0
                }
            });
        }

        return res.status(200).send({
            status: 'SUCCESS',
            message: 'Recharge reports retrieved successfully',
            data: result.data,
            total: result.total || 0,
            paginator: result.paginator
        });
    } catch (error) {
        console.log(error);
        return res.internalServerError({ message: error.message });
    }
}

const getRechargeReports = async (req, res) => {
    try {
        if (!req.user.companyId) {
            return res.failure({ message: 'Company ID is required' });
        }

        const dataToFind = req.body || {};
        let options = {};
        let query = {
            refId: req.user.id,
            companyId: req.user.companyId
        };

        if (dataToFind.query) {
            Object.keys(dataToFind.query).forEach(key => {
                if (key !== 'refId' && key !== 'companyId') {
                    query[key] = dataToFind.query[key];
                }
            });
        }

        if (dataToFind.options !== undefined) {
            options = { ...dataToFind.options };
            
            if (dataToFind.options.sort) {
                const sortEntries = Object.entries(dataToFind.options.sort);
                options.order = sortEntries.map(([field, direction]) => {
                    return [field, direction === -1 ? 'DESC' : 'ASC'];
                });
            } else {
                options.order = [['createdAt', 'DESC']];
            }
        } else {
            options.order = [['createdAt', 'DESC']];
        }

        if (dataToFind.customSearch && Object.keys(dataToFind.customSearch).length > 0) {
            const searchConditions = [];
            const customSearch = dataToFind.customSearch;

            if (customSearch.transactionId) {
                const searchValue = String(customSearch.transactionId).trim();
                if (searchValue) {
                    searchConditions.push({
                        transactionId: {
                            [Op.iLike]: `%${searchValue}%`
                        }
                    });
                }
            }

            if (customSearch.mobileNumber) {
                const searchValue = String(customSearch.mobileNumber).trim();
                if (searchValue) {
                    searchConditions.push({
                        mobileNumber: {
                            [Op.iLike]: `%${searchValue}%`
                        }
                    });
                }
            }

            if (searchConditions.length > 0) {
                query = {
                    ...query,
                    [Op.and]: [
                        { [Op.or]: searchConditions }
                    ]
                };
            } else {
                return res.status(200).send({
                    status: 'SUCCESS',
                    message: 'Recharge reports retrieved successfully',
                    data: [],
                    total: 0,
                    paginator: {
                        page: options.page || 1,
                        paginate: options.paginate || 10,
                        totalPages: 0
                    }
                });
            }
        }

        options.include = [
            {
                model: model.user,
                as: 'user',
                attributes: ['id', 'name', 'userId', 'mobileNo'],
                required: false
            }
        ];

        const result = await dbService.paginate(model.serviceTransaction, query, options);

        if (!result || !result.data || result.data.length === 0) {
            return res.status(200).send({
                status: 'SUCCESS',
                message: 'No recharge reports found',
                data: [],
                total: result?.total || 0,
                paginator: result?.paginator || {
                    page: options.page || 1,
                    paginate: options.paginate || 10,
                    totalPages: 0
                }
            });
        }

        return res.status(200).send({
            status: 'SUCCESS',
            message: 'Recharge reports retrieved successfully',
            data: result.data,
            total: result.total || 0,
            paginator: result.paginator
        });
    } catch (error) {
        console.log(error);
        return res.internalServerError({ message: error.message });
    }
}

module.exports = {
    recharge,
    findMobileNumberOperator,
    getRechargeHistory,
    findAllRechargePlanFetch,
    findRechargeOfferFetch,
    getDownlineRechargeReports,
    getRechargeReports
};