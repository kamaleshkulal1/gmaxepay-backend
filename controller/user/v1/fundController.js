const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { generateTransactionID } = require('../../../utils/transactionID');
const imageService = require('../../../services/imageService');
const { Op } = require('sequelize');
const { decrypt } = require('../../../utils/encryption');
const emailService = require('../../../services/emailService');

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

const fundTransferRequest = async (req, res) => {
    try {
        // Check if user is regular user (userRole 3, 4, or 5)
        if (![3, 4, 5].includes(req.user.userRole)) {
            return res.failure({ 
                message: 'Only users with role 3, 4, or 5 can access this endpoint' 
            });
        }

        const { amount, paymentMode, transactionDate, bankId, referenceNo, remarks } = req.body;

        if (!amount || !paymentMode || !transactionDate || !bankId) {
            return res.failure({ 
                message: 'Amount, payment mode, transaction date, and bank are required' 
            });
        }

        // Validate amount
        if (amount <= 0) {
            return res.failure({ message: 'Amount must be greater than zero' });
        }

        // Get current user details
        const existingUser = await dbService.findOne(model.user, { 
            id: req.user.id, 
            companyId: req.user.companyId,
            isActive: true
        });

        if (!existingUser) {
            return res.failure({ message: 'User not found' });
        }

        // Determine who will approve the request
        let approvalRefId;
        
        if (existingUser.reportingTo && existingUser.reportingTo !== null) {
            // If user has a reporting manager, request goes to them
            const reportingUser = await dbService.findOne(model.user, { 
                id: existingUser.reportingTo, 
                companyId: req.user.companyId,
                isActive: true
            });
            
            if (!reportingUser) {
                return res.failure({ message: 'Reporting manager not found' });
            }
            
            approvalRefId = reportingUser.id;
        } else {
            // If no reporting manager, find company admin
            const companyAdmin = await dbService.findOne(model.user, { 
                companyId: req.user.companyId,
                userRole: 2, // Assuming roleId 1 is admin
                isActive: true
            });
            
            if (!companyAdmin) {
                return res.failure({ message: 'Company admin not found' });
            }
            
            approvalRefId = companyAdmin.id;
        }
        
        // Verify bank belongs to approval user (reporting user or company admin)
        const parsedBankId = parseInt(bankId);
        if (isNaN(parsedBankId)) {
            return res.failure({ message: 'Invalid bank ID format' });
        }

        const userBank = await dbService.findOne(model.customerBank, {
            id: parsedBankId,
            refId: approvalRefId,
            companyId: req.user.companyId
        });

        if (!userBank) {
            return res.failure({ message: 'Bank not found or does not belong to the approval user' });
        }

        // Use the verified bank's ID to ensure consistency
        const verifiedBankId = userBank.id;

        // Get company details for transaction ID
        const company = await dbService.findOne(model.company, { 
            id: req.user.companyId 
        });

        // Generate unique transaction ID based on company name
        const transactionId = generateTransactionID(company?.companyName || 'GMAXEPAY');

        // Handle paySlip file upload if exists
        let paySlipKey = null;
        if (req.file && req.file.buffer) {
            try {
                const uploadResult = await imageService.uploadImageToS3(
                    req.file.buffer,
                    req.file.originalname || `payslip_${transactionId}.jpg`,
                    'fund-request',  
                    company.id,       
                    'payslip',        
                    req.user.id  
                );
                paySlipKey = uploadResult.key;
            } catch (uploadError) {
                console.error('PaySlip upload error:', uploadError);
                return res.failure({ 
                    message: 'Failed to upload payment slip',
                    error: uploadError.message 
                });
            }
        }

        // Get requester's wallet for opening balance
        const requesterWallet = await dbService.findOne(model.wallet, {
            refId: req.user.id,
            companyId: req.user.companyId
        });

        if (!requesterWallet) {
            return res.failure({ message: 'Wallet not found' });
        }

        const openingBalance = parseFloat(requesterWallet.balance) || 0;
        const requestAmount = parseFloat(amount);

        // Create fund request
        const fundRequestData = {
            companyId: req.user.companyId,
            refId: req.user.id,
            approvalRefId: approvalRefId,
            transactionId: transactionId,
            bankId: verifiedBankId, // Use the verified bank ID from database
            paymentMode: paymentMode,
            transactionDate: new Date(transactionDate),
            referenceNo: referenceNo || null,
            paySlip: paySlipKey,
            remarks: remarks || null,
            amount: requestAmount,
            status: 'PENDING',
            isActive: true,
            isDelete: false,
            addedBy: req.user.id
        };

        const fundRequest = await dbService.createOne(model.fundRequest, fundRequestData);

        // Create fund history record in PENDING status
        const fundHistoryData = {
            companyId: req.user.companyId,
            refId: req.user.id,
            approvalRefId: approvalRefId,
            fundRequestId: fundRequest.id,
            transactionId: transactionId,
            amount: requestAmount,
            openingBalance: openingBalance,
            closingBalance: openingBalance,
            creditAmount: 0,
            status: 'PENDING',
            remarks: remarks || 'Fund transfer request created',
            approvedAt: new Date(),
            isActive: true,
            isDelete: false,
            addedBy: req.user.id
        };

        await dbService.createOne(model.fundHistory, fundHistoryData);

        return res.success({ 
            message: 'Fund transfer request submitted successfully', 
            data: {
                id: fundRequest.id,
                transactionId: fundRequest.transactionId,
                amount: fundRequest.amount,
                status: fundRequest.status,
                approvalRefId: fundRequest.approvalRefId,
                companyId: req.user.companyId,
                userId: req.user.id,
                paySlipPath: paySlipKey ? `fund-request/${company.id}/payslip/${req.user.id}/${paySlipKey.split('/').pop()}` : null
            }
        });

    } catch (error) {
        console.error('Fund transfer request error:', error);
        return res.failure({ 
            message: error.message || 'Unable to submit fund transfer request' 
        });
    }
};

const approveFundRequest = async (req, res) => {
    try {
        if (![3, 4].includes(req.user.userRole)) {
            return res.failure({ 
                message: 'Only users with role master distributor or distributor can access this endpoint' 
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

        // Get fund request
        const fundRequest = await dbService.findOne(model.fundRequest, {
            id: fundRequestId,
            companyId: req.user.companyId,
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
                    companyId: req.user.companyId
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
                companyId: req.user.companyId,
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
                    { refId: fundRequest.refId, companyId: req.user.companyId },
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
                    companyId: req.user.companyId,
                    isActive: true
                }),
                dbService.findOne(model.company, {
                    id: req.user.companyId
                })
            ]);

            // Send SMS and Email notifications to requester
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
                            companyName: company.companyName,
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
            approvalRefId: req.user.id,
            isActive: true
        };

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
        // Support: name, transactionId, referenceNo
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
                } else if (key === 'transactionId' || key === 'referenceNo') {
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
                    // Add condition to filter by requester user IDs only
                    searchOrConditions.push({
                        refId: { [Op.in]: userIds }
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
                // Combine all search conditions with OR (if multiple) and then AND with base query
                if (searchOrConditions.length === 1) {
                    // Single condition - add directly to query (will be ANDed with base conditions)
                    Object.assign(query, searchOrConditions[0]);
                } else {
                    // Multiple conditions - combine with OR, then AND with base query
                    query[Op.and] = [
                        { [Op.or]: searchOrConditions }
                    ];
                }
            }
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

const getFundHistory = async (req, res) => {
    try {
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
            refId: req.user.id,
            isActive: true
        };

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
                model: model.fundRequest,
                as: 'fundRequest',
                attributes: ['id', 'transactionId', 'amount', 'status', 'paymentMode', 'transactionDate'],
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
                    // Direct field search in fundHistory table
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
                    isActive: true
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
                        message: 'Fund history retrieved successfully',
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
                query[Op.and] = searchOrConditions;
            }
        }

        // Use paginate for consistent pagination response
        const result = await dbService.paginate(model.fundHistory, query, options);

        // Process data to decrypt profile images and add CDN URLs
        const processedData = processFundRequestData(result?.data || []);

        return res.success({ 
            message: 'Fund history retrieved successfully',
            data: processedData,
            total: result?.total || 0,
            paginator: result?.paginator || {
                page: options.page || 1,
                paginate: options.paginate || 10,
                totalPages: 0
            }
        });

    } catch (error) {
        console.error('Get fund history error:', error);
        return res.failure({ 
            message: error.message || 'Unable to retrieve fund history' 
        });
    }
};

const allbankDetails = async (req, res) => {
    try {
        const existingUser = await dbService.findOne(model.user, { id: req.user.id, companyId: req.user.companyId, isActive: true });
        if(!existingUser){
            return res.failure({ message: 'User not found' });
        }
        
        let targetUser = null;
        let bankDetailsList = [];
        
        // First try to get reporting user's bank list
        if(existingUser.reportingTo) {
            targetUser = await dbService.findOne(model.user, { id: existingUser.reportingTo, companyId: req.user.companyId, isActive: true });
            if(targetUser) {
                bankDetailsList = await dbService.findAll(model.customerBank, { refId: targetUser.id, companyId: targetUser.companyId });
            }
        }
        
        // If reportingTo is null OR bank list is empty, fallback to company admin (userRole: 2)
        if(!existingUser.reportingTo || !bankDetailsList || bankDetailsList.length === 0) {
            targetUser = await dbService.findOne(model.user, { 
                userRole: 2, 
                companyId: req.user.companyId, 
                isActive: true 
            });
            
            if(targetUser) {
                bankDetailsList = await dbService.findAll(model.customerBank, { refId: targetUser.id, companyId: targetUser.companyId });
            }
        }
        
        if(!targetUser){
            return res.failure({ message: 'Reporting user or company admin not found' });
        }
        
        if(!bankDetailsList || bankDetailsList.length === 0){
            return res.failure({ message: 'Bank details not found' });
        }
        
        // Process each bank detail to get bank image
        const bankDataList = await Promise.all(bankDetailsList.map(async (bankDetails) => {
            let bankImage = null;
            const bankImage1 = await dbService.findOne(model.practomindBankList, { bankName: bankDetails.bankName });
            if(bankImage1 && bankImage1.bankLogo){
                bankImage = bankImage1.bankLogo;
            } else {
                const bankImage2 = await dbService.findOne(model.aslBankList, { bankName: bankDetails.bankName });
                if(bankImage2 && bankImage2.bankLogo){
                    bankImage = bankImage2.bankLogo;
                }
            }
            
            return {
                bankId: bankDetails.id,
                bankName: bankDetails.bankName,
                ifscCode: bankDetails.ifsc,
                accountNumber: bankDetails.accountNumber,
                isPrimary: bankDetails.isPrimary || false,
                bankImage: bankImage ? `${process.env.AWS_CDN_URL}/${bankImage}` : null
            };
        }));
        
        return res.success({ message: 'All bank details retrieved successfully', data: bankDataList });
    }
    catch (error) {
        console.error('All bank details error:', error);
        return res.failure({ 
            message: error.message || 'Unable to retrieve bank details' 
        });
    }
}

module.exports = {
    fundTransferRequest,
    approveFundRequest,
    getFundRequests,
    getFundHistory,
    allbankDetails
};
