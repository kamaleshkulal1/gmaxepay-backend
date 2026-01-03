const model = require('../../../models');
const dbService = require('../../../utils/dbService');

// Helper function to update DTH recharge status
const updateDthRechargeStatus = async (txid, newStatus, opid, companyId = null) => {
    // Find existing DTH recharge record
    const whereClause = { txid };
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

const paymentCallback = async (req, res) => {
    try {
        // Get parameters from query string
        const { txid, status, opid } = req.query;

        // Validate required parameters
        if (!txid || !status) {
            console.error('[Payment Callback] Missing required parameters:', { txid, status });
            return res.send('OK'); // Return OK even if invalid to prevent retries
        }

        // Normalize status
        const newStatus = status === 'Success' || status === 'SUCCESS' 
            ? 'Success' 
            : (status === 'Pending' || status === 'PENDING' ? 'Pending' : 'Failure');

        // Handle opid - can be null, empty string, or undefined
        const operatorId = opid && opid.trim() !== '' ? opid : null;

        // Update DTH recharge status
        const result = await updateDthRechargeStatus(txid, newStatus, operatorId);

        if (result.success) {
            console.log('[Payment Callback] Status updated successfully:', { txid, status: newStatus, opid: operatorId });
        } else {
            console.error('[Payment Callback] Failed to update status:', result.message, { txid, status: newStatus });
        }

        // Always return OK to payment gateway (prevents retries)
        return res.send('OK');
    } catch (error) {
        console.error('[Payment Callback] Error processing callback:', error, { 
            txid: req.query.txid, 
            status: req.query.status, 
            opid: req.query.opid 
        });
        // Always return OK even on error to prevent payment gateway retries
        return res.send('OK');
    }
};

module.exports = {
    paymentCallback
};