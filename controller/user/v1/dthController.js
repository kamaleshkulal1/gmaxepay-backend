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
        // Store calculated commissions for all statuses (needed for checkStatus when status changes)
        // But only credit wallet on Success
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
            // Store calculated commissions for all statuses (will be reverted to 0 in checkStatus if Failure)
            superadminComm: paymentStatus === 'Failure' ? 0 : superadminComm,
            whitelabelComm: paymentStatus === 'Failure' ? 0 : whitelabelComm,
            masterDistributorCom: paymentStatus === 'Failure' ? 0 : masterDistributorCom,
            distributorCom: paymentStatus === 'Failure' ? 0 : distributorCom,
            retailerCom: paymentStatus === 'Failure' ? 0 : retailerCom,
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

// Helper function to update DTH recharge status (used by both checkStatus and callback)
const updateDthRechargeStatus = async (orderid, newStatus, opid, companyId = null) => {
    // Find existing DTH recharge record
    const whereClause = { orderid };
    if (companyId) {
        whereClause.companyId = companyId;
    }

    const existingDthRecharge = await dbService.findOne(model.dthRecharge, whereClause);

    if (!existingDthRecharge) {
        return { success: false, message: 'DTH recharge record not found' };
    }

    const currentStatus = existingDthRecharge.status;

    // Helper function for rounding
    const round2 = (num) => {
        const n = Number(num);
        return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
    };

    // Prepare update data
    const updateData = {
        status: newStatus,
        opid: opid || existingDthRecharge.opid,
        updatedBy: existingDthRecharge.refId // Use the user who created the record
    };

    // Handle commission reversal on failure
    if (newStatus === 'Failure') {
        // Revert all commissions to 0
        updateData.superadminComm = 0;
        updateData.whitelabelComm = 0;
        updateData.masterDistributorCom = 0;
        updateData.distributorCom = 0;
        updateData.retailerCom = 0;

        // If status was previously Success, revert wallet credit
        if (currentStatus === 'Success') {
            const wallet = await model.wallet.findOne({
                where: { refId: existingDthRecharge.refId, companyId: existingDthRecharge.companyId }
            });

            if (wallet) {
                const totalCommission = round2(
                    (existingDthRecharge.superadminComm || 0) +
                    (existingDthRecharge.whitelabelComm || 0) +
                    (existingDthRecharge.masterDistributorCom || 0) +
                    (existingDthRecharge.distributorCom || 0) +
                    (existingDthRecharge.retailerCom || 0)
                );

                if (totalCommission > 0) {
                    const currentBalance = round2(wallet.mainWallet || 0);
                    const newBalance = round2(Math.max(0, currentBalance - totalCommission));
                    
                    await wallet.update({
                        mainWallet: newBalance,
                        updatedBy: existingDthRecharge.refId
                    });
                }
            }
        }
    } else if (newStatus === 'Success') {
        // If changing to Success, keep existing commissions (don't recalculate, just update status)
        updateData.superadminComm = existingDthRecharge.superadminComm;
        updateData.whitelabelComm = existingDthRecharge.whitelabelComm;
        updateData.masterDistributorCom = existingDthRecharge.masterDistributorCom;
        updateData.distributorCom = existingDthRecharge.distributorCom;
        updateData.retailerCom = existingDthRecharge.retailerCom;

        // If status was previously Pending/Failure and now Success, credit wallet
        if (currentStatus !== 'Success') {
            const totalCommission = round2(
                (existingDthRecharge.superadminComm || 0) +
                (existingDthRecharge.whitelabelComm || 0) +
                (existingDthRecharge.masterDistributorCom || 0) +
                (existingDthRecharge.distributorCom || 0) +
                (existingDthRecharge.retailerCom || 0)
            );

            if (totalCommission > 0) {
                const wallet = await model.wallet.findOne({
                    where: { refId: existingDthRecharge.refId, companyId: existingDthRecharge.companyId }
                });

                if (wallet) {
                    const currentBalance = round2(wallet.mainWallet || 0);
                    const newBalance = round2(currentBalance + totalCommission);
                    
                    await wallet.update({
                        mainWallet: newBalance,
                        updatedBy: existingDthRecharge.refId
                    });
                }
            }
        }
    } else {
        // For Pending or no status change, keep existing commissions
        updateData.superadminComm = existingDthRecharge.superadminComm;
        updateData.whitelabelComm = existingDthRecharge.whitelabelComm;
        updateData.masterDistributorCom = existingDthRecharge.masterDistributorCom;
        updateData.distributorCom = existingDthRecharge.distributorCom;
        updateData.retailerCom = existingDthRecharge.retailerCom;
    }

    // Update DTH recharge record
    await dbService.update(
        model.dthRecharge,
        { id: existingDthRecharge.id },
        updateData
    );

    return { success: true, message: 'Status updated successfully', record: existingDthRecharge };
};

const checkStatus = async (req, res) => {
    try {
        const { orderid } = req.body;
        
        if (!orderid) {
            return res.failure({ message: 'Order ID is required' });
        }
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        // Find existing DTH recharge record
        const existingDthRecharge = await dbService.findOne(model.dthRecharge, {
            orderid,
            companyId: req.user.companyId
        });

        if (!existingDthRecharge) {
            return res.failure({ message: 'DTH recharge record not found' });
        }

        // Check status from API
        const response = await inspayService.checkStatus(orderid);
        const newStatus = response.status === 'Success' || response.status === 'SUCCESS' 
            ? 'Success' 
            : (response.status === 'Pending' || response.status === 'PENDING' ? 'Pending' : 'Failure');

        // Use helper function to update status
        const result = await updateDthRechargeStatus(orderid, newStatus, response.opid, req.user.companyId);
        
        if (!result.success) {
            return res.failure({ message: result.message });
        }

        // Update additional fields from API response
        await dbService.update(
            model.dthRecharge,
            { id: result.record.id },
            {
                txid: response.txid || result.record.txid,
                message: response.message || result.record.message,
                apiResponse: response,
                updatedBy: req.user.id
            }
        );

        // Prepare response data
        const responseData = {
            orderid,
            status: newStatus,
            apiResponse: response
        };

        return res.success({ 
            message: 'Status checked successfully', 
            data: responseData
        });
    } catch (error) {
        console.error('Check Status error:', error);
        return res.internalServerError({ message: error.message });
    }
};

module.exports = {
    dthPlanFetch,
    customerInfo,
    dthRecharge,
    checkStatus
};