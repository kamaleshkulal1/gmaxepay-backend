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

    const isMobileRecharge = serviceType === 'Mobile1Recharge';
    const isDTHRecharge = serviceType === 'DTH1Recharge';
    const isPan = serviceType === 'Pan1';
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

const updateService1TransactionStatus = async (orderid, newStatus, opid, companyId = null) => {
    const whereClause = { orderid };
    if (companyId) whereClause.companyId = companyId;

    const existingTransaction = await dbService.findOne(model.service1Transaction, whereClause);
    if (!existingTransaction) return { success: false, message: 'Service1 transaction not found' };

    const currentStatus = existingTransaction.status;
    const serviceType = existingTransaction.serviceType;
    const isMobileRecharge = serviceType === 'Mobile2Recharge';
    const isDTHRecharge = serviceType === 'DTH2Recharge';
    const isPan = serviceType === 'Pan2';
    const isRefundableService = isMobileRecharge || isDTHRecharge || isPan;

    const updateData = { status: newStatus, opid: opid || existingTransaction.opid, updatedBy: existingTransaction.refId };

    if (isRefundableService) {
        if (newStatus === 'FAILURE' && (currentStatus === 'SUCCESS' || currentStatus === 'PENDING')) {
            const histories = await dbService.findAll(model.walletHistory, { transactionId: existingTransaction.orderid, paymentStatus: currentStatus });
            if (histories && histories.length > 0) {
                for (const history of histories) {
                    const refundAmount = round4((history.debit || 0) - (history.credit || 0));
                    if (refundAmount !== 0) {
                        const walletUser = await dbService.findOne(model.wallet, { refId: history.refId, companyId: history.companyId });
                        if (walletUser) {
                            const currentBalance = round4(walletUser.mainWallet || 0);
                            const newBalance = round4(currentBalance + refundAmount);
                            await dbService.update(model.wallet, { id: walletUser.id }, { mainWallet: newBalance, updatedBy: existingTransaction.refId });
                            await dbService.createOne(model.walletHistory, { refId: history.refId, companyId: history.companyId, walletType: history.walletType || 'mainWallet', operator: history.operator || 'Unknown', remark: `Reversal - ${serviceType} Failed`, amount: history.amount || 0, comm: 0, surcharge: 0, openingAmt: currentBalance, closingAmt: newBalance, credit: history.debit || 0, debit: history.credit || 0, transactionId: existingTransaction.orderid, paymentStatus: 'REFUNDED', addedBy: existingTransaction.refId, updatedBy: existingTransaction.refId });
                        }
                    }
                }
            } else {
                const amountToRefund = existingTransaction.amount || 0;
                if (amountToRefund > 0) {
                    const walletUser = await dbService.findOne(model.wallet, { refId: existingTransaction.refId, companyId: existingTransaction.companyId });
                    if (walletUser) {
                        const currentBalance = round4(walletUser.mainWallet || 0);
                        const newBalance = round4(currentBalance + amountToRefund);
                        await dbService.update(model.wallet, { id: walletUser.id }, { mainWallet: newBalance, updatedBy: existingTransaction.refId });
                        await dbService.createOne(model.walletHistory, { refId: existingTransaction.refId, companyId: existingTransaction.companyId, walletType: 'mainWallet', operator: 'Unknown', remark: `Reversal - ${serviceType} Failed`, amount: amountToRefund, comm: 0, surcharge: 0, openingAmt: currentBalance, closingAmt: newBalance, credit: amountToRefund, debit: 0, transactionId: existingTransaction.orderid, paymentStatus: 'REFUNDED', addedBy: existingTransaction.refId, updatedBy: existingTransaction.refId });
                    }
                }
            }
            updateData.superadminComm = 0; updateData.whitelabelComm = 0; updateData.masterDistributorCom = 0; updateData.distributorCom = 0; updateData.retailerCom = 0;
        } else {
            updateData.superadminComm = existingTransaction.superadminComm; updateData.whitelabelComm = existingTransaction.whitelabelComm;
            updateData.masterDistributorCom = existingTransaction.masterDistributorCom; updateData.distributorCom = existingTransaction.distributorCom; updateData.retailerCom = existingTransaction.retailerCom;
        }
    }

    await dbService.update(model.service1Transaction, { id: existingTransaction.id }, updateData);
    return { success: true, message: 'Status updated successfully', record: existingTransaction, serviceType };
};

const inspayCallback = async (req, res) => {
    try {
        const { txid, status, opid } = req.query;

        if (!txid || !status) {
            console.error('[Inspay Callback] Missing required parameters:', { txid, status });
            return res.send('OK');
        }

        const statusUpper = status.toUpperCase();
        const newStatus = statusUpper === 'SUCCESS' ? 'SUCCESS'
            : (statusUpper === 'PENDING' ? 'PENDING' : 'FAILURE');

        const operatorId = opid && opid.trim() !== '' ? opid : null;

        const result = await updateServiceTransactionStatus(txid, newStatus, operatorId);

        if (result.success) {
            const serviceType = result.serviceType || result.record?.serviceType;
            console.log('[Inspay Callback] Status updated successfully:', {
                txid,
                status: newStatus,
                opid: operatorId,
                serviceType: serviceType,
                previousStatus: result.record?.status
            });
        } else {
            console.error('[Inspay Callback] Failed to update status:', result.message, {
                txid,
                status: newStatus
            });
        }

        return res.send('OK');
    } catch (error) {
        console.error('[Inspay Callback] Error:', error, {
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

        // Look up by orderId first, then fall back to transactionID (ASL sometimes sends agent txn id)
        let existingPayout = await dbService.findOne(model.payoutHistory, { orderId });
        if (!existingPayout && agentTransactionId) {
            existingPayout = await dbService.findOne(model.payoutHistory, { transactionID: agentTransactionId });
        }

        if (!existingPayout) {
            console.error('[ASL Payout Callback] Payout history not found for orderId:', orderId);
            return res.send('OK');
        }

        const previousStatus = existingPayout.status;

        // ── FAILURE: Reverse all AEPS wallet impacts ──────────────────────────
        if (newStatus === 'FAILED' && (previousStatus === 'SUCCESS' || previousStatus === 'PENDING')) {
            console.log(`[ASL Payout Callback] Reversing payout wallets for transactionID: ${existingPayout.transactionID}, walletType: ${existingPayout.walletType}`);

            const txnId = existingPayout.transactionID;
            // payout used this AEPS wallet column (apes1Wallet or apes2Wallet)
            const aepsWalletCol = existingPayout.walletType || 'apes1Wallet';

            // Find all walletHistory entries for this transaction — includes the
            // initiator's payout debit + all surcharge entries (company, SA, MD, dist, retailer)
            const allHistories = await dbService.findAll(model.walletHistory, {
                transactionId: txnId
            });

            // Find GST deduction, if any
            const gstRecord = await dbService.findOne(model.gstHistory, {
                transactionId: txnId
            });

            if (allHistories && allHistories.length > 0) {
                const reversalUpdates = [];
                const reversalHistoryPromises = [];

                for (const history of allHistories) {
                    // Net impact = credit − debit on this party's wallet
                    // To reverse: subtract net from current balance
                    const netImpact = round4((history.credit || 0) - (history.debit || 0));
                    if (netImpact === 0) continue;

                    const walletRecord = await dbService.findOne(model.wallet, {
                        refId: history.refId,
                        companyId: history.companyId
                    });
                    if (!walletRecord) continue;

                    // The original payout entries used walletType to determine apes1Wallet/apes2Wallet
                    // All payout surcharge history entries share the same walletType as the payout
                    const walletCol = history.walletType && history.walletType !== 'mainWallet'
                        ? history.walletType   // e.g. 'apes1Wallet' from surcharge entries
                        : aepsWalletCol;       // fallback to payout's column

                    const currentBal = round4(walletRecord[walletCol] || 0);
                    const newBal = round4(currentBal - netImpact);

                    reversalUpdates.push(
                        dbService.update(model.wallet, { id: walletRecord.id }, {
                            [walletCol]: newBal,
                            updatedBy: existingPayout.refId
                        })
                    );

                    reversalHistoryPromises.push(
                        dbService.createOne(model.walletHistory, {
                            refId: history.refId,
                            companyId: history.companyId,
                            walletType: walletCol,
                            operator: history.operator || 'Payout1',
                            remark: `Reversal - Payout Failed`,
                            amount: history.amount || 0,
                            comm: 0,
                            surcharge: 0,
                            openingAmt: currentBal,
                            closingAmt: newBal,
                            // Reversed: original credit becomes debit and vice versa
                            credit: history.debit || 0,
                            debit: history.credit || 0,
                            transactionId: txnId,
                            paymentStatus: 'REFUNDED',
                            addedBy: existingPayout.refId,
                            updatedBy: existingPayout.refId
                        })
                    );
                }

                if (gstRecord && gstRecord.amount > 0 && gstRecord.status !== 'FAILED') {
                    // Refund the GST amount to the initiator's wallet
                    const gstAmountToRefund = round4(gstRecord.amount);
                    const walletRecord = await dbService.findOne(model.wallet, {
                        refId: gstRecord.refId,
                        companyId: gstRecord.companyId
                    });

                    if (walletRecord) {
                        const currentBal = round4(walletRecord[aepsWalletCol] || 0);
                        const newBal = round4(currentBal + gstAmountToRefund);

                        reversalUpdates.push(
                            dbService.update(model.wallet, { id: walletRecord.id }, {
                                [aepsWalletCol]: newBal,
                                updatedBy: existingPayout.refId
                            })
                        );

                        reversalHistoryPromises.push(
                            dbService.createOne(model.walletHistory, {
                                refId: gstRecord.refId,
                                companyId: gstRecord.companyId,
                                walletType: aepsWalletCol,
                                operator: 'GST Reversal',
                                remark: `Reversal - Payout Failed (GST Refund)`,
                                amount: gstAmountToRefund,
                                comm: 0,
                                surcharge: 0,
                                openingAmt: currentBal,
                                closingAmt: newBal,
                                credit: gstAmountToRefund,
                                debit: 0,
                                transactionId: txnId,
                                paymentStatus: 'REFUNDED',
                                addedBy: existingPayout.refId,
                                updatedBy: existingPayout.refId
                            }),
                            dbService.update(model.gstHistory, { id: gstRecord.id }, {
                                status: 'FAILED',
                                updatedBy: existingPayout.refId
                            })
                        );
                        console.log(`[ASL Payout Callback] Reversed GST of ${gstAmountToRefund} to ${aepsWalletCol} for refId: ${gstRecord.refId}`);
                    }
                }

                await Promise.all([...reversalUpdates, ...reversalHistoryPromises]);
                console.log(`[ASL Payout Callback] Reversed ${allHistories.length} wallet entries for txnId: ${txnId}`);

            } else {
                // Fallback: no walletHistory found — just refund payout amount to initiator's AEPS wallet
                console.warn(`[ASL Payout Callback] No walletHistory found for txnId: ${txnId}, attempting fallback refund`);
                const amountToRefund = round4(existingPayout.amount || 0);
                if (amountToRefund > 0) {
                    const walletRecord = await dbService.findOne(model.wallet, {
                        refId: existingPayout.refId,
                        companyId: existingPayout.companyId
                    });
                    if (walletRecord) {
                        const currentBal = round4(walletRecord[aepsWalletCol] || 0);
                        const newBal = round4(currentBal + amountToRefund);
                        await dbService.update(model.wallet, { id: walletRecord.id }, {
                            [aepsWalletCol]: newBal,
                            updatedBy: existingPayout.refId
                        });
                        await dbService.createOne(model.walletHistory, {
                            refId: existingPayout.refId,
                            companyId: existingPayout.companyId,
                            walletType: aepsWalletCol,
                            operator: 'Payout1',
                            remark: `Reversal - Payout Failed`,
                            amount: amountToRefund,
                            comm: 0, surcharge: 0,
                            openingAmt: currentBal,
                            closingAmt: newBal,
                            credit: amountToRefund, debit: 0,
                            transactionId: txnId,
                            paymentStatus: 'REFUNDED',
                            addedBy: existingPayout.refId,
                            updatedBy: existingPayout.refId
                        });
                        console.log(`[ASL Payout Callback] Fallback refund of ${amountToRefund} applied to ${aepsWalletCol} for refId: ${existingPayout.refId}`);

                        if (gstRecord && gstRecord.amount > 0 && gstRecord.status !== 'FAILED') {
                            const gstAmountToRefund = round4(gstRecord.amount);
                            const currentBalAfterFallback = round4(newBal); // Using the balance *after* the base refund
                            const finalBalWithGst = round4(currentBalAfterFallback + gstAmountToRefund);

                            await dbService.update(model.wallet, { id: walletRecord.id }, {
                                [aepsWalletCol]: finalBalWithGst,
                                updatedBy: existingPayout.refId
                            });
                            await dbService.createOne(model.walletHistory, {
                                refId: gstRecord.refId,
                                companyId: gstRecord.companyId,
                                walletType: aepsWalletCol,
                                operator: 'GST Reversal',
                                remark: `Reversal - Payout Failed (GST Refund)`,
                                amount: gstAmountToRefund,
                                comm: 0, surcharge: 0,
                                openingAmt: currentBalAfterFallback,
                                closingAmt: finalBalWithGst,
                                credit: gstAmountToRefund, debit: 0,
                                transactionId: txnId,
                                paymentStatus: 'REFUNDED',
                                addedBy: existingPayout.refId,
                                updatedBy: existingPayout.refId
                            });
                            await dbService.update(model.gstHistory, { id: gstRecord.id }, {
                                status: 'FAILED',
                                updatedBy: existingPayout.refId
                            });
                            console.log(`[ASL Payout Callback] Fallback GST refund of ${gstAmountToRefund} applied to ${aepsWalletCol}`);
                        }
                    }
                }
            }
        }

        // ── Update payoutHistory record ───────────────────────────────────────
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
            previousStatus,
            newStatus,
            bankRef,
            innerStatus,
            agentTransactionId,
            code,
            reversed: newStatus === 'FAILED' && (previousStatus === 'SUCCESS' || previousStatus === 'PENDING')
        });

        return res.send('OK');
    } catch (error) {
        console.error('[ASL Payout Callback] Error:', error, {
            body: req.body
        });
        return res.send('OK');
    }
};

const aslAEPSCallback = async (req, res) => {
    try {
        const payload = req.body || {};
        console.log('[ASL AEPS Callback] Incoming payload:', JSON.stringify(payload));

        // ── Parse callback fields per ASL AEPS spec ───────────────────────────
        const {
            fingpayTransactionId,
            merchantTranId,
            transactionStatus,       // boolean: true = success
            transactionStatusCode,   // '00' = success
            transactionStatusMessage,
            bankRRN,
        } = payload;

        if (!merchantTranId) {
            console.error('[ASL AEPS Callback] Missing merchantTranId in payload');
            return res.send('OK');
        }

        // Resolve status
        const isSuccess =
            transactionStatus === true ||
            transactionStatus === 'true' ||
            transactionStatusCode === '00' ||
            (typeof transactionStatusMessage === 'string' &&
                transactionStatusMessage.toUpperCase() === 'SUCCESS');

        const newStatus = isSuccess ? 'SUCCESS' : 'FAILED';
        console.log(`[ASL AEPS Callback] merchantTranId: ${merchantTranId}, resolved status: ${newStatus}`);

        // ── Find aepsHistory by merchantTransactionId ─────────────────────────
        const aepsHistoryRecord = await dbService.findOne(model.aepsHistory, {
            merchantTransactionId: merchantTranId
        });

        if (!aepsHistoryRecord) {
            console.error('[ASL AEPS Callback] aepsHistory not found for merchantTranId:', merchantTranId);
            return res.send('OK');
        }

        const previousStatus = aepsHistoryRecord.status;

        // ── FAILURE: Reverse all AEPS wallet impacts ──────────────────────────
        if (newStatus === 'FAILED' && (previousStatus === 'SUCCESS' || previousStatus === 'PENDING')) {
            console.log(`[ASL AEPS Callback] Reversing AEPS wallets for merchantTranId: ${merchantTranId}, txnId: ${aepsHistoryRecord.transactionId}`);

            const txnId = aepsHistoryRecord.transactionId;

            // All AEPS walletHistory entries for this transaction (retailer + dist + MD + company + SA)
            const aepsWalletHistories = await dbService.findAll(model.walletHistory, {
                transactionId: txnId,
                walletType: 'AEPS'
            });

            if (aepsWalletHistories && aepsWalletHistories.length > 0) {
                const reversalUpdates = [];
                const reversalHistoryPromises = [];

                for (const history of aepsWalletHistories) {
                    const netImpact = round4((history.credit || 0) - (history.debit || 0));
                    if (netImpact === 0) continue;

                    const walletRecord = await dbService.findOne(model.wallet, {
                        refId: history.refId,
                        companyId: history.companyId
                    });
                    if (!walletRecord) continue;

                    const currentBal = round4(walletRecord.apes1Wallet || 0);
                    const newBal = round4(currentBal - netImpact);

                    reversalUpdates.push(
                        dbService.update(model.wallet, { id: walletRecord.id }, {
                            apes1Wallet: newBal,
                            updatedBy: aepsHistoryRecord.refId
                        })
                    );

                    reversalHistoryPromises.push(
                        dbService.createOne(model.walletHistory, {
                            refId: history.refId,
                            companyId: history.companyId,
                            walletType: 'AEPS',
                            operator: history.operator || '',
                            remark: `Reversal - AEPS ${aepsHistoryRecord.aepsTxnType || ''} Failed`,
                            amount: history.amount || 0,
                            comm: 0,
                            surcharge: 0,
                            openingAmt: currentBal,
                            closingAmt: newBal,
                            credit: history.debit || 0,   // swap
                            debit: history.credit || 0,   // swap
                            transactionId: txnId,
                            paymentStatus: 'REFUNDED',
                            addedBy: aepsHistoryRecord.refId,
                            updatedBy: aepsHistoryRecord.refId
                        })
                    );
                }

                await Promise.all([...reversalUpdates, ...reversalHistoryPromises]);
                console.log(`[ASL AEPS Callback] Reversed ${aepsWalletHistories.length} wallet entries for txnId: ${txnId}`);

            } else {
                // Fallback: reverse credit stored on aepsHistory itself
                console.warn(`[ASL AEPS Callback] No walletHistory found for txnId: ${txnId}, attempting fallback refund`);
                const creditToReverse = round4(aepsHistoryRecord.credit || 0);
                if (creditToReverse > 0) {
                    const walletRecord = await dbService.findOne(model.wallet, {
                        refId: aepsHistoryRecord.refId,
                        companyId: aepsHistoryRecord.companyId
                    });
                    if (walletRecord) {
                        const currentBal = round4(walletRecord.apes1Wallet || 0);
                        const newBal = round4(currentBal - creditToReverse);
                        await dbService.update(model.wallet, { id: walletRecord.id }, {
                            apes1Wallet: newBal,
                            updatedBy: aepsHistoryRecord.refId
                        });
                        await dbService.createOne(model.walletHistory, {
                            refId: aepsHistoryRecord.refId,
                            companyId: aepsHistoryRecord.companyId,
                            walletType: 'AEPS',
                            operator: aepsHistoryRecord.operator || '',
                            remark: `Reversal - AEPS ${aepsHistoryRecord.aepsTxnType || ''} Failed`,
                            amount: aepsHistoryRecord.amount || 0,
                            comm: 0, surcharge: 0,
                            openingAmt: currentBal, closingAmt: newBal,
                            credit: 0, debit: creditToReverse,
                            transactionId: txnId,
                            paymentStatus: 'REFUNDED',
                            addedBy: aepsHistoryRecord.refId,
                            updatedBy: aepsHistoryRecord.refId
                        });
                        console.log(`[ASL AEPS Callback] Fallback refund of ${creditToReverse} applied for refId: ${aepsHistoryRecord.refId}`);
                    }
                }
            }

            // Zero-out commissions on aepsHistory
            await dbService.update(model.aepsHistory, { id: aepsHistoryRecord.id }, {
                status: 'FAILED',
                superadminComm: 0,
                whitelabelComm: 0,
                masterDistributorCom: 0,
                distributorCom: 0,
                retailerCom: 0,
                superadminCommTDS: 0,
                whitelabelCommTDS: 0,
                masterDistributorComTDS: 0,
                distributorComTDS: 0,
                retailerComTDS: 0,
                credit: 0,
                updatedBy: aepsHistoryRecord.refId
            });

        } else if (newStatus === 'SUCCESS' && previousStatus === 'PENDING') {
            // Confirm PENDING → SUCCESS (wallets were already credited at transaction time)
            await dbService.update(model.aepsHistory, { id: aepsHistoryRecord.id }, {
                status: 'SUCCESS',
                updatedBy: aepsHistoryRecord.refId
            });
        }

        // Always update gateway confirmation fields
        await dbService.update(model.aepsHistory, { id: aepsHistoryRecord.id }, {
            status: newStatus,
            bankRRN: bankRRN || aepsHistoryRecord.bankRRN,
            fpTransactionId: fingpayTransactionId || aepsHistoryRecord.fpTransactionId,
            message: transactionStatusMessage || aepsHistoryRecord.message,
            responseCode: transactionStatusCode || aepsHistoryRecord.responseCode,
            responsePayload: payload,
            updatedBy: aepsHistoryRecord.refId
        });

        console.log('[ASL AEPS Callback] Completed:', {
            merchantTranId,
            previousStatus,
            newStatus,
            bankRRN,
            fingpayTransactionId,
            reversed: newStatus === 'FAILED' && (previousStatus === 'SUCCESS' || previousStatus === 'PENDING')
        });

        return res.send('OK');
    } catch (error) {
        console.error('[ASL AEPS Callback] Error:', error, {
            body: req.body
        });
        return res.send('OK');
    }
};

const a1topupCallback = async (req, res) => {
    try {
        const payload = req.query || {};
        console.log('[A1 TopUp Callback] Incoming query:', JSON.stringify(payload));

        // A1 Top callback fields: txid, status, opid, number, amount, orderid
        // Provider Doc: txid=YOUR ORDER ID, status=Success/Failure, opid=OPERATOR ID
        const {
            txid,
            status,
            opid,
            orderid,
            number,
            amount
        } = payload;

        // txid is our system reference (the order id we sent to A1 Top)
        // Note: Doc says "txid=Unique recharge id provided by you"
        const systemOrderId = txid || orderid;

        if (!systemOrderId || !status) {
            console.error('[A1 TopUp Callback] Missing required parameters:', { txid, status, orderid });
            return res.send('OK');
        }

        const statusStr = String(status).toUpperCase();
        let newStatus;
        if (statusStr === 'SUCCESS' || statusStr === '1') {
            newStatus = 'SUCCESS';
        } else if (statusStr === 'PENDING' || statusStr === '2') {
            newStatus = 'PENDING';
        } else {
            newStatus = 'FAILURE';
        }

        const operatorId = opid && String(opid).trim() !== '' ? opid : null;

        // Update service1Transaction (A1 Top table) only
        const result = await updateService1TransactionStatus(systemOrderId, newStatus, operatorId);

        if (result.success) {
            const serviceType = result.serviceType || result.record?.serviceType;
            console.log('[A1 TopUp Callback] Status updated successfully:', {
                orderid: systemOrderId,
                txid,
                status: newStatus,
                opid: operatorId,
                serviceType,
                previousStatus: result.record?.status,
                number,
                amount
            });
        } else {
            console.error('[A1 TopUp Callback] Failed to update status:', result.message, {
                orderid: systemOrderId,
                txid,
                status: newStatus
            });
        }

        return res.send('OK');
    } catch (error) {
        console.error('[A1 TopUp Callback] Error:', error, {
            body: req.body
        });
        return res.send('OK');
    }
};

module.exports = {
    inspayCallback,
    aslPayoutCallback,
    aslAEPSCallback,
    a1topupCallback
};
