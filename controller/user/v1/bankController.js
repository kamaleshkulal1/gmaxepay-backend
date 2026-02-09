const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const ekycHub = require('../../../services/eKycHub');
const razorpayApi = require('../../../services/razorpayApi');
const { doubleEncrypt, decrypt } = require('../../../utils/doubleCheckUp');
const { generateTransactionID } = require('../../../utils/transactionID');
const key = Buffer.from(process.env.AES_KEY, 'hex');

const getAllCustomerBanks = async (req, res) => {
    try {
        const user = req.user;
        
        // Get all customer banks for the user
        const customerBanks = await dbService.findAll(
            model.customerBank,
            {
                refId: user.id,
                companyId: user.companyId,
                isActive: true
            },
            {
                order: [['isPrimary', 'DESC'], ['createdAt', 'DESC']]
            }
        );
        
        return res.success({
            message: 'Customer banks retrieved successfully',
            data: {
                banks: customerBanks,
                total: customerBanks.length,
                primaryBank: customerBanks.find(bank => bank.isPrimary === true) || null
            }
        });
        
    } catch (error) {
        console.log('Get customer banks error:', error);
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

const getPrimaryCustomerBank = async (req, res) => {
    try {
        const user = req.user;
        
        // Get primary customer bank
        const primaryBank = await dbService.findOne(
            model.customerBank,
            {
                refId: user.id,
                companyId: user.companyId,
                isActive: true,
                isPrimary: true
            }
        );
        
        if (!primaryBank) {
            return res.notFound({ message: 'Primary bank account not found' });
        }
        
        return res.success({
            message: 'Primary bank account retrieved successfully',
            data: primaryBank
        });
        
    } catch (error) {
        console.log('Get primary bank error:', error);
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

const round2 = (num) => {
    const n = Number(num);
    return Number.isFinite(n)
        ? Math.round((n + Number.EPSILON) * 100) / 100
        : 0;
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

const addCustomerBank = async (req, res) => {
    try {
        
        if(![3,4,5].includes(req.user.userRole)){
            return res.failure({ message: 'You are not authorized to add bank details' });
        }
        let masterDistributor;
        let whitelabelUser;
        let superAdmin;
        let companySlabComm;
        let SuperAdminSlabComm;
        let masterDistributorWallet;
        let whitelabelUserWallet;
        let superAdminWallet;
        let distributor;
        let companyAdmin;
        let distributorWallet;
        let companyWallet;
        let masterDistributorComm;
        let retailer;
        let retailerWallet;
        let distributorComm;

        if(req.user.userRole === 3){
            [
                masterDistributor,
                whitelabelUser,
                superAdmin,
                adminIncomingCommission
            ] = await Promise.all([
                dbService.findOne(model.user, {
                    id: req.user.id,
                    companyId: req.user.companyId,
                    isActive: true
                }),
                dbService.findOne(model.user, {
                    companyId: req.user.companyId,
                    userRole: 2,
                    isActive: true
                }),
                dbService.findOne(model.user, {
                    id: 1,
                    companyId: 1,
                    userRole: 1,
                    isActive: true
                }),
                dbService.findOne(model.operator, {
                    operatorType: 'BANK VERIFICATION'
                },{select: ['id', 'commAmt', 'amtType', 'commType']})
            ])
            if(!masterDistributor || !whitelabelUser || !superAdmin){
                return res.failure({ message: 'Master distributor, whitelabel user or super admin not found' });
            }
            [
                companySlabComm,
                SuperAdminSlabComm
            ] = await Promise.all([
                dbService.findAll(
                    model.commSlab,
                    {
                        companyId: req.user.companyId,
                        addedBy: whitelabelUser.id,
                        operatorType: 'BANK VERIFICATION'
                    },
                    { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }
                ),
                dbService.findAll(
                    model.commSlab,
                    {
                        companyId: 1,
                        addedBy: superAdmin.id,
                        operatorType: 'BANK VERIFICATION'
                    },
                    { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }
                )
            ]);
            [
                masterDistributorWallet,
                whitelabelUserWallet,
                superAdminWallet
            ] = await Promise.all([
                dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: req.user.companyId }),
                dbService.findOne(model.wallet, { refId: whitelabelUser.id, companyId: req.user.companyId }),
                dbService.findOne(model.wallet, { refId: 1, companyId: 1 })
            ]);
            if(!masterDistributorWallet || !whitelabelUserWallet || !superAdminWallet){
                return res.failure({ message: 'Master distributor, whitelabel user or super admin wallet not found' });
            }
        }else if(req.user.userRole === 4){
            [
                distributor,
                companyAdmin,
                superAdmin,
            ] = await Promise.all([
                dbService.findOne(model.user, {
                    id: req.user.id,
                    companyId: req.user.companyId,
                    isActive: true
                }),
                dbService.findOne(model.user, {
                    companyId: req.user.companyId,
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

            if(!distributor){
                return res.failure({ message: 'Distributor not found' });
            }
            if(!companyAdmin){
                return res.failure({ message: 'Company admin not found' });
            }
            if(!superAdmin){
                return res.failure({ message: 'Super admin not found' });
            }

            // Check if distributor reports to company admin directly or has no reporting (null)
            if (distributor.reportingTo === companyAdmin.id || distributor.reportingTo === null) {
                // Scenario 1: Distributor reports directly to company admin (no master distributor)
                [
                    SuperAdminSlabComm,
                    companySlabComm
                ] = await Promise.all([
                    dbService.findAll(
                        model.commSlab,
                        {
                            companyId: 1,
                            addedBy: superAdmin.id,
                            operatorType: 'BANK VERIFICATION'
                        },
                        { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }
                    ),
                    dbService.findAll(
                        model.commSlab,
                        {
                            companyId: req.user.companyId,
                            addedBy: companyAdmin.id,
                            operatorType: 'BANK VERIFICATION'
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
                    dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: req.user.companyId }),
                    dbService.findOne(model.wallet, { refId: distributor.id, companyId: req.user.companyId })
                ]);

                if (!superAdminWallet || !companyWallet || !distributorWallet) {
                    return res.failure({ message: 'Super admin, company admin or distributor wallet not found' });
                }
            } else if (distributor.reportingTo && distributor.reportingTo !== null) {
                const masterDistributor = await dbService.findOne(model.user, {
                    id: distributor.reportingTo,
                    companyId: req.user.companyId,
                    isActive: true
                });

                if (!masterDistributor) {
                    return res.failure({ message: 'Master distributor not found' });
                }

                [
                    SuperAdminSlabComm,
                    companySlabComm,
                    masterDistributorComm
                ] = await Promise.all([
                    dbService.findAll(
                        model.commSlab,
                        {
                            companyId: 1,
                            addedBy: superAdmin.id,
                            operatorType: 'BANK VERIFICATION'
                        },
                        { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }
                    ),
                    dbService.findAll(
                        model.commSlab,
                        {
                            companyId: req.user.companyId,
                            addedBy: companyAdmin.id,
                            operatorType: 'BANK VERIFICATION'
                        },
                        { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }
                    ),
                    dbService.findAll(
                        model.commSlab,
                        {
                            companyId: req.user.companyId,
                            addedBy: masterDistributor.id,
                            operatorType: 'BANK VERIFICATION'
                        },
                        { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }
                    )
                ]);

                if (!SuperAdminSlabComm || !companySlabComm || !masterDistributorComm) {
                    return res.failure({ message: 'Super admin, company admin or master distributor slab commission not found' });
                }

                [
                    superAdminWallet,
                    companyWallet,
                    distributorWallet,
                    masterDistributorWallet
                ] = await Promise.all([
                    dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 }),
                    dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: req.user.companyId }),
                    dbService.findOne(model.wallet, { refId: distributor.id, companyId: req.user.companyId }),
                    dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: req.user.companyId })
                ]);

                if (!superAdminWallet || !companyWallet || !distributorWallet || !masterDistributorWallet) {
                    return res.failure({ message: 'Super admin, company admin, distributor or master distributor wallet not found' });
                }
            } else {
                return res.failure({ message: 'Invalid distributor reporting structure' });
            }
        } else if(req.user.userRole === 5){
          [retailer,companyAdmin,superAdmin] = await Promise.all([
            dbService.findOne(model.user, {
              id: req.user.id,
              companyId: req.user.companyId,
              isActive: true
            }),
            dbService.findOne(model.user, {
              companyId: req.user.companyId,
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
          if(!retailer || !companyAdmin || !superAdmin){
            return res.failure({ message: 'Retailer, company admin or super admin not found' });
          }
          if(retailer.reportingTo === companyAdmin.id || retailer.reportingTo === null){
            // Scenario 1: Retailer reports directly to company admin (no master distributor or distributor)
            [
              SuperAdminSlabComm,
              companySlabComm
            ] = await Promise.all([
              dbService.findAll(model.commSlab, { 
                companyId: 1, 
                addedBy: superAdmin.id, 
                operatorType: 'BANK VERIFICATION' 
              }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
              dbService.findAll(model.commSlab, { 
                companyId: req.user.companyId, 
                addedBy: companyAdmin.id, 
                operatorType: 'BANK VERIFICATION' 
              }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] })
            ]);
            if(!SuperAdminSlabComm)
                return res.failure({ message: 'Super admin slab commission not found' });
            if(!companySlabComm)
                return res.failure({ message: 'Company admin slab commission not found' });
            [
                superAdminWallet,
                companyWallet,
                retailerWallet
            ] = await Promise.all([
                dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 }),
                dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: req.user.companyId }),
                dbService.findOne(model.wallet, { refId: retailer.id, companyId: req.user.companyId })
            ]);

            if(!superAdminWallet)
                return res.failure({ message: 'Super admin wallet not found' });
            if(!companyWallet)
                return res.failure({ message: 'Company admin wallet not found' });
            if(!retailerWallet)
                return res.failure({ message: 'Retailer wallet not found' });
          } else if (retailer.reportingTo && retailer.reportingTo !== null) {
            // Find the reporting user to determine if it's master distributor or distributor
            const reportingUser = await dbService.findOne(model.user, {
                id: retailer.reportingTo,
                companyId: req.user.companyId,
                isActive: true
            });

            if (!reportingUser) {
                return res.failure({ message: 'Reporting user not found' });
            }

            if (reportingUser.userRole === 3) {
                // Scenario 2: Retailer reports to master distributor
                masterDistributor = reportingUser;
                [
                    SuperAdminSlabComm,
                    companySlabComm,
                    masterDistributorComm
                ] = await Promise.all([
                    dbService.findAll(model.commSlab, { 
                        companyId: 1, 
                        addedBy: superAdmin.id, 
                        operatorType: 'BANK VERIFICATION' 
                    }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                    dbService.findAll(model.commSlab, { 
                        companyId: req.user.companyId, 
                        addedBy: companyAdmin.id, 
                        operatorType: 'BANK VERIFICATION' 
                    }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                    dbService.findAll(model.commSlab, { 
                        companyId: req.user.companyId, 
                        addedBy: masterDistributor.id, 
                        operatorType: 'BANK VERIFICATION' 
                    }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] })
                ]);
                if(!SuperAdminSlabComm || !companySlabComm || !masterDistributorComm)
                    return res.failure({ message: 'Super admin, company admin or master distributor slab commission not found' });
                [
                    superAdminWallet,
                    companyWallet,
                    retailerWallet,
                    masterDistributorWallet
                ] = await Promise.all([
                    dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 }),
                    dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: req.user.companyId }),
                    dbService.findOne(model.wallet, { refId: retailer.id, companyId: req.user.companyId }),
                    dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: req.user.companyId })
                ]);
                if(!superAdminWallet || !companyWallet || !retailerWallet || !masterDistributorWallet)
                    return res.failure({ message: 'Super admin, company admin, retailer or master distributor wallet not found' });
            } else if (reportingUser.userRole === 4) {
                // Scenario 3: Retailer reports to distributor
                distributor = reportingUser;
                // Check if distributor reports to master distributor
                if (distributor.reportingTo && distributor.reportingTo !== null && distributor.reportingTo !== companyAdmin.id) {
                    masterDistributor = await dbService.findOne(model.user, {
                        id: distributor.reportingTo,
                        companyId: req.user.companyId,
                        isActive: true
                    });
                    if (masterDistributor && masterDistributor.userRole === 3) {
                        // Scenario 4: Retailer -> Distributor -> Master Distributor (all in chain)
                        [
                            SuperAdminSlabComm,
                            companySlabComm,
                            masterDistributorComm,
                            distributorComm
                        ] = await Promise.all([
                            dbService.findAll(model.commSlab, { 
                                companyId: 1, 
                                addedBy: superAdmin.id, 
                                operatorType: 'BANK VERIFICATION' 
                            }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                            dbService.findAll(model.commSlab, { 
                                companyId: req.user.companyId, 
                                addedBy: companyAdmin.id, 
                                operatorType: 'BANK VERIFICATION' 
                            }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                            dbService.findAll(model.commSlab, { 
                                companyId: req.user.companyId, 
                                addedBy: masterDistributor.id, 
                                operatorType: 'BANK VERIFICATION' 
                            }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                            dbService.findAll(model.commSlab, { 
                                companyId: req.user.companyId, 
                                addedBy: distributor.id, 
                                operatorType: 'BANK VERIFICATION' 
                            }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] })
                        ]);
                        if(!SuperAdminSlabComm || !companySlabComm || !masterDistributorComm || !distributorComm)
                            return res.failure({ message: 'Super admin, company admin, master distributor or distributor slab commission not found' });
                        [
                            superAdminWallet,
                            companyWallet,
                            retailerWallet,
                            masterDistributorWallet,
                            distributorWallet
                        ] = await Promise.all([
                            dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 }),
                            dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: req.user.companyId }),
                            dbService.findOne(model.wallet, { refId: retailer.id, companyId: req.user.companyId }),
                            dbService.findOne(model.wallet, { refId: masterDistributor.id, companyId: req.user.companyId }),
                            dbService.findOne(model.wallet, { refId: distributor.id, companyId: req.user.companyId })
                        ]);
                        if(!superAdminWallet || !companyWallet || !retailerWallet || !masterDistributorWallet || !distributorWallet)
                            return res.failure({ message: 'Super admin, company admin, retailer, master distributor or distributor wallet not found' });
                    } else {
                        // Distributor reports to company admin, so only distributor in chain
                        [
                            SuperAdminSlabComm,
                            companySlabComm,
                            distributorComm
                        ] = await Promise.all([
                            dbService.findAll(model.commSlab, { 
                                companyId: 1, 
                                addedBy: superAdmin.id, 
                                operatorType: 'BANK VERIFICATION' 
                            }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                            dbService.findAll(model.commSlab, { 
                                companyId: req.user.companyId, 
                                addedBy: companyAdmin.id, 
                                operatorType: 'BANK VERIFICATION' 
                            }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                            dbService.findAll(model.commSlab, { 
                                companyId: req.user.companyId, 
                                addedBy: distributor.id, 
                                operatorType: 'BANK VERIFICATION' 
                            }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] })
                        ]);
                        if(!SuperAdminSlabComm || !companySlabComm || !distributorComm)
                            return res.failure({ message: 'Super admin, company admin or distributor slab commission not found' });
                        [
                            superAdminWallet,
                            companyWallet,
                            retailerWallet,
                            distributorWallet
                        ] = await Promise.all([
                            dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 }),
                            dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: req.user.companyId }),
                            dbService.findOne(model.wallet, { refId: retailer.id, companyId: req.user.companyId }),
                            dbService.findOne(model.wallet, { refId: distributor.id, companyId: req.user.companyId })
                        ]);
                        if(!superAdminWallet || !companyWallet || !retailerWallet || !distributorWallet)
                            return res.failure({ message: 'Super admin, company admin, retailer or distributor wallet not found' });
                    }
                } else {
                    // Scenario 3: Retailer reports to distributor (distributor reports to company admin)
                    [
                        SuperAdminSlabComm,
                        companySlabComm,
                        distributorComm
                    ] = await Promise.all([
                        dbService.findAll(model.commSlab, { 
                            companyId: 1, 
                            addedBy: superAdmin.id, 
                            operatorType: 'BANK VERIFICATION' 
                        }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                        dbService.findAll(model.commSlab, { 
                            companyId: req.user.companyId, 
                            addedBy: companyAdmin.id, 
                            operatorType: 'BANK VERIFICATION' 
                        }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] }),
                        dbService.findAll(model.commSlab, { 
                            companyId: req.user.companyId, 
                            addedBy: distributor.id, 
                            operatorType: 'BANK VERIFICATION' 
                        }, { select: ['id', 'commAmt', 'roleType', 'amtType', 'commType', 'roleName'] })
                    ]);
                    if(!SuperAdminSlabComm || !companySlabComm || !distributorComm)
                        return res.failure({ message: 'Super admin, company admin or distributor slab commission not found' });
                    [
                        superAdminWallet,
                        companyWallet,
                        retailerWallet,
                        distributorWallet
                    ] = await Promise.all([
                        dbService.findOne(model.wallet, { refId: superAdmin.id, companyId: 1 }),
                        dbService.findOne(model.wallet, { refId: companyAdmin.id, companyId: req.user.companyId }),
                        dbService.findOne(model.wallet, { refId: retailer.id, companyId: req.user.companyId }),
                        dbService.findOne(model.wallet, { refId: distributor.id, companyId: req.user.companyId })
                    ]);
                    if(!superAdminWallet || !companyWallet || !retailerWallet || !distributorWallet)
                        return res.failure({ message: 'Super admin, company admin, retailer or distributor wallet not found' });
                }
            } else {
                return res.failure({ message: 'Invalid retailer reporting structure' });
            }
        }
        const { account_number, ifsc } = req.body;

        // Validate required fields
        if (!account_number || !ifsc) {
            return res.validationError({ 
                message: !account_number ? 'Account number is required' : 'IFSC is required' 
            });
        }

        const existingBanks = await dbService.findAll(
            model.customerBank,
            {
                refId: req.user.id,
                companyId: req.user.companyId,
                isActive: true
            }
        );

        const duplicateBank = existingBanks.find(
            bank => bank.accountNumber === account_number && bank.ifsc === ifsc
        );

        const MAX_BANKS = 5;

        // Check ekycHub cache first, then call APIs in parallel
        const [cachedVerification, razorpayBankData] = await Promise.all([
            // Check cache for bank verification
            (async () => {
                const existingBank = await dbService.findOne(model.ekycHub, {
                    identityNumber1: account_number,
                    identityNumber2: ifsc,
                    identityType: 'BANK'
                });

                if (existingBank) {
                    try {
                        const encryptedData = JSON.parse(existingBank.response);
                        if (encryptedData && encryptedData.encrypted) {
                            const decryptedResponse = decrypt(encryptedData, key);
                            return decryptedResponse ? JSON.parse(decryptedResponse) : encryptedData;
                        }
                        return JSON.parse(existingBank.response);
                    } catch (e) {
                        return existingBank.response;
                    }
                }
                return null;
            })(),
            razorpayApi.bankDetails(ifsc).catch(() => null)
        ]);

        let bankVerification = cachedVerification;
        if (!bankVerification) {
            bankVerification = await ekycHub.bankVerification(account_number, ifsc);
            
            // Cache successful verification
            if (bankVerification && bankVerification.status === 'Success') {
                const encryptedRequest = doubleEncrypt(JSON.stringify({ account_number, ifsc }), key);
                const encryptedResponse = doubleEncrypt(JSON.stringify(bankVerification), key);
                
                dbService.createOne(model.ekycHub, {
                    identityNumber1: account_number,
                    identityNumber2: ifsc,
                    request: JSON.stringify(encryptedRequest),
                    response: JSON.stringify(encryptedResponse),
                    identityType: 'BANK',
                    companyId: req.user.companyId || null,
                    addedBy: req.user.id
                }).catch(err => console.error('Error caching bank verification:', err));
            }
        }

        if (!bankVerification || bankVerification.status !== 'Success') {
            return res.failure({ message: 'Bank verification failed' });
        }

        if (req.user.userRole === 3) {

            const mdSlab = companySlabComm?.find(
                (c) => c.roleType === 3 || c.roleName === 'MD'
            );
            const adminSlab = SuperAdminSlabComm?.find(
                (c) => c.roleType === 1 || c.roleName === 'AD'
            );
            const companySlab = companySlabComm?.find(
                (c) => c.roleType === 2 || c.roleName === 'WU'
            );

            const mdBaseAmount = Number(mdSlab?.commAmt || 0);
            const mdSurchargeAmt = calcSlabAmount(mdSlab, mdBaseAmount);

            const companySurchargeAmt = calcSlabAmount(companySlab, mdSurchargeAmt);
            const adminSurchargeAmt = calcSlabAmount(adminSlab, mdSurchargeAmt);
            const adminIncomingCommission = calcSlabAmount(adminIncomingCommission, mdSurchargeAmt);


            if (mdSurchargeAmt <= 0) {
                return res.failure({
                    message: 'Invalid MD surcharge configuration for bank verification'
                });
            }

            if (adminSurchargeAmt < 0 || companySurchargeAmt < 0) {
                return res.failure({
                    message: 'Invalid admin/whitelabel surcharge configuration for bank verification'
                });
            }

            // Optional: prevent over-distribution (sum of incomes must not exceed MD debit)
            if (adminSurchargeAmt + companySurchargeAmt > mdSurchargeAmt) {
                return res.failure({
                    message: 'Invalid surcharge configuration: total admin + company income is greater than MD debit for bank verification'
                });
            }

            const mdOpeningBalance = parseFloat(masterDistributorWallet.mainWallet || 0);
            const companyOpeningBalance = parseFloat(whitelabelUserWallet.mainWallet || 0);
            const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

            const totalDebitFromMD = mdSurchargeAmt;

            if (mdOpeningBalance < totalDebitFromMD) {
                return res.failure({
                    message: `Insufficient wallet balance. Required: ${totalDebitFromMD}, Available: ${mdOpeningBalance}`
                });
            }

            const mdClosingBalance = parseFloat((mdOpeningBalance - totalDebitFromMD).toFixed(2));
            const companyClosingBalance = parseFloat((companyOpeningBalance + companySurchargeAmt).toFixed(2));
            const adminClosingBalance = parseFloat((adminOpeningBalance + adminSurchargeAmt).toFixed(2));

            const companyDetails = await dbService.findOne(model.company, { id: req.user.companyId });
            const transactionId = generateTransactionID(companyDetails?.companyName || 'BANK_VERIFY');

            const operatorName = 'Bank Verification';
            const remarkText = 'Bank verification charge';

            // Update wallets
            await dbService.update(
                model.wallet,
                { id: masterDistributorWallet.id },
                { mainWallet: mdClosingBalance, updatedBy: masterDistributor.id }
            );

            await dbService.update(
                model.wallet,
                { id: whitelabelUserWallet.id },
                { mainWallet: companyClosingBalance, updatedBy: whitelabelUser.id }
            );

            await dbService.update(
                model.wallet,
                { id: superAdminWallet.id },
                { mainWallet: adminClosingBalance, updatedBy: superAdmin.id }
            );

            // Wallet history for MD (debit)
            await dbService.createOne(model.walletHistory, {
                refId: masterDistributor.id,
                companyId: req.user.companyId,
                walletType: 'mainWallet',
                operator: operatorName,
                remark: remarkText,
                amount: totalDebitFromMD,
                comm: 0,
                surcharge: totalDebitFromMD,
                openingAmt: mdOpeningBalance,
                closingAmt: mdClosingBalance,
                credit: 0,
                debit: totalDebitFromMD,
                transactionId,
                paymentStatus: 'SUCCESS',
                beneficiaryName:
                    bankVerification.nameAtBank ||
                    bankVerification.beneficiary_name ||
                    bankVerification.beneficiaryName ||
                    bankVerification['nameAtBank'] ||
                    null,
                beneficiaryAccountNumber: account_number,
                beneficiaryBankName:
                    (razorpayBankData?.BANK) ||
                    bankVerification.bank_name ||
                    bankVerification.bankName ||
                    null,
                beneficiaryIfsc: ifsc,
                paymentMode: 'WALLET',
                addedBy: masterDistributor.id,
                updatedBy: masterDistributor.id
            });

            // Wallet history for Company Admin / Whitelabel (credit)
            await dbService.createOne(model.walletHistory, {
                refId: whitelabelUser.id,
                companyId: req.user.companyId,
                walletType: 'mainWallet',
                operator: operatorName,
                remark: `${remarkText} - company commission`,
                amount: companySurchargeAmt,
                comm: companySurchargeAmt,
                surcharge: 0,
                openingAmt: companyOpeningBalance,
                closingAmt: companyClosingBalance,
                credit: companySurchargeAmt,
                debit: 0,
                transactionId,
                paymentStatus: 'SUCCESS',
                beneficiaryName: whitelabelUser.name || null,
                beneficiaryAccountNumber: null,
                beneficiaryBankName: null,
                beneficiaryIfsc: null,
                paymentMode: 'WALLET',
                addedBy: whitelabelUser.id,
                updatedBy: whitelabelUser.id
            });

            // Wallet history for Super Admin (credit)
            await dbService.createOne(model.walletHistory, {
                refId: superAdmin.id,
                companyId: 1,
                walletType: 'mainWallet',
                operator: operatorName,
                remark: `${remarkText} - admin commission`,
                amount: adminSurchargeAmt,
                comm: adminSurchargeAmt,
                surcharge: 0,
                openingAmt: adminOpeningBalance,
                closingAmt: adminClosingBalance,
                credit: adminSurchargeAmt,
                debit: 0,
                transactionId,
                paymentStatus: 'SUCCESS',
                beneficiaryName: superAdmin.name || null,
                beneficiaryAccountNumber: null,
                beneficiaryBankName: null,
                beneficiaryIfsc: null,
                paymentMode: 'WALLET',
                addedBy: superAdmin.id,
                updatedBy: superAdmin.id
            });
        }
        else if (req.user.userRole === 4) {
            // Check if distributor reports to company admin directly or has no reporting (null)
            if (distributor.reportingTo === companyAdmin.id || distributor.reportingTo === null) {
                // Scenario 1: Distributor reports directly to company admin (no master distributor)
                const distSlab = companySlabComm?.find(
                    (c) => c.roleType === 4 || c.roleName === 'DI'
                );
                const adminSlab = SuperAdminSlabComm?.find(
                    (c) => c.roleType === 1 || c.roleName === 'AD'
                );
                const companySlab = companySlabComm?.find(
                    (c) => c.roleType === 2 || c.roleName === 'WU'
                );

                const distBaseAmount = Number(distSlab?.commAmt || 0);
                const distSurchargeAmt = calcSlabAmount(distSlab, distBaseAmount);

                const companySurchargeAmt = calcSlabAmount(companySlab, distSurchargeAmt);
                const adminSurchargeAmt = calcSlabAmount(adminSlab, distSurchargeAmt);

                if (distSurchargeAmt <= 0) {
                    return res.failure({
                        message: 'Invalid distributor surcharge configuration for bank verification'
                    });
                }

                if (adminSurchargeAmt < 0 || companySurchargeAmt < 0) {
                    return res.failure({
                        message: 'Invalid admin/whitelabel surcharge configuration for bank verification'
                    });
                }

                if (adminSurchargeAmt + companySurchargeAmt > distSurchargeAmt) {
                    return res.failure({
                        message: 'Invalid surcharge configuration: total admin + company income is greater than distributor debit for bank verification'
                    });
                }

                const distOpeningBalance = parseFloat(distributorWallet.mainWallet || 0);
                const companyOpeningBalance = parseFloat(companyWallet.mainWallet || 0);
                const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

                const totalDebitFromDistributor = distSurchargeAmt;

                if (distOpeningBalance < totalDebitFromDistributor) {
                    return res.failure({
                        message: `Insufficient wallet balance. Required: ${totalDebitFromDistributor}, Available: ${distOpeningBalance}`
                    });
                }

                const distClosingBalance = parseFloat((distOpeningBalance - totalDebitFromDistributor).toFixed(2));
                const companyClosingBalance = parseFloat((companyOpeningBalance + companySurchargeAmt).toFixed(2));
                const adminClosingBalance = parseFloat((adminOpeningBalance + adminSurchargeAmt).toFixed(2));

                const companyDetails = await dbService.findOne(model.company, { id: req.user.companyId });
                const transactionId = generateTransactionID(companyDetails?.companyName || 'BANK_VERIFY');

                const operatorName = 'Bank Verification';
                const remarkText = 'Bank verification charge';

                // Update wallets
                await dbService.update(
                    model.wallet,
                    { id: distributorWallet.id },
                    { mainWallet: distClosingBalance, updatedBy: distributor.id }
                );

                await dbService.update(
                    model.wallet,
                    { id: companyWallet.id },
                    { mainWallet: companyClosingBalance, updatedBy: companyAdmin.id }
                );

                await dbService.update(
                    model.wallet,
                    { id: superAdminWallet.id },
                    { mainWallet: adminClosingBalance, updatedBy: superAdmin.id }
                );

                // Wallet history for Distributor (debit)
                await dbService.createOne(model.walletHistory, {
                    refId: distributor.id,
                    companyId: req.user.companyId,
                    walletType: 'mainWallet',
                    operator: operatorName,
                    remark: remarkText,
                    amount: totalDebitFromDistributor,
                    comm: 0,
                    surcharge: totalDebitFromDistributor,
                    openingAmt: distOpeningBalance,
                    closingAmt: distClosingBalance,
                    credit: 0,
                    debit: totalDebitFromDistributor,
                    transactionId,
                    paymentStatus: 'SUCCESS',
                    beneficiaryName:
                        bankVerification.nameAtBank ||
                        bankVerification.beneficiary_name ||
                        bankVerification.beneficiaryName ||
                        bankVerification['nameAtBank'] ||
                        null,
                    beneficiaryAccountNumber: account_number,
                    beneficiaryBankName:
                        (razorpayBankData?.BANK) ||
                        bankVerification.bank_name ||
                        bankVerification.bankName ||
                        null,
                    beneficiaryIfsc: ifsc,
                    paymentMode: 'WALLET',
                    addedBy: distributor.id,
                    updatedBy: distributor.id
                });

                // Wallet history for Company Admin (credit)
                await dbService.createOne(model.walletHistory, {
                    refId: companyAdmin.id,
                    companyId: req.user.companyId,
                    walletType: 'mainWallet',
                    operator: operatorName,
                    remark: `${remarkText} - company commission`,
                    amount: companySurchargeAmt,
                    comm: companySurchargeAmt,
                    surcharge: 0,
                    openingAmt: companyOpeningBalance,
                    closingAmt: companyClosingBalance,
                    credit: companySurchargeAmt,
                    debit: 0,
                    transactionId,
                    paymentStatus: 'SUCCESS',
                    beneficiaryName: companyAdmin.name || null,
                    beneficiaryAccountNumber: null,
                    beneficiaryBankName: null,
                    beneficiaryIfsc: null,
                    paymentMode: 'WALLET',
                    addedBy: companyAdmin.id,
                    updatedBy: companyAdmin.id
                });

                // Wallet history for Super Admin (credit)
                await dbService.createOne(model.walletHistory, {
                    refId: superAdmin.id,
                    companyId: 1,
                    walletType: 'mainWallet',
                    operator: operatorName,
                    remark: `${remarkText} - admin commission`,
                    amount: adminSurchargeAmt,
                    comm: adminSurchargeAmt,
                    surcharge: 0,
                    openingAmt: adminOpeningBalance,
                    closingAmt: adminClosingBalance,
                    credit: adminSurchargeAmt,
                    debit: 0,
                    transactionId,
                    paymentStatus: 'SUCCESS',
                    beneficiaryName: superAdmin.name || null,
                    beneficiaryAccountNumber: null,
                    beneficiaryBankName: null,
                    beneficiaryIfsc: null,
                    paymentMode: 'WALLET',
                    addedBy: superAdmin.id,
                    updatedBy: superAdmin.id
                });
            } else if (distributor.reportingTo && distributor.reportingTo !== null) {
                // Scenario 2: Distributor reports to master distributor (with MD commission)
                const masterDistributor = await dbService.findOne(model.user, {
                    id: distributor.reportingTo,
                    companyId: req.user.companyId,
                    isActive: true
                });

                if (!masterDistributor) {
                    return res.failure({ message: 'Master distributor not found' });
                }

                const distSlab = masterDistributorComm?.find(
                    (c) => c.roleType === 4 || c.roleName === 'DI'
                );
                const adminSlab = SuperAdminSlabComm?.find(
                    (c) => c.roleType === 1 || c.roleName === 'AD'
                );
                const companySlab = companySlabComm?.find(
                    (c) => c.roleType === 2 || c.roleName === 'WU'
                );
                const mdSlab = masterDistributorComm?.find(
                    (c) => c.roleType === 3 || c.roleName === 'MD'
                );

                const distBaseAmount = Number(distSlab?.commAmt || 0);
                const distSurchargeAmt = calcSlabAmount(distSlab, distBaseAmount);

                const mdSurchargeAmt = calcSlabAmount(mdSlab, distSurchargeAmt);
                const companySurchargeAmt = calcSlabAmount(companySlab, mdSurchargeAmt);
                const adminSurchargeAmt = calcSlabAmount(adminSlab, mdSurchargeAmt);

                if (distSurchargeAmt <= 0) {
                    return res.failure({
                        message: 'Invalid distributor surcharge configuration for bank verification'
                    });
                }

                if (mdSurchargeAmt < 0 || adminSurchargeAmt < 0 || companySurchargeAmt < 0) {
                    return res.failure({
                        message: 'Invalid master distributor/admin/whitelabel surcharge configuration for bank verification'
                    });
                }

                if (mdSurchargeAmt + adminSurchargeAmt + companySurchargeAmt > distSurchargeAmt) {
                    return res.failure({
                        message: 'Invalid surcharge configuration: total MD + admin + company income is greater than distributor debit for bank verification'
                    });
                }

                const distOpeningBalance = parseFloat(distributorWallet.mainWallet || 0);
                const mdOpeningBalance = parseFloat(masterDistributorWallet.mainWallet || 0);
                const companyOpeningBalance = parseFloat(companyWallet.mainWallet || 0);
                const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

                const totalDebitFromDistributor = distSurchargeAmt;

                if (distOpeningBalance < totalDebitFromDistributor) {
                    return res.failure({
                        message: `Insufficient wallet balance. Required: ${totalDebitFromDistributor}, Available: ${distOpeningBalance}`
                    });
                }

                const distClosingBalance = parseFloat((distOpeningBalance - totalDebitFromDistributor).toFixed(2));
                const mdClosingBalance = parseFloat((mdOpeningBalance + mdSurchargeAmt).toFixed(2));
                const companyClosingBalance = parseFloat((companyOpeningBalance + companySurchargeAmt).toFixed(2));
                const adminClosingBalance = parseFloat((adminOpeningBalance + adminSurchargeAmt).toFixed(2));

                const companyDetails = await dbService.findOne(model.company, { id: req.user.companyId });
                const transactionId = generateTransactionID(companyDetails?.companyName || 'BANK_VERIFY');

                const operatorName = 'Bank Verification';
                const remarkText = 'Bank verification charge';

                // Update wallets
                await dbService.update(
                    model.wallet,
                    { id: distributorWallet.id },
                    { mainWallet: distClosingBalance, updatedBy: distributor.id }
                );

                await dbService.update(
                    model.wallet,
                    { id: masterDistributorWallet.id },
                    { mainWallet: mdClosingBalance, updatedBy: masterDistributor.id }
                );

                await dbService.update(
                    model.wallet,
                    { id: companyWallet.id },
                    { mainWallet: companyClosingBalance, updatedBy: companyAdmin.id }
                );

                await dbService.update(
                    model.wallet,
                    { id: superAdminWallet.id },
                    { mainWallet: adminClosingBalance, updatedBy: superAdmin.id }
                );

                // Wallet history for Distributor (debit)
                await dbService.createOne(model.walletHistory, {
                    refId: distributor.id,
                    companyId: req.user.companyId,
                    walletType: 'mainWallet',
                    operator: operatorName,
                    remark: remarkText,
                    amount: totalDebitFromDistributor,
                    comm: 0,
                    surcharge: totalDebitFromDistributor,
                    openingAmt: distOpeningBalance,
                    closingAmt: distClosingBalance,
                    credit: 0,
                    debit: totalDebitFromDistributor,
                    transactionId,
                    paymentStatus: 'SUCCESS',
                    beneficiaryName:
                        bankVerification.nameAtBank ||
                        bankVerification.beneficiary_name ||
                        bankVerification.beneficiaryName ||
                        bankVerification['nameAtBank'] ||
                        null,
                    beneficiaryAccountNumber: account_number,
                    beneficiaryBankName:
                        (razorpayBankData?.BANK) ||
                        bankVerification.bank_name ||
                        bankVerification.bankName ||
                        null,
                    beneficiaryIfsc: ifsc,
                    paymentMode: 'WALLET',
                    addedBy: distributor.id,
                    updatedBy: distributor.id
                });

                // Wallet history for Master Distributor (credit)
                await dbService.createOne(model.walletHistory, {
                    refId: masterDistributor.id,
                    companyId: req.user.companyId,
                    walletType: 'mainWallet',
                    operator: operatorName,
                    remark: `${remarkText} - master distributor commission`,
                    amount: mdSurchargeAmt,
                    comm: mdSurchargeAmt,
                    surcharge: 0,
                    openingAmt: mdOpeningBalance,
                    closingAmt: mdClosingBalance,
                    credit: mdSurchargeAmt,
                    debit: 0,
                    transactionId,
                    paymentStatus: 'SUCCESS',
                    beneficiaryName: masterDistributor.name || null,
                    beneficiaryAccountNumber: null,
                    beneficiaryBankName: null,
                    beneficiaryIfsc: null,
                    paymentMode: 'WALLET',
                    addedBy: masterDistributor.id,
                    updatedBy: masterDistributor.id
                });

                // Wallet history for Company Admin (credit)
                await dbService.createOne(model.walletHistory, {
                    refId: companyAdmin.id,
                    companyId: req.user.companyId,
                    walletType: 'mainWallet',
                    operator: operatorName,
                    remark: `${remarkText} - company commission`,
                    amount: companySurchargeAmt,
                    comm: companySurchargeAmt,
                    surcharge: 0,
                    openingAmt: companyOpeningBalance,
                    closingAmt: companyClosingBalance,
                    credit: companySurchargeAmt,
                    debit: 0,
                    transactionId,
                    paymentStatus: 'SUCCESS',
                    beneficiaryName: companyAdmin.name || null,
                    beneficiaryAccountNumber: null,
                    beneficiaryBankName: null,
                    beneficiaryIfsc: null,
                    paymentMode: 'WALLET',
                    addedBy: companyAdmin.id,
                    updatedBy: companyAdmin.id
                });

                // Wallet history for Super Admin (credit)
                await dbService.createOne(model.walletHistory, {
                    refId: superAdmin.id,
                    companyId: 1,
                    walletType: 'mainWallet',
                    operator: operatorName,
                    remark: `${remarkText} - admin commission`,
                    amount: adminSurchargeAmt,
                    comm: adminSurchargeAmt,
                    surcharge: 0,
                    openingAmt: adminOpeningBalance,
                    closingAmt: adminClosingBalance,
                    credit: adminSurchargeAmt,
                    debit: 0,
                    transactionId,
                    paymentStatus: 'SUCCESS',
                    beneficiaryName: superAdmin.name || null,
                    beneficiaryAccountNumber: null,
                    beneficiaryBankName: null,
                    beneficiaryIfsc: null,
                    paymentMode: 'WALLET',
                    addedBy: superAdmin.id,
                    updatedBy: superAdmin.id
                });
            }
        }
        else if (req.user.userRole === 5) {
            // Check retailer reporting structure
            if (retailer.reportingTo === companyAdmin.id || retailer.reportingTo === null) {
                // Scenario 1: Retailer reports directly to company admin (no master distributor or distributor)
                const retailerSlab = companySlabComm?.find(
                    (c) => c.roleType === 5 || c.roleName === 'RT'
                );
                const adminSlab = SuperAdminSlabComm?.find(
                    (c) => c.roleType === 1 || c.roleName === 'AD'
                );
                const companySlab = companySlabComm?.find(
                    (c) => c.roleType === 2 || c.roleName === 'WU'
                );

                const retailerBaseAmount = Number(retailerSlab?.commAmt || 0);
                const retailerSurchargeAmt = calcSlabAmount(retailerSlab, retailerBaseAmount);

                const companySurchargeAmt = calcSlabAmount(companySlab, retailerSurchargeAmt);
                const adminSurchargeAmt = calcSlabAmount(adminSlab, retailerSurchargeAmt);

                if (retailerSurchargeAmt <= 0) {
                    return res.failure({
                        message: 'Invalid retailer surcharge configuration for bank verification'
                    });
                }

                if (adminSurchargeAmt < 0 || companySurchargeAmt < 0) {
                    return res.failure({
                        message: 'Invalid admin/whitelabel surcharge configuration for bank verification'
                    });
                }

                if (adminSurchargeAmt + companySurchargeAmt > retailerSurchargeAmt) {
                    return res.failure({
                        message: 'Invalid surcharge configuration: total admin + company income is greater than retailer debit for bank verification'
                    });
                }

                const retailerOpeningBalance = parseFloat(retailerWallet.mainWallet || 0);
                const companyOpeningBalance = parseFloat(companyWallet.mainWallet || 0);
                const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

                const totalDebitFromRetailer = retailerSurchargeAmt;

                if (retailerOpeningBalance < totalDebitFromRetailer) {
                    return res.failure({
                        message: `Insufficient wallet balance. Required: ${totalDebitFromRetailer}, Available: ${retailerOpeningBalance}`
                    });
                }

                const retailerClosingBalance = parseFloat((retailerOpeningBalance - totalDebitFromRetailer).toFixed(2));
                const companyClosingBalance = parseFloat((companyOpeningBalance + companySurchargeAmt).toFixed(2));
                const adminClosingBalance = parseFloat((adminOpeningBalance + adminSurchargeAmt).toFixed(2));

                const companyDetails = await dbService.findOne(model.company, { id: req.user.companyId });
                const transactionId = generateTransactionID(companyDetails?.companyName || 'BANK_VERIFY');

                const operatorName = 'Bank Verification';
                const remarkText = 'Bank verification charge';

                // Update wallets
                await dbService.update(
                    model.wallet,
                    { id: retailerWallet.id },
                    { mainWallet: retailerClosingBalance, updatedBy: retailer.id }
                );

                await dbService.update(
                    model.wallet,
                    { id: companyWallet.id },
                    { mainWallet: companyClosingBalance, updatedBy: companyAdmin.id }
                );

                await dbService.update(
                    model.wallet,
                    { id: superAdminWallet.id },
                    { mainWallet: adminClosingBalance, updatedBy: superAdmin.id }
                );

                // Wallet history for Retailer (debit)
                await dbService.createOne(model.walletHistory, {
                    refId: retailer.id,
                    companyId: req.user.companyId,
                    walletType: 'mainWallet',
                    operator: operatorName,
                    remark: remarkText,
                    amount: totalDebitFromRetailer,
                    comm: 0,
                    surcharge: totalDebitFromRetailer,
                    openingAmt: retailerOpeningBalance,
                    closingAmt: retailerClosingBalance,
                    credit: 0,
                    debit: totalDebitFromRetailer,
                    transactionId,
                    paymentStatus: 'SUCCESS',
                    beneficiaryName:
                        bankVerification.nameAtBank ||
                        bankVerification.beneficiary_name ||
                        bankVerification.beneficiaryName ||
                        bankVerification['nameAtBank'] ||
                        null,
                    beneficiaryAccountNumber: account_number,
                    beneficiaryBankName:
                        (razorpayBankData?.BANK) ||
                        bankVerification.bank_name ||
                        bankVerification.bankName ||
                        null,
                    beneficiaryIfsc: ifsc,
                    paymentMode: 'WALLET',
                    addedBy: retailer.id,
                    updatedBy: retailer.id
                });

                // Wallet history for Company Admin (credit)
                await dbService.createOne(model.walletHistory, {
                    refId: companyAdmin.id,
                    companyId: req.user.companyId,
                    walletType: 'mainWallet',
                    operator: operatorName,
                    remark: `${remarkText} - company commission`,
                    amount: companySurchargeAmt,
                    comm: companySurchargeAmt,
                    surcharge: 0,
                    openingAmt: companyOpeningBalance,
                    closingAmt: companyClosingBalance,
                    credit: companySurchargeAmt,
                    debit: 0,
                    transactionId,
                    paymentStatus: 'SUCCESS',
                    beneficiaryName: companyAdmin.name || null,
                    beneficiaryAccountNumber: null,
                    beneficiaryBankName: null,
                    beneficiaryIfsc: null,
                    paymentMode: 'WALLET',
                    addedBy: companyAdmin.id,
                    updatedBy: companyAdmin.id
                });

                // Wallet history for Super Admin (credit)
                await dbService.createOne(model.walletHistory, {
                    refId: superAdmin.id,
                    companyId: 1,
                    walletType: 'mainWallet',
                    operator: operatorName,
                    remark: `${remarkText} - admin commission`,
                    amount: adminSurchargeAmt,
                    comm: adminSurchargeAmt,
                    surcharge: 0,
                    openingAmt: adminOpeningBalance,
                    closingAmt: adminClosingBalance,
                    credit: adminSurchargeAmt,
                    debit: 0,
                    transactionId,
                    paymentStatus: 'SUCCESS',
                    beneficiaryName: superAdmin.name || null,
                    beneficiaryAccountNumber: null,
                    beneficiaryBankName: null,
                    beneficiaryIfsc: null,
                    paymentMode: 'WALLET',
                    addedBy: superAdmin.id,
                    updatedBy: superAdmin.id
                });
            } else if (retailer.reportingTo && retailer.reportingTo !== null) {
                // Find the reporting user
                const reportingUser = await dbService.findOne(model.user, {
                    id: retailer.reportingTo,
                    companyId: req.user.companyId,
                    isActive: true
                });

                if (!reportingUser) {
                    return res.failure({ message: 'Reporting user not found' });
                }

                if (reportingUser.userRole === 3) {
                    // Scenario 2: Retailer reports to master distributor
                    const retailerSlab = masterDistributorComm?.find(
                        (c) => c.roleType === 5 || c.roleName === 'RT'
                    );
                    const adminSlab = SuperAdminSlabComm?.find(
                        (c) => c.roleType === 1 || c.roleName === 'AD'
                    );
                    const companySlab = companySlabComm?.find(
                        (c) => c.roleType === 2 || c.roleName === 'WU'
                    );
                    const mdSlab = masterDistributorComm?.find(
                        (c) => c.roleType === 3 || c.roleName === 'MD'
                    );

                    const retailerBaseAmount = Number(retailerSlab?.commAmt || 0);
                    const retailerSurchargeAmt = calcSlabAmount(retailerSlab, retailerBaseAmount);

                    const mdSurchargeAmt = calcSlabAmount(mdSlab, retailerSurchargeAmt);
                    const companySurchargeAmt = calcSlabAmount(companySlab, mdSurchargeAmt);
                    const adminSurchargeAmt = calcSlabAmount(adminSlab, mdSurchargeAmt);

                    if (retailerSurchargeAmt <= 0) {
                        return res.failure({
                            message: 'Invalid retailer surcharge configuration for bank verification'
                        });
                    }

                    if (mdSurchargeAmt < 0 || adminSurchargeAmt < 0 || companySurchargeAmt < 0) {
                        return res.failure({
                            message: 'Invalid master distributor/admin/whitelabel surcharge configuration for bank verification'
                        });
                    }

                    if (mdSurchargeAmt + adminSurchargeAmt + companySurchargeAmt > retailerSurchargeAmt) {
                        return res.failure({
                            message: 'Invalid surcharge configuration: total MD + admin + company income is greater than retailer debit for bank verification'
                        });
                    }

                    const retailerOpeningBalance = parseFloat(retailerWallet.mainWallet || 0);
                    const mdOpeningBalance = parseFloat(masterDistributorWallet.mainWallet || 0);
                    const companyOpeningBalance = parseFloat(companyWallet.mainWallet || 0);
                    const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

                    const totalDebitFromRetailer = retailerSurchargeAmt;

                    if (retailerOpeningBalance < totalDebitFromRetailer) {
                        return res.failure({
                            message: `Insufficient wallet balance. Required: ${totalDebitFromRetailer}, Available: ${retailerOpeningBalance}`
                        });
                    }

                    const retailerClosingBalance = parseFloat((retailerOpeningBalance - totalDebitFromRetailer).toFixed(2));
                    const mdClosingBalance = parseFloat((mdOpeningBalance + mdSurchargeAmt).toFixed(2));
                    const companyClosingBalance = parseFloat((companyOpeningBalance + companySurchargeAmt).toFixed(2));
                    const adminClosingBalance = parseFloat((adminOpeningBalance + adminSurchargeAmt).toFixed(2));

                    const companyDetails = await dbService.findOne(model.company, { id: req.user.companyId });
                    const transactionId = generateTransactionID(companyDetails?.companyName || 'BANK_VERIFY');

                    const operatorName = 'Bank Verification';
                    const remarkText = 'Bank verification charge';

                    // Update wallets
                    await dbService.update(
                        model.wallet,
                        { id: retailerWallet.id },
                        { mainWallet: retailerClosingBalance, updatedBy: retailer.id }
                    );

                    await dbService.update(
                        model.wallet,
                        { id: masterDistributorWallet.id },
                        { mainWallet: mdClosingBalance, updatedBy: masterDistributor.id }
                    );

                    await dbService.update(
                        model.wallet,
                        { id: companyWallet.id },
                        { mainWallet: companyClosingBalance, updatedBy: companyAdmin.id }
                    );

                    await dbService.update(
                        model.wallet,
                        { id: superAdminWallet.id },
                        { mainWallet: adminClosingBalance, updatedBy: superAdmin.id }
                    );

                    // Wallet history for Retailer (debit)
                    await dbService.createOne(model.walletHistory, {
                        refId: retailer.id,
                        companyId: req.user.companyId,
                        walletType: 'mainWallet',
                        operator: operatorName,
                        remark: remarkText,
                        amount: totalDebitFromRetailer,
                        comm: 0,
                        surcharge: totalDebitFromRetailer,
                        openingAmt: retailerOpeningBalance,
                        closingAmt: retailerClosingBalance,
                        credit: 0,
                        debit: totalDebitFromRetailer,
                        transactionId,
                        paymentStatus: 'SUCCESS',
                        beneficiaryName:
                            bankVerification.nameAtBank ||
                            bankVerification.beneficiary_name ||
                            bankVerification.beneficiaryName ||
                            bankVerification['nameAtBank'] ||
                            null,
                        beneficiaryAccountNumber: account_number,
                        beneficiaryBankName:
                            (razorpayBankData?.BANK) ||
                            bankVerification.bank_name ||
                            bankVerification.bankName ||
                            null,
                        beneficiaryIfsc: ifsc,
                        paymentMode: 'WALLET',
                        addedBy: retailer.id,
                        updatedBy: retailer.id
                    });

                    // Wallet history for Master Distributor (credit)
                    await dbService.createOne(model.walletHistory, {
                        refId: masterDistributor.id,
                        companyId: req.user.companyId,
                        walletType: 'mainWallet',
                        operator: operatorName,
                        remark: `${remarkText} - master distributor commission`,
                        amount: mdSurchargeAmt,
                        comm: mdSurchargeAmt,
                        surcharge: 0,
                        openingAmt: mdOpeningBalance,
                        closingAmt: mdClosingBalance,
                        credit: mdSurchargeAmt,
                        debit: 0,
                        transactionId,
                        paymentStatus: 'SUCCESS',
                        beneficiaryName: masterDistributor.name || null,
                        beneficiaryAccountNumber: null,
                        beneficiaryBankName: null,
                        beneficiaryIfsc: null,
                        paymentMode: 'WALLET',
                        addedBy: masterDistributor.id,
                        updatedBy: masterDistributor.id
                    });

                    // Wallet history for Company Admin (credit)
                    await dbService.createOne(model.walletHistory, {
                        refId: companyAdmin.id,
                        companyId: req.user.companyId,
                        walletType: 'mainWallet',
                        operator: operatorName,
                        remark: `${remarkText} - company commission`,
                        amount: companySurchargeAmt,
                        comm: companySurchargeAmt,
                        surcharge: 0,
                        openingAmt: companyOpeningBalance,
                        closingAmt: companyClosingBalance,
                        credit: companySurchargeAmt,
                        debit: 0,
                        transactionId,
                        paymentStatus: 'SUCCESS',
                        beneficiaryName: companyAdmin.name || null,
                        beneficiaryAccountNumber: null,
                        beneficiaryBankName: null,
                        beneficiaryIfsc: null,
                        paymentMode: 'WALLET',
                        addedBy: companyAdmin.id,
                        updatedBy: companyAdmin.id
                    });

                    // Wallet history for Super Admin (credit)
                    await dbService.createOne(model.walletHistory, {
                        refId: superAdmin.id,
                        companyId: 1,
                        walletType: 'mainWallet',
                        operator: operatorName,
                        remark: `${remarkText} - admin commission`,
                        amount: adminSurchargeAmt,
                        comm: adminSurchargeAmt,
                        surcharge: 0,
                        openingAmt: adminOpeningBalance,
                        closingAmt: adminClosingBalance,
                        credit: adminSurchargeAmt,
                        debit: 0,
                        transactionId,
                        paymentStatus: 'SUCCESS',
                        beneficiaryName: superAdmin.name || null,
                        beneficiaryAccountNumber: null,
                        beneficiaryBankName: null,
                        beneficiaryIfsc: null,
                        paymentMode: 'WALLET',
                        addedBy: superAdmin.id,
                        updatedBy: superAdmin.id
                    });
                } else if (reportingUser.userRole === 4) {
                    // Retailer reports to distributor
                    if (distributor.reportingTo && distributor.reportingTo !== null && distributor.reportingTo !== companyAdmin.id && masterDistributor) {
                        // Scenario 4: Retailer -> Distributor -> Master Distributor (all in chain)
                        const retailerSlab = distributorComm?.find(
                            (c) => c.roleType === 5 || c.roleName === 'RT'
                        );
                        const adminSlab = SuperAdminSlabComm?.find(
                            (c) => c.roleType === 1 || c.roleName === 'AD'
                        );
                        const companySlab = companySlabComm?.find(
                            (c) => c.roleType === 2 || c.roleName === 'WU'
                        );
                        const mdSlab = masterDistributorComm?.find(
                            (c) => c.roleType === 3 || c.roleName === 'MD'
                        );
                        const distSlab = distributorComm?.find(
                            (c) => c.roleType === 4 || c.roleName === 'DI'
                        );

                        const retailerBaseAmount = Number(retailerSlab?.commAmt || 0);
                        const retailerSurchargeAmt = calcSlabAmount(retailerSlab, retailerBaseAmount);

                        const distSurchargeAmt = calcSlabAmount(distSlab, retailerSurchargeAmt);
                        const mdSurchargeAmt = calcSlabAmount(mdSlab, distSurchargeAmt);
                        const companySurchargeAmt = calcSlabAmount(companySlab, mdSurchargeAmt);
                        const adminSurchargeAmt = calcSlabAmount(adminSlab, mdSurchargeAmt);

                        if (retailerSurchargeAmt <= 0) {
                            return res.failure({
                                message: 'Invalid retailer surcharge configuration for bank verification'
                            });
                        }

                        if (distSurchargeAmt < 0 || mdSurchargeAmt < 0 || adminSurchargeAmt < 0 || companySurchargeAmt < 0) {
                            return res.failure({
                                message: 'Invalid distributor/master distributor/admin/whitelabel surcharge configuration for bank verification'
                            });
                        }

                        if (distSurchargeAmt + mdSurchargeAmt + adminSurchargeAmt + companySurchargeAmt > retailerSurchargeAmt) {
                            return res.failure({
                                message: 'Invalid surcharge configuration: total distributor + MD + admin + company income is greater than retailer debit for bank verification'
                            });
                        }

                        const retailerOpeningBalance = parseFloat(retailerWallet.mainWallet || 0);
                        const distOpeningBalance = parseFloat(distributorWallet.mainWallet || 0);
                        const mdOpeningBalance = parseFloat(masterDistributorWallet.mainWallet || 0);
                        const companyOpeningBalance = parseFloat(companyWallet.mainWallet || 0);
                        const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

                        const totalDebitFromRetailer = retailerSurchargeAmt;

                        if (retailerOpeningBalance < totalDebitFromRetailer) {
                            return res.failure({
                                message: `Insufficient wallet balance. Required: ${totalDebitFromRetailer}, Available: ${retailerOpeningBalance}`
                            });
                        }

                        const retailerClosingBalance = parseFloat((retailerOpeningBalance - totalDebitFromRetailer).toFixed(2));
                        const distClosingBalance = parseFloat((distOpeningBalance + distSurchargeAmt).toFixed(2));
                        const mdClosingBalance = parseFloat((mdOpeningBalance + mdSurchargeAmt).toFixed(2));
                        const companyClosingBalance = parseFloat((companyOpeningBalance + companySurchargeAmt).toFixed(2));
                        const adminClosingBalance = parseFloat((adminOpeningBalance + adminSurchargeAmt).toFixed(2));

                        const companyDetails = await dbService.findOne(model.company, { id: req.user.companyId });
                        const transactionId = generateTransactionID(companyDetails?.companyName || 'BANK_VERIFY');

                        const operatorName = 'Bank Verification';
                        const remarkText = 'Bank verification charge';

                        // Update wallets
                        await dbService.update(
                            model.wallet,
                            { id: retailerWallet.id },
                            { mainWallet: retailerClosingBalance, updatedBy: retailer.id }
                        );

                        await dbService.update(
                            model.wallet,
                            { id: distributorWallet.id },
                            { mainWallet: distClosingBalance, updatedBy: distributor.id }
                        );

                        await dbService.update(
                            model.wallet,
                            { id: masterDistributorWallet.id },
                            { mainWallet: mdClosingBalance, updatedBy: masterDistributor.id }
                        );

                        await dbService.update(
                            model.wallet,
                            { id: companyWallet.id },
                            { mainWallet: companyClosingBalance, updatedBy: companyAdmin.id }
                        );

                        await dbService.update(
                            model.wallet,
                            { id: superAdminWallet.id },
                            { mainWallet: adminClosingBalance, updatedBy: superAdmin.id }
                        );

                        // Wallet history for Retailer (debit)
                        await dbService.createOne(model.walletHistory, {
                            refId: retailer.id,
                            companyId: req.user.companyId,
                            walletType: 'mainWallet',
                            operator: operatorName,
                            remark: remarkText,
                            amount: totalDebitFromRetailer,
                            comm: 0,
                            surcharge: totalDebitFromRetailer,
                            openingAmt: retailerOpeningBalance,
                            closingAmt: retailerClosingBalance,
                            credit: 0,
                            debit: totalDebitFromRetailer,
                            transactionId,
                            paymentStatus: 'SUCCESS',
                            beneficiaryName:
                                bankVerification.nameAtBank ||
                                bankVerification.beneficiary_name ||
                                bankVerification.beneficiaryName ||
                                bankVerification['nameAtBank'] ||
                                null,
                            beneficiaryAccountNumber: account_number,
                            beneficiaryBankName:
                                (razorpayBankData?.BANK) ||
                                bankVerification.bank_name ||
                                bankVerification.bankName ||
                                null,
                            beneficiaryIfsc: ifsc,
                            paymentMode: 'WALLET',
                            addedBy: retailer.id,
                            updatedBy: retailer.id
                        });

                        // Wallet history for Distributor (credit)
                        await dbService.createOne(model.walletHistory, {
                            refId: distributor.id,
                            companyId: req.user.companyId,
                            walletType: 'mainWallet',
                            operator: operatorName,
                            remark: `${remarkText} - distributor commission`,
                            amount: distSurchargeAmt,
                            comm: distSurchargeAmt,
                            surcharge: 0,
                            openingAmt: distOpeningBalance,
                            closingAmt: distClosingBalance,
                            credit: distSurchargeAmt,
                            debit: 0,
                            transactionId,
                            paymentStatus: 'SUCCESS',
                            beneficiaryName: distributor.name || null,
                            beneficiaryAccountNumber: null,
                            beneficiaryBankName: null,
                            beneficiaryIfsc: null,
                            paymentMode: 'WALLET',
                            addedBy: distributor.id,
                            updatedBy: distributor.id
                        });

                        // Wallet history for Master Distributor (credit)
                        await dbService.createOne(model.walletHistory, {
                            refId: masterDistributor.id,
                            companyId: req.user.companyId,
                            walletType: 'mainWallet',
                            operator: operatorName,
                            remark: `${remarkText} - master distributor commission`,
                            amount: mdSurchargeAmt,
                            comm: mdSurchargeAmt,
                            surcharge: 0,
                            openingAmt: mdOpeningBalance,
                            closingAmt: mdClosingBalance,
                            credit: mdSurchargeAmt,
                            debit: 0,
                            transactionId,
                            paymentStatus: 'SUCCESS',
                            beneficiaryName: masterDistributor.name || null,
                            beneficiaryAccountNumber: null,
                            beneficiaryBankName: null,
                            beneficiaryIfsc: null,
                            paymentMode: 'WALLET',
                            addedBy: masterDistributor.id,
                            updatedBy: masterDistributor.id
                        });

                        // Wallet history for Company Admin (credit)
                        await dbService.createOne(model.walletHistory, {
                            refId: companyAdmin.id,
                            companyId: req.user.companyId,
                            walletType: 'mainWallet',
                            operator: operatorName,
                            remark: `${remarkText} - company commission`,
                            amount: companySurchargeAmt,
                            comm: companySurchargeAmt,
                            surcharge: 0,
                            openingAmt: companyOpeningBalance,
                            closingAmt: companyClosingBalance,
                            credit: companySurchargeAmt,
                            debit: 0,
                            transactionId,
                            paymentStatus: 'SUCCESS',
                            beneficiaryName: companyAdmin.name || null,
                            beneficiaryAccountNumber: null,
                            beneficiaryBankName: null,
                            beneficiaryIfsc: null,
                            paymentMode: 'WALLET',
                            addedBy: companyAdmin.id,
                            updatedBy: companyAdmin.id
                        });

                        // Wallet history for Super Admin (credit)
                        await dbService.createOne(model.walletHistory, {
                            refId: superAdmin.id,
                            companyId: 1,
                            walletType: 'mainWallet',
                            operator: operatorName,
                            remark: `${remarkText} - admin commission`,
                            amount: adminSurchargeAmt,
                            comm: adminSurchargeAmt,
                            surcharge: 0,
                            openingAmt: adminOpeningBalance,
                            closingAmt: adminClosingBalance,
                            credit: adminSurchargeAmt,
                            debit: 0,
                            transactionId,
                            paymentStatus: 'SUCCESS',
                            beneficiaryName: superAdmin.name || null,
                            beneficiaryAccountNumber: null,
                            beneficiaryBankName: null,
                            beneficiaryIfsc: null,
                            paymentMode: 'WALLET',
                            addedBy: superAdmin.id,
                            updatedBy: superAdmin.id
                        });
                    } else {
                        // Scenario 3: Retailer reports to distributor (distributor reports to company admin)
                        const retailerSlab = distributorComm?.find(
                            (c) => c.roleType === 5 || c.roleName === 'RT'
                        );
                        const adminSlab = SuperAdminSlabComm?.find(
                            (c) => c.roleType === 1 || c.roleName === 'AD'
                        );
                        const companySlab = companySlabComm?.find(
                            (c) => c.roleType === 2 || c.roleName === 'WU'
                        );
                        const distSlab = distributorComm?.find(
                            (c) => c.roleType === 4 || c.roleName === 'DI'
                        );

                        const retailerBaseAmount = Number(retailerSlab?.commAmt || 0);
                        const retailerSurchargeAmt = calcSlabAmount(retailerSlab, retailerBaseAmount);

                        const distSurchargeAmt = calcSlabAmount(distSlab, retailerSurchargeAmt);
                        const companySurchargeAmt = calcSlabAmount(companySlab, distSurchargeAmt);
                        const adminSurchargeAmt = calcSlabAmount(adminSlab, distSurchargeAmt);

                        if (retailerSurchargeAmt <= 0) {
                            return res.failure({
                                message: 'Invalid retailer surcharge configuration for bank verification'
                            });
                        }

                        if (distSurchargeAmt < 0 || adminSurchargeAmt < 0 || companySurchargeAmt < 0) {
                            return res.failure({
                                message: 'Invalid distributor/admin/whitelabel surcharge configuration for bank verification'
                            });
                        }

                        if (distSurchargeAmt + adminSurchargeAmt + companySurchargeAmt > retailerSurchargeAmt) {
                            return res.failure({
                                message: 'Invalid surcharge configuration: total distributor + admin + company income is greater than retailer debit for bank verification'
                            });
                        }

                        const retailerOpeningBalance = parseFloat(retailerWallet.mainWallet || 0);
                        const distOpeningBalance = parseFloat(distributorWallet.mainWallet || 0);
                        const companyOpeningBalance = parseFloat(companyWallet.mainWallet || 0);
                        const adminOpeningBalance = parseFloat(superAdminWallet.mainWallet || 0);

                        const totalDebitFromRetailer = retailerSurchargeAmt;

                        if (retailerOpeningBalance < totalDebitFromRetailer) {
                            return res.failure({
                                message: `Insufficient wallet balance. Required: ${totalDebitFromRetailer}, Available: ${retailerOpeningBalance}`
                            });
                        }

                        const retailerClosingBalance = parseFloat((retailerOpeningBalance - totalDebitFromRetailer).toFixed(2));
                        const distClosingBalance = parseFloat((distOpeningBalance + distSurchargeAmt).toFixed(2));
                        const companyClosingBalance = parseFloat((companyOpeningBalance + companySurchargeAmt).toFixed(2));
                        const adminClosingBalance = parseFloat((adminOpeningBalance + adminSurchargeAmt).toFixed(2));

                        const companyDetails = await dbService.findOne(model.company, { id: req.user.companyId });
                        const transactionId = generateTransactionID(companyDetails?.companyName || 'BANK_VERIFY');

                        const operatorName = 'Bank Verification';
                        const remarkText = 'Bank verification charge';

                        // Update wallets
                        await dbService.update(
                            model.wallet,
                            { id: retailerWallet.id },
                            { mainWallet: retailerClosingBalance, updatedBy: retailer.id }
                        );

                        await dbService.update(
                            model.wallet,
                            { id: distributorWallet.id },
                            { mainWallet: distClosingBalance, updatedBy: distributor.id }
                        );

                        await dbService.update(
                            model.wallet,
                            { id: companyWallet.id },
                            { mainWallet: companyClosingBalance, updatedBy: companyAdmin.id }
                        );

                        await dbService.update(
                            model.wallet,
                            { id: superAdminWallet.id },
                            { mainWallet: adminClosingBalance, updatedBy: superAdmin.id }
                        );

                        // Wallet history for Retailer (debit)
                        await dbService.createOne(model.walletHistory, {
                            refId: retailer.id,
                            companyId: req.user.companyId,
                            walletType: 'mainWallet',
                            operator: operatorName,
                            remark: remarkText,
                            amount: totalDebitFromRetailer,
                            comm: 0,
                            surcharge: totalDebitFromRetailer,
                            openingAmt: retailerOpeningBalance,
                            closingAmt: retailerClosingBalance,
                            credit: 0,
                            debit: totalDebitFromRetailer,
                            transactionId,
                            paymentStatus: 'SUCCESS',
                            beneficiaryName:
                                bankVerification.nameAtBank ||
                                bankVerification.beneficiary_name ||
                                bankVerification.beneficiaryName ||
                                bankVerification['nameAtBank'] ||
                                null,
                            beneficiaryAccountNumber: account_number,
                            beneficiaryBankName:
                                (razorpayBankData?.BANK) ||
                                bankVerification.bank_name ||
                                bankVerification.bankName ||
                                null,
                            beneficiaryIfsc: ifsc,
                            paymentMode: 'WALLET',
                            addedBy: retailer.id,
                            updatedBy: retailer.id
                        });

                        // Wallet history for Distributor (credit)
                        await dbService.createOne(model.walletHistory, {
                            refId: distributor.id,
                            companyId: req.user.companyId,
                            walletType: 'mainWallet',
                            operator: operatorName,
                            remark: `${remarkText} - distributor commission`,
                            amount: distSurchargeAmt,
                            comm: distSurchargeAmt,
                            surcharge: 0,
                            openingAmt: distOpeningBalance,
                            closingAmt: distClosingBalance,
                            credit: distSurchargeAmt,
                            debit: 0,
                            transactionId,
                            paymentStatus: 'SUCCESS',
                            beneficiaryName: distributor.name || null,
                            beneficiaryAccountNumber: null,
                            beneficiaryBankName: null,
                            beneficiaryIfsc: null,
                            paymentMode: 'WALLET',
                            addedBy: distributor.id,
                            updatedBy: distributor.id
                        });

                        // Wallet history for Company Admin (credit)
                        await dbService.createOne(model.walletHistory, {
                            refId: companyAdmin.id,
                            companyId: req.user.companyId,
                            walletType: 'mainWallet',
                            operator: operatorName,
                            remark: `${remarkText} - company commission`,
                            amount: companySurchargeAmt,
                            comm: companySurchargeAmt,
                            surcharge: 0,
                            openingAmt: companyOpeningBalance,
                            closingAmt: companyClosingBalance,
                            credit: companySurchargeAmt,
                            debit: 0,
                            transactionId,
                            paymentStatus: 'SUCCESS',
                            beneficiaryName: companyAdmin.name || null,
                            beneficiaryAccountNumber: null,
                            beneficiaryBankName: null,
                            beneficiaryIfsc: null,
                            paymentMode: 'WALLET',
                            addedBy: companyAdmin.id,
                            updatedBy: companyAdmin.id
                        });

                        // Wallet history for Super Admin (credit)
                        await dbService.createOne(model.walletHistory, {
                            refId: superAdmin.id,
                            companyId: 1,
                            walletType: 'mainWallet',
                            operator: operatorName,
                            remark: `${remarkText} - admin commission`,
                            amount: adminSurchargeAmt,
                            comm: adminSurchargeAmt,
                            surcharge: 0,
                            openingAmt: adminOpeningBalance,
                            closingAmt: adminClosingBalance,
                            credit: adminSurchargeAmt,
                            debit: 0,
                            transactionId,
                            paymentStatus: 'SUCCESS',
                            beneficiaryName: superAdmin.name || null,
                            beneficiaryAccountNumber: null,
                            beneficiaryBankName: null,
                            beneficiaryIfsc: null,
                            paymentMode: 'WALLET',
                            addedBy: superAdmin.id,
                            updatedBy: superAdmin.id
                        });
                    }
                }
            }
        }
        }

        if (duplicateBank) {
            return res.failure({
                message: 'This bank account with the same account number and IFSC already exists in your account',
                data: {
                    existingBank: {
                        id: duplicateBank.id,
                        bankName: duplicateBank.bankName,
                        accountNumber: duplicateBank.accountNumber,
                        ifsc: duplicateBank.ifsc,
                        isPrimary: duplicateBank.isPrimary
                    }
                }
            });
        }

        if (existingBanks && existingBanks.length >= MAX_BANKS) {
            return res.failure({
                message: `You have reached the maximum limit of ${MAX_BANKS} bank accounts. Please remove one of your existing banks before adding a new one.`,
                data: {
                    existingBanksCount: existingBanks.length,
                    maxBanks: MAX_BANKS,
                    existingBanks: existingBanks.map(bank => ({
                        id: bank.id,
                        bankName: bank.bankName,
                        accountNumber: bank.accountNumber,
                        ifsc: bank.ifsc,
                        isPrimary: bank.isPrimary
                    }))
                }
            });
        }

        const bankName = (razorpayBankData?.BANK) || bankVerification.bank_name || bankVerification.bankName || null;
        const beneficiaryName = bankVerification.nameAtBank || bankVerification.beneficiary_name || bankVerification.beneficiaryName || bankVerification['nameAtBank'] || null;
        const city = (razorpayBankData?.CITY) || bankVerification.city || null;
        const branch = (razorpayBankData?.BRANCH) || bankVerification.branch || null;

        const customerBank = await dbService.createOne(model.customerBank, {
            bankName,
            beneficiaryName,
            accountNumber: account_number,
            ifsc,
            city,
            branch,
            companyId: req.user.companyId,
            refId: req.user.id,
            isActive: true,
            isPrimary: false
        });

        return res.success({ message: 'Bank details added successfully', data: customerBank });
    } catch (error) {
        console.log('Add bank details error:', error);
        return res.internalServerError({ message: error && error.message ? error.message : 'Internal server error' });
    }
};

const getCustomerBankById = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        
        if (!id) {
            return res.validationError({ message: 'Bank ID is required' });
        }
        
        const customerBank = await dbService.findOne(
            model.customerBank,
            {
                id: id,
                refId: user.id,
                companyId: user.companyId,
                isActive: true
            }
        );
        
        if (!customerBank) {
            return res.notFound({ message: 'Customer bank not found' });
        }
        
        return res.success({
            message: 'Customer bank retrieved successfully',
            data: customerBank
        });
        
    } catch (error) {
        console.log('Get customer bank by ID error:', error);
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

const deleteCustomerBank = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const customerBank = await dbService.deleteOne(model.customerBank, {
            id: id,
            refId: user.id,
            companyId: user.companyId
        });
        if (!customerBank) {
            return res.notFound({ message: 'Customer bank not found' });
        }
        if (customerBank.isPrimary) {
            return res.failure({ message: 'Primary bank account cannot be deleted' });
        }
        const updatedBank = {
            isActive: false
        }
        await dbService.update(model.customerBank, {
            id: id,
            refId: user.id,
            companyId: user.companyId
        }, updatedBank
       );
        if (!updatedBank) {
            return res.failure({ message: 'Failed to delete bank details' });
        }
        return res.success({ message: 'Bank details deleted successfully', data: updatedBank });
    }
    catch (error) {
        console.log('Delete customer bank error:', error);
        return res.internalServerError({ message: error.message || 'Internal server error' });
    }
};

module.exports = {
    getAllCustomerBanks,
    getPrimaryCustomerBank,
    getCustomerBankById,
    addCustomerBank,
    deleteCustomerBank
};

