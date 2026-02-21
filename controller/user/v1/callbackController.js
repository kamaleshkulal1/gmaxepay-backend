const model = require('../../../models');
const dbService = require('../../../utils/dbService');

const round4 = (num) => {
    const n = Number(num);
    return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 10000) / 10000 : 0;
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
                    const refundAmount = round4((history.debit || 0) - (history.credit || 0));

                    if (refundAmount !== 0) {
                        const walletUser = await dbService.findOne(model.wallet, {
                            refId: history.refId,
                            companyId: history.companyId
                        });

                        if (walletUser) {
                            const currentBalance = round4(walletUser.mainWallet || 0);
                            const newBalance = round4(currentBalance + refundAmount);

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
                        const currentBalance = round4(walletUser.mainWallet || 0);
                        const newBalance = round4(currentBalance + amountToRefund);

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
            // Commissions were already distributed to all wallets at transaction creation time
            // (for both SUCCESS and PENDING). No extra wallet credit needed here.
            // Just preserve existing commission values on the serviceTransaction.
            updateData.superadminComm = existingTransaction.superadminComm;
            updateData.whitelabelComm = existingTransaction.whitelabelComm;
            updateData.masterDistributorCom = existingTransaction.masterDistributorCom;
            updateData.distributorCom = existingTransaction.distributorCom;
            updateData.retailerCom = existingTransaction.retailerCom;
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
