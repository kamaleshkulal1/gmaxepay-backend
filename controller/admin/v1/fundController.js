const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const imageService = require('../../../services/imageService');
const emailService = require('../../../services/emailService');
const { Op } = require('sequelize');
const { decrypt } = require('../../../utils/encryption');

const processFundRequestData = (data) => {
    if (!data) return data;

    // Handle array of records
    if (Array.isArray(data)) {
        return data.map(record => processFundRequestData(record));
    }

    // Process single record
    const processed = { ...data.dataValues || data };

    // Decrypt and add CDN URL for requester profileImage
    if (processed.requester) {
        const requester = { ...(processed.requester.dataValues || processed.requester) };
        if (requester.profileImage) {
            try {
                const decryptedImage = decrypt(requester.profileImage);
                requester.profileImage = `${process.env.AWS_CDN_URL}/${decryptedImage}`;
            } catch (e) {
                // If decryption fails, set to null
                requester.profileImage = null;
            }
        }
        processed.requester = requester;
    }

    // Decrypt and add CDN URL for approver profileImage
    if (processed.approver) {
        const approver = { ...(processed.approver.dataValues || processed.approver) };
        if (approver.profileImage) {
            try {
                const decryptedImage = decrypt(approver.profileImage);
                approver.profileImage = `${process.env.AWS_CDN_URL}/${decryptedImage}`;
            } catch (e) {
                // If decryption fails, set to null
                approver.profileImage = null;
            }
        }
        processed.approver = approver;
    }

    // Add CDN URL for paySlip
    if (processed.paySlip) {
        processed.paySlip = `${process.env.AWS_CDN_URL}/${processed.paySlip}`;
    }

    return processed;
};

const approveFundRequest = async (req, res) => {
    try {
        // Check if user is superadmin (userRole 1, companyId 1)
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

        // Validate required fields
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

        // Get fund request (can be from any company)
        const fundRequest = await dbService.findOne(model.fundRequest, {
            id: fundRequestId,
            isActive: true,
        });

        if (!fundRequest) {
            return res.failure({ message: 'Fund request not found' });
        }

        // Check if user is authorized to approve (must be the approval ref)
        if (fundRequest.approvalRefId !== req.user.id) {
            return res.failure({ 
                message: 'You are not authorized to approve this request' 
            });
        }

        // Check if already processed
        if (fundRequest.status !== 'PENDING') {
            return res.failure({ 
                message: `This request has already been ${fundRequest.status.toLowerCase()}` 
            });
        }

        // If approved, create fund history entry and credit amount to wallet
        if (action === 'APPROVED') {
            const transferAmount = parseFloat(fundRequest.amount);

            // Parallel fetch: Get both wallets simultaneously
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

            // Check if approver has sufficient balance in main wallet
            const approverBalance = parseFloat(approverWallet.mainWallet) || 0;
            if (approverBalance < transferAmount) {
                return res.failure({ 
                    message: `Insufficient wallet balance. Available: ${approverBalance}, Required: ${transferAmount}` 
                });
            }

            // Calculate balances
            const approverOpeningBalance = approverBalance;
            const approverClosingBalance = approverBalance - transferAmount;

            const requesterOpeningBalance = parseFloat(requesterWallet.mainWallet) || 0;
            const requesterClosingBalance = requesterOpeningBalance + transferAmount;

            // Prepare wallet history data
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
                openingAmt: requesterOpeningBalance,
                closingAmt: requesterClosingBalance,
                credit: transferAmount,
                debit: 0,
                transactionId: fundRequest.transactionId,
                paymentStatus: 'SUCCESS',
                createdAt: new Date()
            };

            // Parallel execution: Update wallets and create history entries simultaneously
            await Promise.all([
                // Update wallets
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
                // Create wallet history entries
                dbService.createOne(model.walletHistory, approverWalletHistoryData),
                dbService.createOne(model.walletHistory, requesterWalletHistoryData)
            ]);

            // Update existing fund history record from PENDING to CREDITED
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

            // Update final status to APPROVED (only if still PENDING to prevent race condition)
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

            // Check if update was successful
            if (!approvedUpdate || approvedUpdate[0] === 0) {
                return res.failure({ 
                    message: 'This request has already been processed by another user' 
                });
            }

            // Parallel fetch: Get requester and company details simultaneously
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

            // Send Email notifications to requester
            if (requester) {
                try {
                    // Build logo and illustration URLs
                    const backendUrl = process.env.BASE_URL;
                    const logoUrl = (company && company.logo) ? imageService.getImageUrl(company.logo) : `${backendUrl}/gmaxepay.png`;
                    const illustrationUrl = `${backendUrl}/walletload.png`;

                    // Format amount with 2 decimal places
                    const formattedAmount = parseFloat(transferAmount).toFixed(2);

                    // Send Email notification
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
                    // Log error but don't fail the approval process
                    console.error('Error sending notifications:', notificationError);
                }
            }
        } else {
            // Update final status to REJECTED (only if still PENDING to prevent race condition)
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

            // Check if update was successful
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
            companyId: req.user.companyId,
            isActive: true,
            isDelete: false
        };

        // Base filter: by refId (requests made by user) or approvalRefId (requests to approve)
        const baseOrCondition = [
            { refId: req.user.id },
            { approvalRefId: req.user.id }
        ];

        // Build query from request body
        if (dataToFind && dataToFind.query) {
            query = { ...query, ...dataToFind.query };
        }

        // Handle options (pagination, sorting)
        if (dataToFind && dataToFind.options !== undefined) {
            options = { ...dataToFind.options };
        }

        // Add includes for user details (requester and approver)
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

        // Handle customSearch (iLike search on multiple fields)
        // Only support: name, transactionId
        if (dataToFind?.customSearch && typeof dataToFind.customSearch === 'object') {
            const keys = Object.keys(dataToFind.customSearch);
            const searchOrConditions = [];
            let nameSearchValue = null;

            for (const key of keys) {
                const value = dataToFind.customSearch[key];
                if (value === undefined || value === null || String(value).trim() === '') continue;

                // Handle name search separately
                if (key === 'userName' || key === 'name') {
                    nameSearchValue = String(value).trim();
                } else if (key === 'transactionId') {
                    // Direct field search in fundRequest table
                    searchOrConditions.push({
                        [key]: {
                            [Op.iLike]: `%${String(value).trim()}%`
                        }
                    });
                }
            }

            // If searching by name, find matching user IDs first
            if (nameSearchValue) {
                const matchingUsers = await dbService.findAll(model.user, {
                    companyId: req.user.companyId,
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
                    // Add condition to filter by these user IDs (either as requester or approver)
                    searchOrConditions.push({
                        [Op.or]: [
                            { refId: { [Op.in]: userIds } },
                            { approvalRefId: { [Op.in]: userIds } }
                        ]
                    });
                } else {
                    // No users found with that name, return empty results
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
                // Combine base OR condition with search conditions using AND
                query[Op.and] = [
                    { [Op.or]: baseOrCondition },
                    { [Op.and]: searchOrConditions }
                ];
            } else {
                query[Op.or] = baseOrCondition;
            }
        } else {
            query[Op.or] = baseOrCondition;
        }

        // Use paginate for consistent pagination response
        const result = await dbService.paginate(model.fundRequest, query, options);

        // Process data to decrypt profile images and add CDN URLs
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
