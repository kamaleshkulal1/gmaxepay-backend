const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const inspayService = require('../../../services/inspayService');

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
        console.log('response', response);


        // Extract response data
        const orderid = response.orderid;
        const isSuccess = response.status === 'Success' || response.status === 'SUCCESS';
        const isPending = response.status === 'Pending' || response.status === 'PENDING';
        const paymentStatus = isSuccess ? 'Success' : (isPending ? 'Pending' : 'Failure');

        // Create wallet if doesn't exist
        let currentWallet = wallet;
        if (!currentWallet) {
            currentWallet = await model.wallet.create({
                refId: req.user.id,
                companyId: req.user.companyId,
                roleType: req.user.userType,
                mainWallet: 0,
                apesWallet: 0,
                addedBy: req.user.id,
                updatedBy: req.user.id
            });
        }

        const openingMainWallet = round2(currentWallet.mainWallet || 0);
        const creditToApply = isSuccess ? retailerNetCredit : 0;
        const closingMainWallet = isSuccess ? round2(openingMainWallet + creditToApply) : openingMainWallet;

        // Prepare recharge data
        const rechargeData = {
            refId: req.user.id,
            companyId: req.user.companyId,
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
            superadminComm: paymentStatus === 'Success' ? superadminComm : 0,
            whitelabelComm: paymentStatus === 'Success' ? whitelabelComm : 0,
            masterDistributorCom: paymentStatus === 'Success' ? masterDistributorCom : 0,
            distributorCom: paymentStatus === 'Success' ? distributorCom : 0,
            retailerCom: paymentStatus === 'Success' ? retailerCom : 0,
            isActive: true,
            addedBy: req.user.id
        };

        // Execute wallet update and recharge record creation in parallel
        const updates = [
            dbService.createOne(model.recharge, rechargeData)
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
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const response = await inspayService.operatorFetch(mobileNumber);
        console.log('response', response);
        
        // Check if response exists
        if (!response) {
            return res.failure({ message: 'Failed to fetch operator information' });
        }
        
        // Use 'company' field from response (API returns 'company' not 'operatorName')
        const operatorName = response.company || response.operatorName;
        if (!operatorName) {
            return res.failure({ message: response.message || 'Operator name not found in response' });
        }
        
        const operator = await dbService.findOne(model.operator, { operatorName: operatorName.toUpperCase() });
        if (!operator) {
            return res.failure({ message: 'Operator not found' });
        }
        response.operatorCode = operator.operatorCode;
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
        const { userId } = req.user;
        const existingUser = await dbService.findOne(model.user, { id: userId, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const rechargeHistory = await dbService.findAll(model.recharge, { 
            refId: userId, 
            companyId: req.user.companyId 
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

module.exports = {
    recharge,
    findMobileNumberOperator,
    getRechargeHistory,
    findAllRechargePlanFetch,
    findRechargeOfferFetch
};