const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const imageService = require('../../../services/imageService');
const emailService = require('../../../services/emailService');
const { Op } = require('sequelize');
const { decrypt } = require('../../../utils/encryption');

const processFundRequestData = (data) => {
    if (!data) return data;

    if (Array.isArray(data)) {
        return data.map(record => processFundRequestData(record));
    }

    const processed = { ...data.dataValues || data };

    if (processed.requester) {
        const requester = { ...(processed.requester.dataValues || processed.requester) };
        if (requester.profileImage) {
            try {
                const decryptedImage = decrypt(requester.profileImage);
                requester.profileImage = `${process.env.AWS_CDN_URL}/${decryptedImage}`;
            } catch (e) {
                requester.profileImage = null;
            }
        }
        processed.requester = requester;
    }

    if (processed.approver) {
        const approver = { ...(processed.approver.dataValues || processed.approver) };
        if (approver.profileImage) {
            try {
                const decryptedImage = decrypt(approver.profileImage);
                approver.profileImage = `${process.env.AWS_CDN_URL}/${decryptedImage}`;
            } catch (e) {
                approver.profileImage = null;
            }
        }
        processed.approver = approver;
    }

    if (processed.paySlip) {
        processed.paySlip = `${process.env.AWS_CDN_URL}/${processed.paySlip}`;
    }

    return processed;
};

const approveFundRequest = async (req, res) => {
    try {
        if (req.user.userRole !== 1 || req.user.companyId !== 1) {
            return res.failure({
                message: 'Only superadmin can access this endpoint'
            });
        }

        const { fundRequestId, action, approvalRemarks } = req.body;
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId,
            isActive: true
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        if (!fundRequestId || !action) {
            return res.failure({
                message: 'Fund request ID and action are required'
            });
        }

        if (!['APPROVED', 'REJECTED'].includes(action)) {
            return res.failure({
                message: 'Action must be either APPROVED or REJECTED'
            });
        }

        const fundRequest = await dbService.findOne(model.fundRequest, {
            id: fundRequestId,
            isActive: true,
        });

        if (!fundRequest) {
            return res.failure({ message: 'Fund request not found' });
        }

        if (fundRequest.approvalRefId !== req.user.id) {
            return res.failure({
                message: 'You are not authorized to approve this request'
            });
        }

        if (fundRequest.status !== 'PENDING') {
            return res.failure({
                message: `This request has already been ${fundRequest.status.toLowerCase()}`
            });
        }

        if (action === 'APPROVED') {
            const transferAmount = parseFloat(fundRequest.amount);

            const [approverWallet, requesterWallet] = await Promise.all([
                dbService.findOne(model.wallet, {
                    refId: req.user.id,
                    companyId: req.user.companyId
                }),
                dbService.findOne(model.wallet, {
                    refId: fundRequest.refId,
                    companyId: fundRequest.companyId
                })
            ]);

            if (!approverWallet) {
                return res.failure({ message: 'Approver wallet not found' });
            }

            if (!requesterWallet) {
                return res.failure({ message: 'Requester wallet not found' });
            }

            const approverBalance = parseFloat(approverWallet.mainWallet) || 0;
            if (approverBalance < transferAmount) {
                return res.failure({
                    message: `Insufficient wallet balance. Available: ${approverBalance}, Required: ${transferAmount}`
                });
            }

            const approverOpeningBalance = approverBalance;
            const approverClosingBalance = approverBalance - transferAmount;

            const requesterOpeningBalance = parseFloat(requesterWallet.mainWallet) || 0;
            const requesterClosingBalance = requesterOpeningBalance + transferAmount;

            const approverWalletHistoryData = {
                refId: req.user.id,
                companyId: req.user.companyId,
                walletType: 'FUND_TRANSFER',
                remark: `Fund transfer to user ID: ${fundRequest.refId} - ${fundRequest.transactionId}`,
                amount: transferAmount,
                openingAmt: approverOpeningBalance,
                closingAmt: approverClosingBalance,
                credit: 0,
                debit: transferAmount,
                transactionId: fundRequest.transactionId,
                paymentStatus: 'SUCCESS',
                createdAt: new Date()
            };

            const requesterWalletHistoryData = {
                refId: fundRequest.refId,
                companyId: fundRequest.companyId,
                walletType: 'FUND_TRANSFER',
                remark: `Fund transfer received from approver ID: ${req.user.id} - ${fundRequest.transactionId}`,
                amount: transferAmount,
                operator: 'FUND TRANSFER',
                openingAmt: requesterOpeningBalance,
                closingAmt: requesterClosingBalance,
                credit: transferAmount,
                debit: 0,
                transactionId: fundRequest.transactionId,
                paymentStatus: 'SUCCESS',
                createdAt: new Date()
            };

            await Promise.all([
                dbService.update(
                    model.wallet,
                    { refId: req.user.id, companyId: req.user.companyId },
                    { mainWallet: approverClosingBalance }
                ),
                dbService.update(
                    model.wallet,
                    { refId: fundRequest.refId, companyId: fundRequest.companyId },
                    { mainWallet: requesterClosingBalance }
                ),
                dbService.createOne(model.walletHistory, approverWalletHistoryData),
                dbService.createOne(model.walletHistory, requesterWalletHistoryData)
            ]);

            const fundHistoryUpdateData = {
                openingBalance: requesterOpeningBalance,
                closingBalance: requesterClosingBalance,
                creditAmount: transferAmount,
                status: 'CREDITED',
                remarks: approvalRemarks || 'Fund request approved and credited',
                approvedAt: new Date(),
                updatedBy: req.user.id
            };

            await dbService.update(
                model.fundHistory,
                { fundRequestId: fundRequest.id },
                fundHistoryUpdateData
            );

            const approvedUpdate = await dbService.update(
                model.fundRequest,
                { id: fundRequestId, status: 'PENDING' },
                {
                    status: 'APPROVED',
                    approvalRemarks: approvalRemarks || null,
                    approvedAt: new Date(),
                    updatedBy: req.user.id
                }
            );

            if (!approvedUpdate || approvedUpdate[0] === 0) {
                return res.failure({
                    message: 'This request has already been processed by another user'
                });
            }

            const [requester, company] = await Promise.all([
                dbService.findOne(model.user, {
                    id: fundRequest.refId,
                    companyId: fundRequest.companyId,
                    isActive: true
                }),
                dbService.findOne(model.company, {
                    id: fundRequest.companyId
                })
            ]);

            if (requester) {
                try {
                    const backendUrl = process.env.BASE_URL;
                    const logoUrl = (company && company.logo) ? imageService.getImageUrl(company.logo) : `${backendUrl}/gmaxepay.png`;
                    const illustrationUrl = `${backendUrl}/walletload.png`;

                    const formattedAmount = parseFloat(transferAmount).toFixed(2);

                    if (requester.email) {
                        await emailService.sendFundApprovalEmail({
                            to: requester.email,
                            userName: requester.name || 'User',
                            amount: formattedAmount,
                            transactionId: fundRequest.transactionId,
                            companyName: company?.companyName || 'GMAXEPAY',
                            approverName: existingUser.name || req.user.name,
                            logoUrl: logoUrl,
                            illustrationUrl: illustrationUrl
                        });
                    }
                } catch (notificationError) {
                    console.error('Error sending notifications:', notificationError);
                }
            }
        } else {
            const rejectedUpdate = await dbService.update(
                model.fundRequest,
                { id: fundRequestId, status: 'PENDING' },
                {
                    status: 'REJECTED',
                    approvalRemarks: approvalRemarks || null,
                    approvedAt: new Date(),
                    updatedBy: req.user.id
                }
            );

            if (!rejectedUpdate || rejectedUpdate[0] === 0) {
                return res.failure({
                    message: 'This request has already been processed by another user'
                });
            }
        }

        return res.success({
            message: `Fund request ${action.toLowerCase()} successfully`,
            data: {
                fundRequestId: fundRequest.id,
                transactionId: fundRequest.transactionId,
                status: action,
                amount: fundRequest.amount
            }
        });

    } catch (error) {
        console.error('Approve fund request error:', error);
        return res.failure({
            message: error.message || 'Unable to process fund request approval'
        });
    }
};

const getFundRequests = async (req, res) => {
    try {
        if (req.user.userRole !== 1 || req.user.companyId !== 1) {
            return res.failure({
                message: 'Only superadmin can access this endpoint'
            });
        }
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId,
            isActive: true
        });
        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        const dataToFind = req.body || {};
        let options = {};
        let query = {
            isActive: true,
            isDelete: false
        };

        const hasApprovalRequests = await dbService.findOne(model.fundRequest, {
            approvalRefId: req.user.id,
            isActive: true,
            isDelete: false
        }, {
            attributes: ['id']
        });

        const isApprover = !!hasApprovalRequests;

        if (isApprover) {
            query.approvalRefId = req.user.id;
        } else {
            query.refId = req.user.id;
            query.companyId = req.user.companyId;
        }

        if (dataToFind && dataToFind.query) {
            const { startDate, endDate, ...restQuery } = dataToFind.query;
            query = { ...query, ...restQuery };

            if (startDate || endDate) {
                if (startDate && endDate) {
                    const start = new Date(startDate);
                    start.setHours(0, 0, 0, 0);
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);

                    query.transactionDate = {
                        [Op.between]: [start, end]
                    };
                } else if (startDate) {
                    const start = new Date(startDate);
                    start.setHours(0, 0, 0, 0);
                    query.transactionDate = {
                        [Op.gte]: start
                    };
                } else if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    query.transactionDate = {
                        [Op.lte]: end
                    };
                }
            }
        }

        if (dataToFind && dataToFind.options !== undefined) {
            options = { ...dataToFind.options };
        }

        options.include = [
            {
                model: model.user,
                as: 'requester',
                attributes: ['id', 'name', 'profileImage', 'email', 'mobileNo', 'userRole'],
                required: false
            },
            {
                model: model.user,
                as: 'approver',
                attributes: ['id', 'name', 'profileImage', 'email', 'mobileNo', 'userRole'],
                required: false
            },
            {
                model: model.customerBank,
                as: 'bank',
                attributes: ['id', 'bankName', 'accountNumber', 'ifsc', 'beneficiaryName'],
                required: false
            }
        ];

        if (dataToFind?.customSearch && typeof dataToFind.customSearch === 'object') {
            const keys = Object.keys(dataToFind.customSearch);
            const searchOrConditions = [];
            let nameSearchValue = null;

            for (const key of keys) {
                const value = dataToFind.customSearch[key];
                if (value === undefined || value === null || String(value).trim() === '') continue;

                if (key === 'userName' || key === 'name') {
                    nameSearchValue = String(value).trim();
                } else if (key === 'transactionId' || key === 'referenceNo') {
                    searchOrConditions.push({
                        [key]: {
                            [Op.iLike]: `%${String(value).trim()}%`
                        }
                    });
                }
            }

            if (nameSearchValue) {
                const matchingUsers = await dbService.findAll(model.user, {
                    name: {
                        [Op.iLike]: `%${nameSearchValue}%`
                    },
                    isActive: true,
                    isDeleted: false
                }, {
                    attributes: ['id']
                });

                const userIds = matchingUsers.map(u => u.id);

                if (userIds.length > 0) {
                    if (isApprover) {
                        searchOrConditions.push({
                            refId: { [Op.in]: userIds }
                        });
                    } else {
                        searchOrConditions.push({
                            refId: { [Op.in]: userIds }
                        });
                    }
                } else {
                    return res.success({
                        message: 'Fund requests retrieved successfully',
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

            if (searchOrConditions.length > 0) {
                if (searchOrConditions.length === 1) {
                    Object.assign(query, searchOrConditions[0]);
                } else {
                    query[Op.and] = [
                        { [Op.or]: searchOrConditions }
                    ];
                }
            }
        }

        const result = await dbService.paginate(model.fundRequest, query, options);
        const processedData = processFundRequestData(result?.data || []);

        return res.success({
            message: 'Fund requests retrieved successfully',
            data: processedData,
            total: result?.total || 0,
            paginator: result?.paginator || {
                page: options.page || 1,
                paginate: options.paginate || 10,
                totalPages: 0
            }
        });

    } catch (error) {
        console.error('Get fund requests error:', error);
        return res.failure({
            message: error.message || 'Unable to retrieve fund requests'
        });
    }
};

module.exports = {
    approveFundRequest,
    getFundRequests
};
