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
    const isRefundableService = isMobileRecharge || isDTHRecharge || isPan;

    const updateData = {
        status: newStatus,
        opid: opid || existingTransaction.opid,
        updatedBy: existingTransaction.refId
    };

    if (isRefundableService) {
        if (newStatus === 'FAILURE' && (currentStatus === 'SUCCESS' || currentStatus === 'PENDING')) {
            // Find all wallet histories associated with this transaction in the current state
            const histories = await dbService.findAll(model.walletHistory, {
                transactionId: existingTransaction.orderid,
                paymentStatus: currentStatus
            });

            if (histories && histories.length > 0) {
                // Reverse all wallet impacts
                for (const history of histories) {
                    const refundAmount = round2((history.debit || 0) - (history.credit || 0));

                    if (refundAmount !== 0) {
                        const walletUser = await dbService.findOne(model.wallet, {
                            refId: history.refId,
                            companyId: history.companyId
                        });

                        if (walletUser) {
                            const currentBalance = round2(walletUser.mainWallet || 0);
                            const newBalance = round2(currentBalance + refundAmount);

                            await dbService.update(model.wallet, { id: walletUser.id }, {
                                mainWallet: newBalance,
                                updatedBy: existingTransaction.refId
                            });

                            await dbService.createOne(model.walletHistory, {
                                refId: history.refId,
                                companyId: history.companyId,
                                walletType: history.walletType || 'mainWallet',
                                operator: history.operator || 'Unknown',
                                remark: `Reversal - ${serviceType} Failed`,
                                amount: history.amount || 0,
                                comm: 0,
                                surcharge: 0,
                                openingAmt: currentBalance,
                                closingAmt: newBalance,
                                credit: history.debit || 0,
                                debit: history.credit || 0,
                                transactionId: existingTransaction.orderid,
                                paymentStatus: 'REFUNDED',
                                addedBy: existingTransaction.refId,
                                updatedBy: existingTransaction.refId
                            });
                        }
                    }
                }
            } else {
                // Fallback: If no history is found, refund the base amount to the initiator
                const amountToRefund = existingTransaction.amount || 0;
                if (amountToRefund > 0) {
                    const walletUser = await dbService.findOne(model.wallet, {
                        refId: existingTransaction.refId,
                        companyId: existingTransaction.companyId
                    });

                    if (walletUser) {
                        const currentBalance = round2(walletUser.mainWallet || 0);
                        const newBalance = round2(currentBalance + amountToRefund);

                        await dbService.update(model.wallet, { id: walletUser.id }, {
                            mainWallet: newBalance,
                            updatedBy: existingTransaction.refId
                        });

                        await dbService.createOne(model.walletHistory, {
                            refId: existingTransaction.refId,
                            companyId: existingTransaction.companyId,
                            walletType: 'mainWallet',
                            operator: 'Unknown',
                            remark: `Reversal - ${serviceType} Failed`,
                            amount: amountToRefund,
                            comm: 0,
                            surcharge: 0,
                            openingAmt: currentBalance,
                            closingAmt: newBalance,
                            credit: amountToRefund,
                            debit: 0,
                            transactionId: existingTransaction.orderid,
                            paymentStatus: 'REFUNDED',
                            addedBy: existingTransaction.refId,
                            updatedBy: existingTransaction.refId
                        });
                    }
                }
            }

            // Zero out commissions for the failed transaction
            updateData.superadminComm = 0;
            updateData.whitelabelComm = 0;
            updateData.masterDistributorCom = 0;
            updateData.distributorCom = 0;
            updateData.retailerCom = 0;

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

const aslPayoutCallback = async (req, res) => {
    try {
        const payload = req.body || {};
        console.log('[ASL Payout Callback] Incoming payload:', JSON.stringify(payload));

        const { status, message, orderId, data, code } = payload;

        if (!orderId || !status) {
            console.error('[ASL Payout Callback] Missing required fields:', { orderId, status });
            return res.send('OK');
        }

        const statusUpper = status.toString().toUpperCase();
        const newStatus = statusUpper === 'SUCCESS'
            ? 'SUCCESS'
            : statusUpper === 'PENDING'
                ? 'PENDING'
                : 'FAILED';

        const bankRef = data && data.bankref ? data.bankref : null;
        const innerStatus = data && data.status ? data.status : null;
        const agentTransactionId = data && data.agentTransactionId ? data.agentTransactionId : null;

        const existingPayout = await dbService.findOne(model.payoutHistory, { orderId });

        if (!existingPayout) {
            console.error('[ASL Payout Callback] Payout history not found for orderId:', orderId);
            return res.send('OK');
        }

        const updateData = {
            status: newStatus,
            statusMessage: message || existingPayout.statusMessage,
            utrn: bankRef || existingPayout.utrn,
            orderId: orderId || existingPayout.orderId,
            agentTransactionID: agentTransactionId || existingPayout.agentTransactionID,
            apiResponse: payload,
            updatedBy: existingPayout.refId
        };

        await dbService.update(
            model.payoutHistory,
            { id: existingPayout.id },
            updateData
        );

        console.log('[ASL Payout Callback] Payout history updated:', {
            orderId,
            previousStatus: existingPayout.status,
            newStatus,
            bankRef,
            innerStatus,
            agentTransactionId,
            code
        });

        return res.send('OK');
    } catch (error) {
        console.error('[ASL Payout Callback] Error:', error, {
            body: req.body
        });
        return res.send('OK');
    }
};

module.exports = {
    paymentCallback,
    aslPayoutCallback
};
