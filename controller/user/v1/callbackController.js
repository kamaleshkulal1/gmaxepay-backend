const model = require('../../../models');
const dbService = require('../../../utils/dbService');

const round2 = (num) => {
    const n = Number(num);
    return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
};

const calculateTotalCommission = (transaction) => {
    return round2(
        (transaction.superadminComm || 0) +
        (transaction.whitelabelComm || 0) +
        (transaction.masterDistributorCom || 0) +
        (transaction.distributorCom || 0) +
        (transaction.retailerCom || 0)
    );
};

const updateWalletBalance = async (refId, companyId, amount, updatedBy) => {
    const wallet = await model.wallet.findOne({
        where: { refId, companyId }
    });

    if (wallet) {
        const currentBalance = round2(wallet.mainWallet || 0);
        const newBalance = round2(Math.max(0, currentBalance + amount));
        
        await wallet.update({
            mainWallet: newBalance,
            updatedBy
        });
        return true;
    }
    return false;
};

const updateServiceTransactionStatus = async (orderid, newStatus, opid, companyId = null) => {
    const whereClause = { orderid };
    if (companyId) {
        whereClause.companyId = companyId;
    }

    const existingTransaction = await dbService.findOne(model.serviceTransaction, whereClause);

    if (!existingTransaction) {
        return { success: false, message: 'Service transaction not found' };
    }

    const currentStatus = existingTransaction.status;
    const serviceType = existingTransaction.serviceType;
    
    const isMobileRecharge = serviceType === 'MobileRecharge';
    const isDTHRecharge = serviceType === 'DTHRecharge';
    const isPan = serviceType === 'Pan';
    const isRechargeService = isMobileRecharge || isDTHRecharge;
    
    const hasCommissions = isRechargeService && (
        existingTransaction.superadminComm ||
        existingTransaction.whitelabelComm ||
        existingTransaction.masterDistributorCom ||
        existingTransaction.distributorCom ||
        existingTransaction.retailerCom
    );

    const updateData = {
        status: newStatus,
        opid: opid || existingTransaction.opid,
        updatedBy: existingTransaction.refId
    };

    if (isRechargeService && hasCommissions) {
        if (newStatus === 'FAILURE') {
            updateData.superadminComm = 0;
            updateData.whitelabelComm = 0;
            updateData.masterDistributorCom = 0;
            updateData.distributorCom = 0;
            updateData.retailerCom = 0;

            if (currentStatus === 'SUCCESS') {
                const totalCommission = calculateTotalCommission(existingTransaction);
                if (totalCommission > 0) {
                    await updateWalletBalance(
                        existingTransaction.refId,
                        existingTransaction.companyId,
                        -totalCommission,
                        existingTransaction.refId
                    );
                }
            }
        } else if (newStatus === 'SUCCESS') {
            updateData.superadminComm = existingTransaction.superadminComm;
            updateData.whitelabelComm = existingTransaction.whitelabelComm;
            updateData.masterDistributorCom = existingTransaction.masterDistributorCom;
            updateData.distributorCom = existingTransaction.distributorCom;
            updateData.retailerCom = existingTransaction.retailerCom;

            if (currentStatus !== 'SUCCESS') {
                const totalCommission = calculateTotalCommission(existingTransaction);
                if (totalCommission > 0) {
                    await updateWalletBalance(
                        existingTransaction.refId,
                        existingTransaction.companyId,
                        totalCommission,
                        existingTransaction.refId
                    );
                }
            }
        } else {
            updateData.superadminComm = existingTransaction.superadminComm;
            updateData.whitelabelComm = existingTransaction.whitelabelComm;
            updateData.masterDistributorCom = existingTransaction.masterDistributorCom;
            updateData.distributorCom = existingTransaction.distributorCom;
            updateData.retailerCom = existingTransaction.retailerCom;
        }
    }

    await dbService.update(
        model.serviceTransaction,
        { id: existingTransaction.id },
        updateData
    );

    return { 
        success: true, 
        message: 'Status updated successfully', 
        record: existingTransaction,
        serviceType: serviceType
    };
};

const paymentCallback = async (req, res) => {
    try {
        const { txid, status, opid } = req.query;

        if (!txid || !status) {
            console.error('[Payment Callback] Missing required parameters:', { txid, status });
            return res.send('OK');
        }

        const statusUpper = status.toUpperCase();
        const newStatus = statusUpper === 'SUCCESS' ? 'SUCCESS' 
            : (statusUpper === 'PENDING' ? 'PENDING' : 'FAILURE');

        const operatorId = opid && opid.trim() !== '' ? opid : null;

        const result = await updateServiceTransactionStatus(txid, newStatus, operatorId);

        if (result.success) {
            const serviceType = result.serviceType || result.record?.serviceType;
            console.log('[Payment Callback] Status updated successfully:', { 
                txid, 
                status: newStatus, 
                opid: operatorId,
                serviceType: serviceType,
                previousStatus: result.record?.status
            });
        } else {
            console.error('[Payment Callback] Failed to update status:', result.message, { 
                txid, 
                status: newStatus 
            });
        }

        return res.send('OK');
    } catch (error) {
        console.error('[Payment Callback] Error:', error, { 
            txid: req.query.txid, 
            status: req.query.status, 
            opid: req.query.opid 
        });
        return res.send('OK');
    }
};

module.exports = {
    paymentCallback
};
