const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const inspayService = require('../../../services/inspayService');

const dthPlanFetch = async (req, res) => {
    try {
        const { dth_number, opcode } = req.body;
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const operator = await dbService.findOne(model.operator, { operatorCode: opcode });
        if (!operator) {
            return res.failure({ message: 'Operator not found' });
        }
        const response = await inspayService.DTHPlanFetch(dth_number, opcode);

        if (response.status === 'Success') {
            return res.success({ message: 'DTH plan fetched successfully', data: response });
        } else {
            return res.failure({ message: response.message || 'Failed to fetch DTH plan' });
        }
    } catch (error) {
        console.log(error);
        return res.failure({ message: 'Failed to fetch DTH plan' });
    }
};

const customerInfo = async (req, res) => {
    try {
        const { dth_number, opcode } = req.body;
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }
        const operator = await dbService.findOne(model.operator, { operatorCode: opcode });
        if (!operator) {
            return res.failure({ message: 'Operator not found' });
        }
        const response = await inspayService.DTHCustomerInfo(dth_number, opcode);
        if (response.status === 'Success') {
            return res.success({ message: 'Customer info fetched successfully', data: response });
        } else {
            return res.failure({ message: response.message || 'Failed to fetch customer info' });
        }
    } catch (error) {
        console.log(error);
        return res.failure({ message: 'Failed to fetch customer info' });
    }
};

const dthRecharge = async (req, res) => {
    try {
        const { dth_number, opcode, amount } = req.body;
        
        if (!dth_number) {
            return res.failure({ message: 'DTH number is required' });
        }
        if (!opcode) {
            return res.failure({ message: 'Operator code is required' });
        }
        if (!amount) {
            return res.failure({ message: 'Amount is required' });
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
            inspayService.Recharge(dth_number, opcode, amount),
            model.wallet.findOne({
                where: { refId: req.user.id, companyId: req.user.companyId }
            })
        ]);

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

        // Prepare DTH recharge data
        const dthRechargeData = {
            refId: req.user.id,
            companyId: req.user.companyId,
            dthNumber: dth_number,
            opcode,
            amount: amountNumber,
            orderid,
            txid: response.txid || null,
            status: paymentStatus,
            opid: response.opid || null,
            message: response.message || null,
            apiResponse: response,
            superadminComm: paymentStatus === 'Success' ? superadminComm : 0,
            whitelabelComm: paymentStatus === 'Success' ? whitelabelComm : 0,
            masterDistributorCom: paymentStatus === 'Success' ? masterDistributorCom : 0,
            distributorCom: paymentStatus === 'Success' ? distributorCom : 0,
            retailerCom: paymentStatus === 'Success' ? retailerCom : 0,
            isActive: true,
            addedBy: req.user.id
        };

        // Execute wallet update and DTH recharge record creation in parallel
        const updates = [
            dbService.createOne(model.dthRecharge, dthRechargeData)
        ];

        if (isSuccess && creditToApply > 0) {
            updates.push(
                currentWallet.update({
                    mainWallet: closingMainWallet,
                    updatedBy: req.user.id
                })
            );
        }

        const [dthRechargeRecord] = await Promise.all(updates);

        // Prepare response data (only orderid and apiResponse)
        const responseData = {
            orderid,
            apiResponse: response
        };

        if (isSuccess) {
            return res.success({ 
                message: response.message || 'DTH recharge successful', 
                data: responseData
            });
        } else if (isPending) {
            return res.success({ 
                message: response.message || 'DTH recharge in process', 
                data: responseData
            });
        } else {
            return res.failure({ 
                message: response.message || 'DTH recharge failed',
                data: responseData
            });
        }
    } catch (error) {
        console.error('DTH Recharge error:', error);
        return res.internalServerError({ message: error.message });
    }
};

module.exports = {
    dthPlanFetch,
    customerInfo,
    dthRecharge
};