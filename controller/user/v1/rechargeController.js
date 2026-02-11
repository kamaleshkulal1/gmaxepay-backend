const dbService = require('../../../utils/dbService');
const model = require('../../../models');
const inspayService = require('../../../services/inspayService');
const { Op, Sequelize } = require('sequelize');
const { generateTransactionID } = require('../../../utils/transactionID');

const round2 = (num) => {
    const n = Number(num);
    return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
};

const calcSlabAmount = (slab, baseAmount) => {
    if (!slab) return 0;
    const base = Number(baseAmount || 0);
    const rawComm = Number(slab.commAmt || 0);
    if (!Number.isFinite(base) || !Number.isFinite(rawComm)) return 0;

    const amtType = (slab.amtType || 'fix').toLowerCase();
    if (amtType === 'per') {
        return round2((base * rawComm) / 100);
    }
    return round2(rawComm);
};

const recharge = async (req, res) => {
    try {
        const { mobileNumber, opcode, amount, circle, value1, value2, value3, value4 } = req.body;
        
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

        const amountNumber = round2(parseFloat(amount));
        const user = req.user;

        const [existingUser, operator, existingCompany] = await Promise.all([
            dbService.findOne(model.user, { id: user.id, companyId: user.companyId }),
            dbService.findOne(model.operator, { operatorCode: opcode }),
            dbService.findOne(model.company, { id: user.companyId })
        ]);

        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        if (!operator) {
            return res.failure({ message: 'Operator not found' });
        }

        const operatorType = operator.operatorType || 'RECHARGE';

        // Our own custom transaction ID (separate from provider orderid / txid)
        const transactionId = generateTransactionID(existingCompany?.companyName);

        const [response, wallet] = await Promise.all([
            inspayService.Recharge(mobileNumber, opcode, amount, value1, value2, value3, value4),
            model.wallet.findOne({
                where: { refId: user.id, companyId: user.companyId }
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
                refId: user.id,
                companyId: user.companyId,
                roleType: user.userType,
                mainWallet: 0,
                apes1Wallet: 0,
                apes2Wallet: 0,
                addedBy: user.id,
                updatedBy: user.id
            });
        }

        const openingMainWallet = round2(currentWallet.mainWallet || 0);
        
        let retailerComm = 0;
        let distributorComm = 0;
        let masterDistributorComm = 0;
        let companyComm = 0;
        let superAdminComm = 0;
        let retailerNetCredit = 0;

        if (isSuccess && [4, 5].includes(user.userRole)) {
            let distributor;
            let companyAdmin;
            let superAdmin;
            let companySlabComm;
            let SuperAdminSlabComm;
            let masterDistributorCommSlab;
            let distributorCommSlab;
            let masterDistributor;
            let retailer;
            let distributorWallet;
            let companyWallet;
            let superAdminWallet;
            let masterDistributorWallet;
            let retailerWallet;

            if (user.userRole === 4) {
                [
                    distributor,
                    companyAdmin,
                    superAdmin,
                ] = await Promise.all([
                    dbService.findOne(model.user, {
                        id: user.id,
                        companyId: user.companyId,
                        isActive: true
                    }),
                    dbService.findOne(model.user, {
                        companyId: user.companyId,
                        userRole: 2,
                        isActive: true
                    }),
                    dbService.findOne(model.user, {
                        id: 1,
                        companyId: 1,
                        userRole: 1,
                        isActive: true
                    })
                ]);

                if (!distributor) {
                    return res.failure({ message: 'Distributor not found' });
                }
                if (!companyAdmin) {
                    return res.failure({ message: 'Company admin not found' });
                }
                if (!superAdmin) {
                    return res.failure({ message: 'Super admin not found' });
                }

                if (distributor.reportingTo === companyAdmin.id || distributor.reportingTo === null) {
                    [
                        SuperAdminSlabComm,
                        companySlabComm
                    ] = await Promise.all([
                        dbService.findAll(
                            model.commSlab,
                            {
                                companyId: 1,
                                addedBy: superAdmin.id,
                                operatorId: operator.id,
                                operatorType: operatorType
                            },
                            { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }
                        ),
                        dbService.findAll(
                            model.commSlab,
                            {
                                companyId: user.companyId,
                                addedBy: companyAdmin.id,
                                operatorId: operator.id,
                                operatorType: operatorType
                            },
                            { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }
                        )
                    ]);

                    if (!SuperAdminSlabComm || !companySlabComm) {
                        return res.failure({ message: 'Super admin or company admin slab commission not found' });
                    }

                    [
                        superAdminWallet,
                        companyWallet,
                        distributorWallet
                    ] = await Promise.all([
                        dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 }),
                        dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                        dbService.findOne(model.wallet, { refId: distributor.id, companyId: user.companyId })
                    ]);

                    if (!superAdminWallet || !companyWallet || !distributorWallet) {
                        return res.failure({ message: 'Super admin, company admin or distributor wallet not found' });
                    }
                } else if (distributor.reportingTo && distributor.reportingTo !== null) {
                    masterDistributor = await dbService.findOne(model.user, {
                        id: distributor.reportingTo,
                        companyId: user.companyId,
                        isActive: true
                    });

                    if (!masterDistributor) {
                        return res.failure({ message: 'Master distributor not found' });
                    }

                    [
                        SuperAdminSlabComm,
                        companySlabComm,
                        masterDistributorCommSlab
                    ] = await Promise.all([
                        dbService.findAll(
                            model.commSlab,
                            {
                                companyId: 1,
                                addedBy: superAdmin.id,
                                operatorId: operator.id,
                                operatorType: operatorType
                            },
                            { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }
                        ),
                        dbService.findAll(
                            model.commSlab,
                            {
                                companyId: user.companyId,
                                addedBy: companyAdmin.id,
                                operatorId: operator.id,
                                operatorType: operatorType
                            },
                            { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }
                        ),
                        dbService.findAll(
                            model.commSlab,
                            {
                                companyId: user.companyId,
                                addedBy: masterDistributor.id,
                                operatorId: operator.id,
                                operatorType: operatorType
                            },
                            { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }
                        )
                    ]);

                    if (!SuperAdminSlabComm || !companySlabComm || !masterDistributorCommSlab) {
                        return res.failure({ message: 'Super admin, company admin or master distributor slab commission not found' });
                    }

                    [
                        superAdminWallet,
                        companyWallet,
                        distributorWallet,
                        masterDistributorWallet
                    ] = await Promise.all([
                        dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 }),
                        dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                        dbService.findOne(model.wallet, { refId: distributor.id, companyId: user.companyId }),
                        dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: user.companyId })
                    ]);

                    if (!superAdminWallet || !companyWallet || !distributorWallet || !masterDistributorWallet) {
                        return res.failure({ message: 'Super admin, company admin, distributor or master distributor wallet not found' });
                    }
                } else {
                    return res.failure({ message: 'Invalid distributor reporting structure' });
                }
            } else if (user.userRole === 5) {
                [retailer, companyAdmin, superAdmin] = await Promise.all([
                    dbService.findOne(model.user, {
                        id: user.id,
                        companyId: user.companyId,
                        isActive: true
                    }),
                    dbService.findOne(model.user, {
                        companyId: user.companyId,
                        userRole: 2,
                        isActive: true
                    }),
                    dbService.findOne(model.user, {
                        id: 1,
                        companyId: 1,
                        userRole: 1,
                        isActive: true
                    })
                ]);
                if (!retailer || !companyAdmin || !superAdmin) {
                    return res.failure({ message: 'Retailer, company admin or super admin not found' });
                }
                if (retailer.reportingTo === companyAdmin.id || retailer.reportingTo === null) {
                    [
                        SuperAdminSlabComm,
                        companySlabComm
                    ] = await Promise.all([
                        dbService.findAll(model.commSlab, {
                            companyId: 1,
                            addedBy: superAdmin.id,
                            operatorId: operator.id,
                            operatorType: operatorType
                        }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                        dbService.findAll(model.commSlab, {
                            companyId: user.companyId,
                            addedBy: companyAdmin.id,
                            operatorId: operator.id,
                            operatorType: operatorType
                        }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] })
                    ]);
                    if (!SuperAdminSlabComm)
                        return res.failure({ message: 'Super admin slab commission not found' });
                    if (!companySlabComm)
                        return res.failure({ message: 'Company admin slab commission not found' });
                    [
                        superAdminWallet,
                        companyWallet,
                        retailerWallet
                    ] = await Promise.all([
                        dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 }),
                        dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                        dbService.findOne(model.wallet, { refId: retailer.id, companyId: user.companyId })
                    ]);

                    if (!superAdminWallet)
                        return res.failure({ message: 'Super admin wallet not found' });
                    if (!companyWallet)
                        return res.failure({ message: 'Company admin wallet not found' });
                    if (!retailerWallet)
                        return res.failure({ message: 'Retailer wallet not found' });
                } else if (retailer.reportingTo && retailer.reportingTo !== null) {
                    const reportingUser = await dbService.findOne(model.user, {
                        id: retailer.reportingTo,
                        companyId: user.companyId,
                        isActive: true
                    });

                    if (!reportingUser) {
                        return res.failure({ message: 'Reporting user not found' });
                    }

                    if (reportingUser.userRole === 3) {
                        masterDistributor = reportingUser;
                        [
                            SuperAdminSlabComm,
                            companySlabComm,
                            masterDistributorCommSlab
                        ] = await Promise.all([
                            dbService.findAll(model.commSlab, {
                                companyId: 1,
                                addedBy: superAdmin.id,
                                operatorId: operator.id,
                                operatorType: operatorType
                            }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                            dbService.findAll(model.commSlab, {
                                companyId: user.companyId,
                                addedBy: companyAdmin.id,
                                operatorId: operator.id,
                                operatorType: operatorType
                            }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                            dbService.findAll(model.commSlab, {
                                companyId: user.companyId,
                                addedBy: masterDistributor.id,
                                operatorId: operator.id,
                                operatorType: operatorType
                            }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] })
                        ]);
                        if (!SuperAdminSlabComm || !companySlabComm || !masterDistributorCommSlab)
                            return res.failure({ message: 'Super admin, company admin or master distributor slab commission not found' });
                        [
                            superAdminWallet,
                            companyWallet,
                            retailerWallet,
                            masterDistributorWallet
                        ] = await Promise.all([
                            dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 }),
                            dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                            dbService.findOne(model.wallet, { refId: retailer.id, companyId: user.companyId }),
                            dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: user.companyId })
                        ]);
                        if (!superAdminWallet || !companyWallet || !retailerWallet || !masterDistributorWallet)
                            return res.failure({ message: 'Super admin, company admin, retailer or master distributor wallet not found' });
                    } else if (reportingUser.userRole === 4) {
                        distributor = reportingUser;
                        if (distributor.reportingTo && distributor.reportingTo !== null && distributor.reportingTo !== companyAdmin.id) {
                            masterDistributor = await dbService.findOne(model.user, {
                                id: distributor.reportingTo,
                                companyId: user.companyId,
                                isActive: true
                            });
                            if (masterDistributor && masterDistributor.userRole === 3) {
                                [
                                    SuperAdminSlabComm,
                                    companySlabComm,
                                    masterDistributorCommSlab,
                                    distributorCommSlab
                                ] = await Promise.all([
                                    dbService.findAll(model.commSlab, {
                                        companyId: 1,
                                        addedBy: superAdmin.id,
                                        operatorId: operator.id,
                                        operatorType: operatorType
                                    }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                                    dbService.findAll(model.commSlab, {
                                        companyId: user.companyId,
                                        addedBy: companyAdmin.id,
                                        operatorId: operator.id,
                                        operatorType: operatorType
                                    }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                                    dbService.findAll(model.commSlab, {
                                        companyId: user.companyId,
                                        addedBy: masterDistributor.id,
                                        operatorId: operator.id,
                                        operatorType: operatorType
                                    }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                                    dbService.findAll(model.commSlab, {
                                        companyId: user.companyId,
                                        addedBy: distributor.id,
                                        operatorId: operator.id,
                                        operatorType: operatorType
                                    }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] })
                                ]);
                                if (!SuperAdminSlabComm || !companySlabComm || !masterDistributorCommSlab || !distributorCommSlab)
                                    return res.failure({ message: 'Super admin, company admin, master distributor or distributor slab commission not found' });
                                [
                                    superAdminWallet,
                                    companyWallet,
                                    retailerWallet,
                                    masterDistributorWallet,
                                    distributorWallet
                                ] = await Promise.all([
                                    dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 }),
                                    dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                                    dbService.findOne(model.wallet, { refId: retailer.id, companyId: user.companyId }),
                                    dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: user.companyId }),
                                    dbService.findOne(model.wallet, { refId: distributor.id, companyId: user.companyId })
                                ]);
                                if (!superAdminWallet || !companyWallet || !retailerWallet || !masterDistributorWallet || !distributorWallet)
                                    return res.failure({ message: 'Super admin, company admin, retailer, master distributor or distributor wallet not found' });
                            } else {
                                [
                                    SuperAdminSlabComm,
                                    companySlabComm,
                                    distributorCommSlab
                                ] = await Promise.all([
                                    dbService.findAll(model.commSlab, {
                                        companyId: 1,
                                        addedBy: superAdmin.id,
                                        operatorId: operator.id,
                                        operatorType: operatorType
                                    }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                                    dbService.findAll(model.commSlab, {
                                        companyId: user.companyId,
                                        addedBy: companyAdmin.id,
                                        operatorId: operator.id,
                                        operatorType: operatorType
                                    }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                                    dbService.findAll(model.commSlab, {
                                        companyId: user.companyId,
                                        addedBy: distributor.id,
                                        operatorId: operator.id,
                                        operatorType: operatorType
                                    }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] })
                                ]);
                                if (!SuperAdminSlabComm || !companySlabComm || !distributorCommSlab)
                                    return res.failure({ message: 'Super admin, company admin or distributor slab commission not found' });
                                [
                                    superAdminWallet,
                                    companyWallet,
                                    retailerWallet,
                                    distributorWallet
                                ] = await Promise.all([
                                    dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 }),
                                    dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                                    dbService.findOne(model.wallet, { refId: retailer.id, companyId: user.companyId }),
                                    dbService.findOne(model.wallet, { refId: distributor.id, companyId: user.companyId })
                                ]);
                                if (!superAdminWallet || !companyWallet || !retailerWallet || !distributorWallet)
                                    return res.failure({ message: 'Super admin, company admin, retailer or distributor wallet not found' });
                            }
                        } else {
                            [
                                SuperAdminSlabComm,
                                companySlabComm,
                                distributorCommSlab
                            ] = await Promise.all([
                                dbService.findAll(model.commSlab, {
                                    companyId: 1,
                                    addedBy: superAdmin.id,
                                    operatorId: operator.id,
                                    operatorType: operatorType
                                }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                                dbService.findAll(model.commSlab, {
                                    companyId: user.companyId,
                                    addedBy: companyAdmin.id,
                                    operatorId: operator.id,
                                    operatorType: operatorType
                                }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                                dbService.findAll(model.commSlab, {
                                    companyId: user.companyId,
                                    addedBy: distributor.id,
                                    operatorId: operator.id,
                                    operatorType: operatorType
                                }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] })
                            ]);
                            if (!SuperAdminSlabComm || !companySlabComm || !distributorCommSlab)
                                return res.failure({ message: 'Super admin, company admin or distributor slab commission not found' });
                            [
                                superAdminWallet,
                                companyWallet,
                                retailerWallet,
                                distributorWallet
                            ] = await Promise.all([
                                dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 }),
                                dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: user.companyId }),
                                dbService.findOne(model.wallet, { refId: retailer.id, companyId: user.companyId }),
                                dbService.findOne(model.wallet, { refId: distributor.id, companyId: user.companyId })
                            ]);
                            if (!superAdminWallet || !companyWallet || !retailerWallet || !distributorWallet)
                                return res.failure({ message: 'Super admin, company admin, retailer or distributor wallet not found' });
                        }
                    } else {
                        return res.failure({ message: 'Invalid retailer reporting structure' });
                    }
                }
            }

            const operatorName = operator.operatorName || 'Recharge';
            const remarkText = `Recharge commission`;

            if (user.userRole === 4) {
                if (distributor.reportingTo === companyAdmin.id || distributor.reportingTo === null) {
                    const distSlab = companySlabComm?.find(
                        (c) => c.roleType === 4 || c.roleName === 'DI'
                    );
                    const adminSlab = SuperAdminSlabComm?.find(
                        (c) => c.roleType === 1 || c.roleName === 'AD'
                    );
                    const companySlab = companySlabComm?.find(
                        (c) => c.roleType === 2 || c.roleName === 'WU'
                    );

                    const distBaseAmount = amountNumber;
                    distributorComm = calcSlabAmount(distSlab, distBaseAmount);
                    companyComm = calcSlabAmount(companySlab, distributorComm);
                    superAdminComm = calcSlabAmount(adminSlab, distributorComm);

                    retailerNetCredit = distributorComm;

                    const distOpeningBalance = parseFloat(distributorWallet.mainWallet || 0);
                    const companyOpeningBalance = parseFloat(companyWallet.mainWallet || 0);
                    const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

                    const distClosingBalance = parseFloat((distOpeningBalance + distributorComm).toFixed(2));
                    const companyClosingBalance = parseFloat((companyOpeningBalance + companyComm).toFixed(2));
                    const adminClosingBalance = parseFloat((adminOpeningBalance + superAdminComm).toFixed(2));

                    await Promise.all([
                        dbService.update(
                            model.wallet,
                            { id: distributorWallet.id },
                            { mainWallet: distClosingBalance, updatedBy: distributor.id }
                        ),
                        dbService.update(
                            model.wallet,
                            { id: companyWallet.id },
                            { mainWallet: companyClosingBalance, updatedBy: companyAdmin.id }
                        ),
                        dbService.update(
                            model.wallet,
                            { id: superAdminWallet.id },
                            { mainWallet: adminClosingBalance, updatedBy: superAdmin.id }
                        )
                    ]);

                    await Promise.all([
                        dbService.createOne(model.walletHistory, {
                            refId: distributor.id,
                            companyId: user.companyId,
                            walletType: 'mainWallet',
                            operator: operatorName,
                            remark: remarkText,
                            amount: amountNumber,
                            comm: distributorComm,
                            surcharge: 0,
                            openingAmt: distOpeningBalance,
                            closingAmt: distClosingBalance,
                            credit: distributorComm,
                            debit: 0,
                            transactionId,
                            paymentStatus: 'SUCCESS',
                            addedBy: distributor.id,
                            updatedBy: distributor.id
                        }),
                        dbService.createOne(model.walletHistory, {
                            refId: companyAdmin.id,
                            companyId: user.companyId,
                            walletType: 'mainWallet',
                            operator: operatorName,
                            remark: `${remarkText} - company commission`,
                            amount: amountNumber,
                            comm: companyComm,
                            surcharge: 0,
                            openingAmt: companyOpeningBalance,
                            closingAmt: companyClosingBalance,
                            credit: companyComm,
                            debit: 0,
                            transactionId,
                            paymentStatus: 'SUCCESS',
                            addedBy: companyAdmin.id,
                            updatedBy: companyAdmin.id
                        }),
                        dbService.createOne(model.walletHistory, {
                            refId: superAdmin.id,
                            companyId: 1,
                            walletType: 'mainWallet',
                            operator: operatorName,
                            remark: `${remarkText} - admin commission`,
                            amount: amountNumber,
                            comm: superAdminComm,
                            surcharge: 0,
                            openingAmt: adminOpeningBalance,
                            closingAmt: adminClosingBalance,
                            credit: superAdminComm,
                            debit: 0,
                            transactionId,
                            paymentStatus: 'SUCCESS',
                            addedBy: superAdmin.id,
                            updatedBy: superAdmin.id
                        })
                    ]);
                } else if (distributor.reportingTo && distributor.reportingTo !== null) {
                    const distSlab = masterDistributorCommSlab?.find(
                        (c) => c.roleType === 4 || c.roleName === 'DI'
                    );
                    const adminSlab = SuperAdminSlabComm?.find(
                        (c) => c.roleType === 1 || c.roleName === 'AD'
                    );
                    const companySlab = companySlabComm?.find(
                        (c) => c.roleType === 2 || c.roleName === 'WU'
                    );
                    const mdSlab = masterDistributorCommSlab?.find(
                        (c) => c.roleType === 3 || c.roleName === 'MD'
                    );

                    const distBaseAmount = amountNumber;
                    distributorComm = calcSlabAmount(distSlab, distBaseAmount);
                    masterDistributorComm = calcSlabAmount(mdSlab, distributorComm);
                    companyComm = calcSlabAmount(companySlab, masterDistributorComm);
                    superAdminComm = calcSlabAmount(adminSlab, masterDistributorComm);

                    retailerNetCredit = distributorComm;

                    const distOpeningBalance = parseFloat(distributorWallet.mainWallet || 0);
                    const mdOpeningBalance = parseFloat(masterDistributorWallet.mainWallet || 0);
                    const companyOpeningBalance = parseFloat(companyWallet.mainWallet || 0);
                    const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

                    const distClosingBalance = parseFloat((distOpeningBalance + distributorComm).toFixed(2));
                    const mdClosingBalance = parseFloat((mdOpeningBalance + masterDistributorComm).toFixed(2));
                    const companyClosingBalance = parseFloat((companyOpeningBalance + companyComm).toFixed(2));
                    const adminClosingBalance = parseFloat((adminOpeningBalance + superAdminComm).toFixed(2));

                    await Promise.all([
                        dbService.update(
                            model.wallet,
                            { id: distributorWallet.id },
                            { mainWallet: distClosingBalance, updatedBy: distributor.id }
                        ),
                        dbService.update(
                            model.wallet,
                            { id: masterDistributorWallet.id },
                            { mainWallet: mdClosingBalance, updatedBy: masterDistributor.id }
                        ),
                        dbService.update(
                            model.wallet,
                            { id: companyWallet.id },
                            { mainWallet: companyClosingBalance, updatedBy: companyAdmin.id }
                        ),
                        dbService.update(
                            model.wallet,
                            { id: superAdminWallet.id },
                            { mainWallet: adminClosingBalance, updatedBy: superAdmin.id }
                        )
                    ]);

                    await Promise.all([
                        dbService.createOne(model.walletHistory, {
                            refId: distributor.id,
                            companyId: user.companyId,
                            walletType: 'mainWallet',
                            operator: operatorName,
                            remark: remarkText,
                            amount: amountNumber,
                            comm: distributorComm,
                            surcharge: 0,
                            openingAmt: distOpeningBalance,
                            closingAmt: distClosingBalance,
                            credit: distributorComm,
                            debit: 0,
                            transactionId,
                            paymentStatus: 'SUCCESS',
                            addedBy: distributor.id,
                            updatedBy: distributor.id
                        }),
                        dbService.createOne(model.walletHistory, {
                            refId: masterDistributor.id,
                            companyId: user.companyId,
                            walletType: 'mainWallet',
                            operator: operatorName,
                            remark: `${remarkText} - master distributor commission`,
                            amount: amountNumber,
                            comm: masterDistributorComm,
                            surcharge: 0,
                            openingAmt: mdOpeningBalance,
                            closingAmt: mdClosingBalance,
                            credit: masterDistributorComm,
                            debit: 0,
                            transactionId,
                            paymentStatus: 'SUCCESS',
                            addedBy: masterDistributor.id,
                            updatedBy: masterDistributor.id
                        }),
                        dbService.createOne(model.walletHistory, {
                            refId: companyAdmin.id,
                            companyId: user.companyId,
                            walletType: 'mainWallet',
                            operator: operatorName,
                            remark: `${remarkText} - company commission`,
                            amount: amountNumber,
                            comm: companyComm,
                            surcharge: 0,
                            openingAmt: companyOpeningBalance,
                            closingAmt: companyClosingBalance,
                            credit: companyComm,
                            debit: 0,
                            transactionId,
                            paymentStatus: 'SUCCESS',
                            addedBy: companyAdmin.id,
                            updatedBy: companyAdmin.id
                        }),
                        dbService.createOne(model.walletHistory, {
                            refId: superAdmin.id,
                            companyId: 1,
                            walletType: 'mainWallet',
                            operator: operatorName,
                            remark: `${remarkText} - admin commission`,
                            amount: amountNumber,
                            comm: superAdminComm,
                            surcharge: 0,
                            openingAmt: adminOpeningBalance,
                            closingAmt: adminClosingBalance,
                            credit: superAdminComm,
                            debit: 0,
                            transactionId,
                            paymentStatus: 'SUCCESS',
                            addedBy: superAdmin.id,
                            updatedBy: superAdmin.id
                        })
                    ]);
                }
            } else if (user.userRole === 5) {
                if (retailer.reportingTo === companyAdmin.id || retailer.reportingTo === null) {
                    const retailerSlab = companySlabComm?.find(
                        (c) => c.roleType === 5 || c.roleName === 'RT'
                    );
                    const adminSlab = SuperAdminSlabComm?.find(
                        (c) => c.roleType === 1 || c.roleName === 'AD'
                    );
                    const companySlab = companySlabComm?.find(
                        (c) => c.roleType === 2 || c.roleName === 'WU'
                    );

                    const retailerBaseAmount = amountNumber;
                    retailerComm = calcSlabAmount(retailerSlab, retailerBaseAmount);
                    companyComm = calcSlabAmount(companySlab, retailerComm);
                    superAdminComm = calcSlabAmount(adminSlab, retailerComm);

                    retailerNetCredit = retailerComm;

                    const retailerOpeningBalance = parseFloat(retailerWallet.mainWallet || 0);
                    const companyOpeningBalance = parseFloat(companyWallet.mainWallet || 0);
                    const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

                    const retailerClosingBalance = parseFloat((retailerOpeningBalance + retailerComm).toFixed(2));
                    const companyClosingBalance = parseFloat((companyOpeningBalance + companyComm).toFixed(2));
                    const adminClosingBalance = parseFloat((adminOpeningBalance + superAdminComm).toFixed(2));

                    await Promise.all([
                        dbService.update(
                            model.wallet,
                            { id: retailerWallet.id },
                            { mainWallet: retailerClosingBalance, updatedBy: retailer.id }
                        ),
                        dbService.update(
                            model.wallet,
                            { id: companyWallet.id },
                            { mainWallet: companyClosingBalance, updatedBy: companyAdmin.id }
                        ),
                        dbService.update(
                            model.wallet,
                            { id: superAdminWallet.id },
                            { mainWallet: adminClosingBalance, updatedBy: superAdmin.id }
                        )
                    ]);

                    await Promise.all([
                        dbService.createOne(model.walletHistory, {
                            refId: retailer.id,
                            companyId: user.companyId,
                            walletType: 'mainWallet',
                            operator: operatorName,
                            remark: remarkText,
                            amount: amountNumber,
                            comm: retailerComm,
                            surcharge: 0,
                            openingAmt: retailerOpeningBalance,
                            closingAmt: retailerClosingBalance,
                            credit: retailerComm,
                            debit: 0,
                            transactionId,
                            paymentStatus: 'SUCCESS',
                            addedBy: retailer.id,
                            updatedBy: retailer.id
                        }),
                        dbService.createOne(model.walletHistory, {
                            refId: companyAdmin.id,
                            companyId: user.companyId,
                            walletType: 'mainWallet',
                            operator: operatorName,
                            remark: `${remarkText} - company commission`,
                            amount: amountNumber,
                            comm: companyComm,
                            surcharge: 0,
                            openingAmt: companyOpeningBalance,
                            closingAmt: companyClosingBalance,
                            credit: companyComm,
                            debit: 0,
                            transactionId,
                            paymentStatus: 'SUCCESS',
                            addedBy: companyAdmin.id,
                            updatedBy: companyAdmin.id
                        }),
                        dbService.createOne(model.walletHistory, {
                            refId: superAdmin.id,
                            companyId: 1,
                            walletType: 'mainWallet',
                            operator: operatorName,
                            remark: `${remarkText} - admin commission`,
                            amount: amountNumber,
                            comm: superAdminComm,
                            surcharge: 0,
                            openingAmt: adminOpeningBalance,
                            closingAmt: adminClosingBalance,
                            credit: superAdminComm,
                            debit: 0,
                            transactionId,
                            paymentStatus: 'SUCCESS',
                            addedBy: superAdmin.id,
                            updatedBy: superAdmin.id
                        })
                    ]);
                } else if (retailer.reportingTo && retailer.reportingTo !== null) {
                    const reportingUser = await dbService.findOne(model.user, {
                        id: retailer.reportingTo,
                        companyId: user.companyId,
                        isActive: true
                    });

                    if (reportingUser.userRole === 3) {
                        const retailerSlab = masterDistributorCommSlab?.find(
                            (c) => c.roleType === 5 || c.roleName === 'RT'
                        );
                        const adminSlab = SuperAdminSlabComm?.find(
                            (c) => c.roleType === 1 || c.roleName === 'AD'
                        );
                        const companySlab = companySlabComm?.find(
                            (c) => c.roleType === 2 || c.roleName === 'WU'
                        );
                        const mdSlab = masterDistributorCommSlab?.find(
                            (c) => c.roleType === 3 || c.roleName === 'MD'
                        );

                        const retailerBaseAmount = amountNumber;
                        retailerComm = calcSlabAmount(retailerSlab, retailerBaseAmount);
                        masterDistributorComm = calcSlabAmount(mdSlab, retailerComm);
                        companyComm = calcSlabAmount(companySlab, masterDistributorComm);
                        superAdminComm = calcSlabAmount(adminSlab, masterDistributorComm);

                        retailerNetCredit = retailerComm;

                        const retailerOpeningBalance = parseFloat(retailerWallet.mainWallet || 0);
                        const mdOpeningBalance = parseFloat(masterDistributorWallet.mainWallet || 0);
                        const companyOpeningBalance = parseFloat(companyWallet.mainWallet || 0);
                        const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

                        const retailerClosingBalance = parseFloat((retailerOpeningBalance + retailerComm).toFixed(2));
                        const mdClosingBalance = parseFloat((mdOpeningBalance + masterDistributorComm).toFixed(2));
                        const companyClosingBalance = parseFloat((companyOpeningBalance + companyComm).toFixed(2));
                        const adminClosingBalance = parseFloat((adminOpeningBalance + superAdminComm).toFixed(2));

                        await Promise.all([
                            dbService.update(
                                model.wallet,
                                { id: retailerWallet.id },
                                { mainWallet: retailerClosingBalance, updatedBy: retailer.id }
                            ),
                            dbService.update(
                                model.wallet,
                                { id: masterDistributorWallet.id },
                                { mainWallet: mdClosingBalance, updatedBy: masterDistributor.id }
                            ),
                            dbService.update(
                                model.wallet,
                                { id: companyWallet.id },
                                { mainWallet: companyClosingBalance, updatedBy: companyAdmin.id }
                            ),
                            dbService.update(
                                model.wallet,
                                { id: superAdminWallet.id },
                                { mainWallet: adminClosingBalance, updatedBy: superAdmin.id }
                            )
                        ]);

                        await Promise.all([
                            dbService.createOne(model.walletHistory, {
                                refId: retailer.id,
                                companyId: user.companyId,
                                walletType: 'mainWallet',
                                operator: operatorName,
                                remark: remarkText,
                                amount: amountNumber,
                                comm: retailerComm,
                                surcharge: 0,
                                openingAmt: retailerOpeningBalance,
                                closingAmt: retailerClosingBalance,
                            credit: retailerComm,
                            debit: 0,
                            transactionId,
                                paymentStatus: 'SUCCESS',
                                addedBy: retailer.id,
                                updatedBy: retailer.id
                            }),
                            dbService.createOne(model.walletHistory, {
                                refId: masterDistributor.id,
                                companyId: user.companyId,
                                walletType: 'mainWallet',
                                operator: operatorName,
                                remark: `${remarkText} - master distributor commission`,
                                amount: amountNumber,
                                comm: masterDistributorComm,
                                surcharge: 0,
                                openingAmt: mdOpeningBalance,
                                closingAmt: mdClosingBalance,
                            credit: masterDistributorComm,
                            debit: 0,
                            transactionId,
                                paymentStatus: 'SUCCESS',
                                addedBy: masterDistributor.id,
                                updatedBy: masterDistributor.id
                            }),
                            dbService.createOne(model.walletHistory, {
                                refId: companyAdmin.id,
                                companyId: user.companyId,
                                walletType: 'mainWallet',
                                operator: operatorName,
                                remark: `${remarkText} - company commission`,
                                amount: amountNumber,
                                comm: companyComm,
                                surcharge: 0,
                                openingAmt: companyOpeningBalance,
                                closingAmt: companyClosingBalance,
                            credit: companyComm,
                            debit: 0,
                            transactionId,
                                paymentStatus: 'SUCCESS',
                                addedBy: companyAdmin.id,
                                updatedBy: companyAdmin.id
                            }),
                            dbService.createOne(model.walletHistory, {
                                refId: superAdmin.id,
                                companyId: 1,
                                walletType: 'mainWallet',
                                operator: operatorName,
                                remark: `${remarkText} - admin commission`,
                                amount: amountNumber,
                                comm: superAdminComm,
                                surcharge: 0,
                                openingAmt: adminOpeningBalance,
                                closingAmt: adminClosingBalance,
                            credit: superAdminComm,
                            debit: 0,
                            transactionId,
                                paymentStatus: 'SUCCESS',
                                addedBy: superAdmin.id,
                                updatedBy: superAdmin.id
                            })
                        ]);
                    } else if (reportingUser.userRole === 4) {
                        if (distributor.reportingTo && distributor.reportingTo !== null && distributor.reportingTo !== companyAdmin.id) {
                            if (!masterDistributor || masterDistributor.id !== distributor.reportingTo) {
                                masterDistributor = await dbService.findOne(model.user, {
                                    id: distributor.reportingTo,
                                    companyId: user.companyId,
                                    isActive: true
                                });
                            }
                            if (masterDistributor && masterDistributor.userRole === 3) {
                                const retailerSlab = distributorCommSlab?.find(
                                    (c) => c.roleType === 5 || c.roleName === 'RT'
                                );
                                const adminSlab = SuperAdminSlabComm?.find(
                                    (c) => c.roleType === 1 || c.roleName === 'AD'
                                );
                                const companySlab = companySlabComm?.find(
                                    (c) => c.roleType === 2 || c.roleName === 'WU'
                                );
                                const mdSlab = masterDistributorCommSlab?.find(
                                    (c) => c.roleType === 3 || c.roleName === 'MD'
                                );
                                const distSlab = distributorCommSlab?.find(
                                    (c) => c.roleType === 4 || c.roleName === 'DI'
                                );

                                const retailerBaseAmount = amountNumber;
                                retailerComm = calcSlabAmount(retailerSlab, retailerBaseAmount);
                                distributorComm = calcSlabAmount(distSlab, retailerComm);
                                masterDistributorComm = calcSlabAmount(mdSlab, distributorComm);
                                companyComm = calcSlabAmount(companySlab, masterDistributorComm);
                                superAdminComm = calcSlabAmount(adminSlab, masterDistributorComm);

                                retailerNetCredit = retailerComm;

                                const retailerOpeningBalance = parseFloat(retailerWallet.mainWallet || 0);
                                const distOpeningBalance = parseFloat(distributorWallet.mainWallet || 0);
                                const mdOpeningBalance = parseFloat(masterDistributorWallet.mainWallet || 0);
                                const companyOpeningBalance = parseFloat(companyWallet.mainWallet || 0);
                                const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

                                const retailerClosingBalance = parseFloat((retailerOpeningBalance + retailerComm).toFixed(2));
                                const distClosingBalance = parseFloat((distOpeningBalance + distributorComm).toFixed(2));
                                const mdClosingBalance = parseFloat((mdOpeningBalance + masterDistributorComm).toFixed(2));
                                const companyClosingBalance = parseFloat((companyOpeningBalance + companyComm).toFixed(2));
                                const adminClosingBalance = parseFloat((adminOpeningBalance + superAdminComm).toFixed(2));

                                await Promise.all([
                                    dbService.update(model.wallet, { id: retailerWallet.id }, { mainWallet: retailerClosingBalance, updatedBy: retailer.id }),
                                    dbService.update(model.wallet, { id: distributorWallet.id }, { mainWallet: distClosingBalance, updatedBy: distributor.id }),
                                    dbService.update(model.wallet, { id: masterDistributorWallet.id }, { mainWallet: mdClosingBalance, updatedBy: masterDistributor.id }),
                                    dbService.update(model.wallet, { id: companyWallet.id }, { mainWallet: companyClosingBalance, updatedBy: companyAdmin.id }),
                                    dbService.update(model.wallet, { id: superAdminWallet.id }, { mainWallet: adminClosingBalance, updatedBy: superAdmin.id })
                                ]);

                                await Promise.all([
                                    dbService.createOne(model.walletHistory, {
                                        refId: retailer.id,
                                        companyId: user.companyId,
                                        walletType: 'mainWallet',
                                        operator: operatorName,
                                        remark: remarkText,
                                        amount: amountNumber,
                                        comm: retailerComm,
                                        surcharge: 0,
                                        openingAmt: retailerOpeningBalance,
                                        closingAmt: retailerClosingBalance,
                            credit: retailerComm,
                            debit: 0,
                            transactionId,
                                        paymentStatus: 'SUCCESS',
                                        addedBy: retailer.id,
                                        updatedBy: retailer.id
                                    }),
                                    dbService.createOne(model.walletHistory, {
                                        refId: distributor.id,
                                        companyId: user.companyId,
                                        walletType: 'mainWallet',
                                        operator: operatorName,
                                        remark: `${remarkText} - distributor commission`,
                                        amount: amountNumber,
                                        comm: distributorComm,
                                        surcharge: 0,
                                        openingAmt: distOpeningBalance,
                                        closingAmt: distClosingBalance,
                            credit: distributorComm,
                            debit: 0,
                            transactionId,
                                        paymentStatus: 'SUCCESS',
                                        addedBy: distributor.id,
                                        updatedBy: distributor.id
                                    }),
                                    dbService.createOne(model.walletHistory, {
                                        refId: masterDistributor.id,
                                        companyId: user.companyId,
                                        walletType: 'mainWallet',
                                        operator: operatorName,
                                        remark: `${remarkText} - master distributor commission`,
                                        amount: amountNumber,
                                        comm: masterDistributorComm,
                                        surcharge: 0,
                                        openingAmt: mdOpeningBalance,
                                        closingAmt: mdClosingBalance,
                                        credit: masterDistributorComm,
                                        debit: 0,
                                        transactionId: orderid,
                                        paymentStatus: 'SUCCESS',
                                        addedBy: masterDistributor.id,
                                        updatedBy: masterDistributor.id
                                    }),
                                    dbService.createOne(model.walletHistory, {
                                        refId: companyAdmin.id,
                                        companyId: user.companyId,
                                        walletType: 'mainWallet',
                                        operator: operatorName,
                                        remark: `${remarkText} - company commission`,
                                        amount: amountNumber,
                                        comm: companyComm,
                                        surcharge: 0,
                                        openingAmt: companyOpeningBalance,
                                        closingAmt: companyClosingBalance,
                            credit: companyComm,
                            debit: 0,
                            transactionId,
                                        paymentStatus: 'SUCCESS',
                                        addedBy: companyAdmin.id,
                                        updatedBy: companyAdmin.id
                                    }),
                                    dbService.createOne(model.walletHistory, {
                                        refId: superAdmin.id,
                                        companyId: 1,
                                        walletType: 'mainWallet',
                                        operator: operatorName,
                                        remark: `${remarkText} - admin commission`,
                                        amount: amountNumber,
                                        comm: superAdminComm,
                                        surcharge: 0,
                                        openingAmt: adminOpeningBalance,
                                        closingAmt: adminClosingBalance,
                            credit: superAdminComm,
                            debit: 0,
                            transactionId,
                                        paymentStatus: 'SUCCESS',
                                        addedBy: superAdmin.id,
                                        updatedBy: superAdmin.id
                                    })
                                ]);
                            } else {
                                const retailerSlab = distributorCommSlab?.find(
                                    (c) => c.roleType === 5 || c.roleName === 'RT'
                                );
                                const adminSlab = SuperAdminSlabComm?.find(
                                    (c) => c.roleType === 1 || c.roleName === 'AD'
                                );
                                const companySlab = companySlabComm?.find(
                                    (c) => c.roleType === 2 || c.roleName === 'WU'
                                );
                                const distSlab = distributorCommSlab?.find(
                                    (c) => c.roleType === 4 || c.roleName === 'DI'
                                );

                                const retailerBaseAmount = amountNumber;
                                retailerComm = calcSlabAmount(retailerSlab, retailerBaseAmount);
                                distributorComm = calcSlabAmount(distSlab, retailerComm);
                                companyComm = calcSlabAmount(companySlab, distributorComm);
                                superAdminComm = calcSlabAmount(adminSlab, distributorComm);

                                retailerNetCredit = retailerComm;

                                const retailerOpeningBalance = parseFloat(retailerWallet.mainWallet || 0);
                                const distOpeningBalance = parseFloat(distributorWallet.mainWallet || 0);
                                const companyOpeningBalance = parseFloat(companyWallet.mainWallet || 0);
                                const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

                                const retailerClosingBalance = parseFloat((retailerOpeningBalance + retailerComm).toFixed(2));
                                const distClosingBalance = parseFloat((distOpeningBalance + distributorComm).toFixed(2));
                                const companyClosingBalance = parseFloat((companyOpeningBalance + companyComm).toFixed(2));
                                const adminClosingBalance = parseFloat((adminOpeningBalance + superAdminComm).toFixed(2));

                                await Promise.all([
                                    dbService.update(model.wallet, { id: retailerWallet.id }, { mainWallet: retailerClosingBalance, updatedBy: retailer.id }),
                                    dbService.update(model.wallet, { id: distributorWallet.id }, { mainWallet: distClosingBalance, updatedBy: distributor.id }),
                                    dbService.update(model.wallet, { id: companyWallet.id }, { mainWallet: companyClosingBalance, updatedBy: companyAdmin.id }),
                                    dbService.update(model.wallet, { id: superAdminWallet.id }, { mainWallet: adminClosingBalance, updatedBy: superAdmin.id })
                                ]);

                                await Promise.all([
                                    dbService.createOne(model.walletHistory, {
                                        refId: retailer.id,
                                        companyId: user.companyId,
                                        walletType: 'mainWallet',
                                        operator: operatorName,
                                        remark: remarkText,
                                        amount: amountNumber,
                                        comm: retailerComm,
                                        surcharge: 0,
                                        openingAmt: retailerOpeningBalance,
                                        closingAmt: retailerClosingBalance,
                            credit: retailerComm,
                            debit: 0,
                            transactionId,
                                        paymentStatus: 'SUCCESS',
                                        addedBy: retailer.id,
                                        updatedBy: retailer.id
                                    }),
                                    dbService.createOne(model.walletHistory, {
                                        refId: distributor.id,
                                        companyId: user.companyId,
                                        walletType: 'mainWallet',
                                        operator: operatorName,
                                        remark: `${remarkText} - distributor commission`,
                                        amount: amountNumber,
                                        comm: distributorComm,
                                        surcharge: 0,
                                        openingAmt: distOpeningBalance,
                                        closingAmt: distClosingBalance,
                            credit: distributorComm,
                            debit: 0,
                            transactionId,
                                        paymentStatus: 'SUCCESS',
                                        addedBy: distributor.id,
                                        updatedBy: distributor.id
                                    }),
                                    dbService.createOne(model.walletHistory, {
                                        refId: companyAdmin.id,
                                        companyId: user.companyId,
                                        walletType: 'mainWallet',
                                        operator: operatorName,
                                        remark: `${remarkText} - company commission`,
                                        amount: amountNumber,
                                        comm: companyComm,
                                        surcharge: 0,
                                        openingAmt: companyOpeningBalance,
                                        closingAmt: companyClosingBalance,
                            credit: companyComm,
                            debit: 0,
                            transactionId,
                                        paymentStatus: 'SUCCESS',
                                        addedBy: companyAdmin.id,
                                        updatedBy: companyAdmin.id
                                    }),
                                    dbService.createOne(model.walletHistory, {
                                        refId: superAdmin.id,
                                        companyId: 1,
                                        walletType: 'mainWallet',
                                        operator: operatorName,
                                        remark: `${remarkText} - admin commission`,
                                        amount: amountNumber,
                                        comm: superAdminComm,
                                        surcharge: 0,
                                        openingAmt: adminOpeningBalance,
                                        closingAmt: adminClosingBalance,
                            credit: superAdminComm,
                            debit: 0,
                            transactionId,
                                        paymentStatus: 'SUCCESS',
                                        addedBy: superAdmin.id,
                                        updatedBy: superAdmin.id
                                    })
                                ]);
                            }
                        } else {
                            const retailerSlab = distributorCommSlab?.find(
                                (c) => c.roleType === 5 || c.roleName === 'RT'
                            );
                            const adminSlab = SuperAdminSlabComm?.find(
                                (c) => c.roleType === 1 || c.roleName === 'AD'
                            );
                            const companySlab = companySlabComm?.find(
                                (c) => c.roleType === 2 || c.roleName === 'WU'
                            );
                            const distSlab = distributorCommSlab?.find(
                                (c) => c.roleType === 4 || c.roleName === 'DI'
                            );

                            const retailerBaseAmount = amountNumber;
                            retailerComm = calcSlabAmount(retailerSlab, retailerBaseAmount);
                            distributorComm = calcSlabAmount(distSlab, retailerComm);
                            companyComm = calcSlabAmount(companySlab, distributorComm);
                            superAdminComm = calcSlabAmount(adminSlab, distributorComm);

                            retailerNetCredit = retailerComm;

                            const retailerOpeningBalance = parseFloat(retailerWallet.mainWallet || 0);
                            const distOpeningBalance = parseFloat(distributorWallet.mainWallet || 0);
                            const companyOpeningBalance = parseFloat(companyWallet.mainWallet || 0);
                            const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

                            const retailerClosingBalance = parseFloat((retailerOpeningBalance + retailerComm).toFixed(2));
                            const distClosingBalance = parseFloat((distOpeningBalance + distributorComm).toFixed(2));
                            const companyClosingBalance = parseFloat((companyOpeningBalance + companyComm).toFixed(2));
                            const adminClosingBalance = parseFloat((adminOpeningBalance + superAdminComm).toFixed(2));

                            await Promise.all([
                                dbService.update(model.wallet, { id: retailerWallet.id }, { mainWallet: retailerClosingBalance, updatedBy: retailer.id }),
                                dbService.update(model.wallet, { id: distributorWallet.id }, { mainWallet: distClosingBalance, updatedBy: distributor.id }),
                                dbService.update(model.wallet, { id: companyWallet.id }, { mainWallet: companyClosingBalance, updatedBy: companyAdmin.id }),
                                dbService.update(model.wallet, { id: superAdminWallet.id }, { mainWallet: adminClosingBalance, updatedBy: superAdmin.id })
                            ]);

                            await Promise.all([
                                dbService.createOne(model.walletHistory, {
                                    refId: retailer.id,
                                    companyId: user.companyId,
                                    walletType: 'mainWallet',
                                    operator: operatorName,
                                    remark: remarkText,
                                    amount: amountNumber,
                                    comm: retailerComm,
                                    surcharge: 0,
                                    openingAmt: retailerOpeningBalance,
                                    closingAmt: retailerClosingBalance,
                                    credit: retailerComm,
                                    debit: 0,
                                    transactionId: orderid,
                                    paymentStatus: 'SUCCESS',
                                    addedBy: retailer.id,
                                    updatedBy: retailer.id
                                }),
                                dbService.createOne(model.walletHistory, {
                                    refId: distributor.id,
                                    companyId: user.companyId,
                                    walletType: 'mainWallet',
                                    operator: operatorName,
                                    remark: `${remarkText} - distributor commission`,
                                    amount: amountNumber,
                                    comm: distributorComm,
                                    surcharge: 0,
                                    openingAmt: distOpeningBalance,
                                    closingAmt: distClosingBalance,
                                    credit: distributorComm,
                                    debit: 0,
                                    transactionId: orderid,
                                    paymentStatus: 'SUCCESS',
                                    addedBy: distributor.id,
                                    updatedBy: distributor.id
                                }),
                                dbService.createOne(model.walletHistory, {
                                    refId: companyAdmin.id,
                                    companyId: user.companyId,
                                    walletType: 'mainWallet',
                                    operator: operatorName,
                                    remark: `${remarkText} - company commission`,
                                    amount: amountNumber,
                                    comm: companyComm,
                                    surcharge: 0,
                                    openingAmt: companyOpeningBalance,
                                    closingAmt: companyClosingBalance,
                                    credit: companyComm,
                                    debit: 0,
                                    transactionId: orderid,
                                    paymentStatus: 'SUCCESS',
                                    addedBy: companyAdmin.id,
                                    updatedBy: companyAdmin.id
                                }),
                                dbService.createOne(model.walletHistory, {
                                    refId: superAdmin.id,
                                    companyId: 1,
                                    walletType: 'mainWallet',
                                    operator: operatorName,
                                    remark: `${remarkText} - admin commission`,
                                    amount: amountNumber,
                                    comm: superAdminComm,
                                    surcharge: 0,
                                    openingAmt: adminOpeningBalance,
                                    closingAmt: adminClosingBalance,
                                    credit: superAdminComm,
                                    debit: 0,
                                    transactionId: orderid,
                                    paymentStatus: 'SUCCESS',
                                    addedBy: superAdmin.id,
                                    updatedBy: superAdmin.id
                                })
                            ]);
                        }
                    }
                }
            }
        }

        // Log final commission breakup used for wallet impact
        console.log('Recharge commission summary', {
            userId: user.id,
            userRole: user.userRole,
            orderid,
            amount: amountNumber,
            retailerComm,
            distributorComm,
            masterDistributorComm,
            companyComm,
            superAdminComm,
            retailerNetCredit
        });

        // Deduct recharge amount from payer wallet and then add net commission
        const totalDebitAmount = isSuccess ? amountNumber : 0;
        const netWalletChange = isSuccess ? round2(-totalDebitAmount + retailerNetCredit) : 0;
        const closingMainWallet = round2(openingMainWallet + netWalletChange);
        if(isSuccess) response.operatorName = operator?.operatorName;
        
        const serviceTransactionData = {
            refId: user.id,
            companyId: user.companyId,
            serviceType: 'MobileRecharge',
            mobileNumber,
            opcode,
            circle: circle || null,
            amount: amountNumber,
            orderid,
            transactionId,
            txid: response.txid || null,
            status: paymentStatus,
            opid: response.opid || null,
            message: response.message || null,
            value1: value1 || null,
            value2: value2 || null,
            value3: value3 || null,
            value4: value4 || null,
            apiResponse: response,
            superadminComm: paymentStatus === 'SUCCESS' ? superAdminComm : 0,
            whitelabelComm: paymentStatus === 'SUCCESS' ? companyComm : 0,
            masterDistributorCom: paymentStatus === 'SUCCESS' ? masterDistributorComm : 0,
            distributorCom: paymentStatus === 'SUCCESS' ? distributorComm : 0,
            retailerCom: paymentStatus === 'SUCCESS' ? retailerComm : 0,
            isActive: true,
            addedBy: user.id
        };

        const updates = [
            dbService.createOne(model.serviceTransaction, serviceTransactionData)
        ];

        if (isSuccess && retailerNetCredit > 0) {
            updates.push(
                currentWallet.update({
                    mainWallet: closingMainWallet,
                    updatedBy: user.id
                })
            );
        }

        const [rechargeRecord] = await Promise.all(updates);

        const responseData = {
            orderid,
            transactionId,
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
        const response = await inspayService.operatorFetch(mobileNumber);

        console.log('response', response);
        if (!response) {
            return res.failure({ message: 'Failed to fetch operator information' });
        }
        
        const operatorName = response?.company || response?.operatorName;
        if (!operatorName) {
            return res.failure({ message: response.message || 'Operator name not found in response' });
        }
        
        const operatorNameUpper = operatorName.toUpperCase();
        if (operatorNameUpper !== 'BSNL') {
            const operator = await dbService.findOne(model.operator, { operatorName: operatorNameUpper });
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

const recentRechargeHistory = async (req, res) => {
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

            if (customSearch.name) {
                const searchName = String(customSearch.name).trim();
                if (searchName) {
                    const matchingUsers = await dbService.findAll(model.user, {
                        id: req.user.id,
                        companyId: req.user.companyId,
                        name: {
                            [Op.iLike]: `%${searchName}%`
                        },
                        isDeleted: false
                    }, {
                        attributes: ['id']
                    });

                    const matchingUserIds = matchingUsers.map(u => u.id);
                    if (matchingUserIds.length > 0 && matchingUserIds.includes(req.user.id)) {
                        searchConditions.push({
                            refId: req.user.id
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
                    message: 'Recharge history retrieved successfully',
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

        const result = await dbService.paginate(model.serviceTransaction, query, options);

        if (!result || !result.data || result.data.length === 0) {
            return res.status(200).send({
                status: 'SUCCESS',
                message: 'No recharge history found',
                data: [],
                total: result?.total || 0,
                paginator: result?.paginator || {
                    page: options.page || 1,
                    paginate: options.paginate || 10,
                    totalPages: 0
                }
            });
        }

        const formattedData = result.data.map(transaction => {
            const transactionData = transaction.toJSON ? transaction.toJSON() : transaction;
            const serviceType = transactionData.serviceType;

            if (serviceType === 'MobileRecharge') {
                return {
                    mobileNumber: transactionData.mobileNumber || null,
                    amount: transactionData.amount || null,
                    opcode: transactionData.opcode || null,
                    status: transactionData.status || null
                };
            }

            if (serviceType === 'DTHRecharge') {
                return {
                    dthNumber: transactionData.dthNumber || null,
                    amount: transactionData.amount || null,
                    opcode: transactionData.opcode || null,
                    status: transactionData.status || null
                };
            }

            if (serviceType === 'Pan') {
                return {
                    mobileNumber: transactionData.mobile_number || null,
                    redirect_url: transactionData.redirect_url || null,
                    action: transactionData.action || null,
                    status: transactionData.status || null
                };
            }

            return {
                mobileNumber: transactionData.mobileNumber || transactionData.mobile_number || null,
                amount: transactionData.amount || null,
                opcode: transactionData.opcode || null,
                status: transactionData.status || null
            };
        });

        return res.status(200).send({
            status: 'SUCCESS',
            message: 'Recharge history retrieved successfully',
            data: formattedData,
            total: result.total || 0,
            paginator: result.paginator
        });
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
                    } else {
                        // If user search found no matching users, return empty result
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
            }

            // Only apply search conditions if there are any valid conditions
            if (searchConditions.length > 0) {
                query = {
                    ...query,
                    [Op.and]: [
                        { [Op.or]: searchConditions }
                    ]
                };
            }
            // If no search conditions found, continue with base query (will return all records)
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
};

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

            // Only apply search conditions if there are any valid conditions
            if (searchConditions.length > 0) {
                query = {
                    ...query,
                    [Op.and]: [
                        { [Op.or]: searchConditions }
                    ]
                };
            }
            // If no search conditions found, continue with base query (will return all records)
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
};

module.exports = {
    recharge,
    findMobileNumberOperator,
    getRechargeHistory,
    findAllRechargePlanFetch,
    findRechargeOfferFetch,
    getDownlineRechargeReports,
    getRechargeReports,
    recentRechargeHistory
};