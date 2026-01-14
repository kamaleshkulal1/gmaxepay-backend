const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { generateTransactionID } = require('../../../utils/transactionID');
const imageService = require('../../../services/imageService');
const { Op } = require('sequelize');

const fundTransferRequest = async (req, res) => {
    try {
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
            isActive: true,
            isDeleted: false
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
                isActive: true,
                isDeleted: false
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
                isActive: true,
                isDeleted: false
            });
            
            if (!companyAdmin) {
                return res.failure({ message: 'Company admin not found' });
            }
            
            approvalRefId = companyAdmin.id;
        }

        // Verify bank belongs to user
        const userBank = await dbService.findOne(model.customerBank, {
            id: bankId,
            companyId: req.user.companyId
        });

        if (!userBank) {
            return res.failure({ message: 'Invalid bank selection' });
        }

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
            bankId: bankId,
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
        const { fundRequestId, action, approvalRemarks } = req.body;

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
            isDelete: false
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

        // Update fund request status
        const updateData = {
            status: action,
            approvalRemarks: approvalRemarks || null,
            approvedAt: new Date(),
            updatedBy: req.user.id
        };

        await dbService.updateOne(
            model.fundRequest, 
            { id: fundRequestId }, 
            updateData
        );

        // If approved, create fund history entry and credit amount to wallet
        if (action === 'APPROVED') {
            const transferAmount = parseFloat(fundRequest.amount);

            // Get approver's wallet (debit from)
            const approverWallet = await dbService.findOne(model.wallet, {
                refId: req.user.id,
                companyId: req.user.companyId
            });

            if (!approverWallet) {
                return res.failure({ message: 'Approver wallet not found' });
            }

            // Check if approver has sufficient balance
            const approverBalance = parseFloat(approverWallet.balance) || 0;
            if (approverBalance < transferAmount) {
                return res.failure({ 
                    message: `Insufficient balance. Available: ${approverBalance}, Required: ${transferAmount}` 
                });
            }

            // Get requester's wallet (credit to)
            const requesterWallet = await dbService.findOne(model.wallet, {
                refId: fundRequest.refId,
                companyId: req.user.companyId
            });

            if (!requesterWallet) {
                return res.failure({ message: 'Requester wallet not found' });
            }

            // Calculate balances
            const approverOpeningBalance = approverBalance;
            const approverClosingBalance = approverBalance - transferAmount;

            const requesterOpeningBalance = parseFloat(requesterWallet.balance) || 0;
            const requesterClosingBalance = requesterOpeningBalance + transferAmount;

            // Debit from approver's wallet
            await dbService.updateOne(
                model.wallet,
                { refId: req.user.id, companyId: req.user.companyId },
                { balance: approverClosingBalance }
            );

            // Create wallet history entry for approver (DEBIT)
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

            await dbService.createOne(model.walletHistory, approverWalletHistoryData);

            // Credit to requester's wallet
            await dbService.updateOne(
                model.wallet,
                { refId: fundRequest.refId, companyId: req.user.companyId },
                { balance: requesterClosingBalance }
            );

            // Create wallet history entry for requester (CREDIT)
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

            await dbService.createOne(model.walletHistory, requesterWalletHistoryData);

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

            await dbService.updateOne(
                model.fundHistory,
                { fundRequestId: fundRequest.id },
                fundHistoryUpdateData
            );
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
                attributes: ['id', 'bankName', 'accountNumber', 'ifscCode', 'accountHolderName'],
                required: false
            }
        ];

        // Handle customSearch (iLike search on multiple fields)
        if (dataToFind?.customSearch && typeof dataToFind.customSearch === 'object') {
            const keys = Object.keys(dataToFind.customSearch);
            const searchOrConditions = [];

            keys.forEach((key) => {
                const value = dataToFind.customSearch[key];
                if (value === undefined || value === null || String(value).trim() === '') return;

                // Check if searching by userName (search in requester or approver name)
                if (key === 'userName' || key === 'name') {
                    searchOrConditions.push({
                        '$requester.name$': {
                            [Op.iLike]: `%${String(value).trim()}%`
                        }
                    });
                    searchOrConditions.push({
                        '$approver.name$': {
                            [Op.iLike]: `%${String(value).trim()}%`
                        }
                    });
                } else {
                    // Regular field search
                    searchOrConditions.push({
                        [key]: {
                            [Op.iLike]: `%${String(value).trim()}%`
                        }
                    });
                }
            });

            if (searchOrConditions.length > 0) {
                // Combine base OR condition with search OR condition using AND
                query[Op.and] = [
                    { [Op.or]: baseOrCondition },
                    { [Op.or]: searchOrConditions }
                ];
            } else {
                query[Op.or] = baseOrCondition;
            }
        } else {
            query[Op.or] = baseOrCondition;
        }

        // Use paginate for consistent pagination response
        const result = await dbService.paginate(model.fundRequest, query, options);

        return res.success({ 
            message: 'Fund requests retrieved successfully',
            data: result?.data || [],
            total: result?.total || 0,
            paginator: result?.paginator
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
            isActive: true,
            isDelete: false
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
        if (dataToFind?.customSearch && typeof dataToFind.customSearch === 'object') {
            const keys = Object.keys(dataToFind.customSearch);
            const searchOrConditions = [];

            keys.forEach((key) => {
                const value = dataToFind.customSearch[key];
                if (value === undefined || value === null || String(value).trim() === '') return;

                // Check if searching by userName (search in requester or approver name)
                if (key === 'userName' || key === 'name') {
                    searchOrConditions.push({
                        '$requester.name$': {
                            [Op.iLike]: `%${String(value).trim()}%`
                        }
                    });
                    searchOrConditions.push({
                        '$approver.name$': {
                            [Op.iLike]: `%${String(value).trim()}%`
                        }
                    });
                } else {
                    // Regular field search
                    searchOrConditions.push({
                        [key]: {
                            [Op.iLike]: `%${String(value).trim()}%`
                        }
                    });
                }
            });

            if (searchOrConditions.length > 0) {
                query[Op.or] = searchOrConditions;
            }
        }

        // Use paginate for consistent pagination response
        const result = await dbService.paginate(model.fundHistory, query, options);

        return res.success({ 
            message: 'Fund history retrieved successfully',
            data: result?.data || [],
            total: result?.total || 0,
            paginator: result?.paginator
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
        const reportingUser = await dbService.findOne(model.user, { id: existingUser.reportingTo, companyId: req.user.companyId, isActive: true });
        if(!reportingUser){
            return res.failure({ message: 'Reporting user not found' });
        }
        const bankDetailsList = await dbService.findAll(model.customerBank, { refId: reportingUser.id, companyId: reportingUser.companyId });
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
                ifscCode: bankDetails.ifscCode,
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
