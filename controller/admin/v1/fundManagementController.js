const model = require('../../../models/index');
const dbService = require('../../../utils/dbService');
const { Op } = require('sequelize');
const { generateTransactionID } = require('../../../utils/transactionID');
const sequelize = require('../../../config/dbConnection');
const imageService = require('../../../services/imageService');
const { uploadImageToS3, getImageUrl } = imageService;

/**
 * Create Fund Request
 * User requests funds from their superior
 */
const createFundRequest = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { amount, paymentMode, payDate, refNo, remark, bankId } = req.body;
    const requestUserId = req.user.id;
    const companyId = req.user.companyId;

    // Validate required fields
    if (!amount || amount <= 0) {
      await transaction.rollback();
      return res.failure({ message: 'Valid amount is required' });
    }

    if (!paymentMode) {
      await transaction.rollback();
      return res.failure({ message: 'Payment mode is required' });
    }

    const validPaymentModes = ['IMPS / NEFT / UPI', 'CASH DEPOSIT', 'CASH IN HAND'];
    if (!validPaymentModes.includes(paymentMode)) {
      await transaction.rollback();
      return res.failure({ message: 'Invalid payment mode. Must be one of: IMPS / NEFT / UPI, CASH DEPOSIT, CASH IN HAND' });
    }

    if (!payDate) {
      await transaction.rollback();
      return res.failure({ message: 'Payment date is required' });
    }

    if (!remark) {
      await transaction.rollback();
      return res.failure({ message: 'Remark is required' });
    }

    // Get requester user details
    const requester = await dbService.findOne(model.user, {
      id: requestUserId,
      isDeleted: false
    });

    if (!requester) {
      await transaction.rollback();
      return res.failure({ message: 'User not found' });
    }

    // Get company details for transaction ID
    const company = await dbService.findOne(model.company, { id: companyId });
    if (!company) {
      await transaction.rollback();
      return res.failure({ message: 'Company not found' });
    }

    // Determine superior user
    let superiorUserId = requester.reportingTo;
    let superiorUser = null;

    // If reportingTo is null, find company admin (userRole = 2)
    if (!superiorUserId) {
      superiorUser = await dbService.findOne(model.user, {
        companyId: companyId,
        userRole: 2,
        isDeleted: false
      });

      if (!superiorUser) {
        await transaction.rollback();
        return res.failure({ message: 'Company admin not found. Cannot process fund request.' });
      }
      superiorUserId = superiorUser.id;
    } else {
      superiorUser = await dbService.findOne(model.user, {
        id: superiorUserId,
        isDeleted: false
      });

      if (!superiorUser) {
        await transaction.rollback();
        return res.failure({ message: 'Superior user not found' });
      }
    }

    // Validate bankId if provided
    if (bankId) {
      const bank = await dbService.findOne(model.customerBank, {
        id: bankId,
        refId: superiorUserId,
        companyId: companyId,
        isActive: true
      }, { transaction });

      if (!bank) {
        await transaction.rollback();
        return res.failure({ message: 'Invalid bank account selected' });
      }
    }

    // Handle payslip file upload (optional)
    let paySlipPath = null;
    if (req.file) {
      try {
        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;
        const uploadResult = await uploadImageToS3(
          fileBuffer,
          fileName,
          'fundManagement',
          companyId,
          'payslip',
          requestUserId
        );
        paySlipPath = uploadResult.key;
      } catch (uploadError) {
        await transaction.rollback();
        return res.failure({ message: `Error uploading payslip: ${uploadError.message}` });
      }
    }

    // Generate transaction ID
    const transactionId = generateTransactionID(company.companyName);

    // Parse payDate
    const paymentDate = new Date(payDate);
    if (isNaN(paymentDate.getTime())) {
      await transaction.rollback();
      return res.failure({ message: 'Invalid payment date format' });
    }

    // Create fund request
    const fundRequest = await model.fundManagement.create(
      {
        requestUserId,
        superiorUserId,
        companyId,
        amount: parseFloat(amount),
        bankId: bankId || null,
        paymentMode,
        payDate: paymentDate,
        refNo: refNo || null,
        paySlip: paySlipPath,
        transactionId,
        status: 'Pending',
        remark: remark,
        addedBy: requestUserId
      },
      { transaction }
    );

    // Create history entry
    await model.fundManagementHistory.create(
      {
        fundManagementId: fundRequest.id,
        requestUserId,
        superiorUserId,
        companyId,
        amount: parseFloat(amount),
        transactionId,
        status: 'Pending',
        action: 'Requested',
        performedBy: requestUserId,
        remark: remark || null,
        addedBy: requestUserId
      },
      { transaction }
    );

    await transaction.commit();

    return res.success({
      message: 'Fund request created successfully',
      data: fundRequest
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error creating fund request:', error);
    return res.internalServerError({ message: error.message });
  }
};

/**
 * Get Fund Requests for Approval
 * Shows requests where current user is the superior
 */
const getFundRequestsForApproval = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const companyId = req.user.companyId;
    const userRole = req.user.userRole;

    let query = {
      status: 'Pending',
      companyId: companyId
    };

    // Super admin can see all requests
    if (userRole === 1) {
      delete query.companyId;
    } else {
      // For others, show requests where they are the superior
      // OR if reportingTo is null, show requests for company admin
      query[Op.or] = [
        { superiorUserId: currentUserId },
        {
          superiorUserId: null,
          companyId: companyId
        }
      ];
    }

    const dataToFind = req.body || {};
    let options = {
      include: [
        {
          model: model.user,
          as: 'requestUser',
          attributes: ['id', 'name', 'mobileNo', 'userRole', 'userId']
        },
        {
          model: model.user,
          as: 'superiorUser',
          attributes: ['id', 'name', 'mobileNo', 'userRole', 'userId'],
          required: false
        },
        {
          model: model.company,
          as: 'company',
          attributes: ['id', 'companyName']
        },
        {
          model: model.customerBank,
          as: 'selectedBank',
          attributes: ['id', 'bankName', 'accountNumber', 'ifsc', 'beneficiaryName'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']]
    };

    if (dataToFind.options) {
      options = { ...options, ...dataToFind.options };
    }

    const requests = await dbService.findAll(model.fundManagement, query, options);

    // Get superior bank list for each request
    const requestsWithBanks = await Promise.all(
      requests.map(async (request) => {
        const requestData = request.toJSON();
        
        // Get superior user
        let superiorId = request.superiorUserId;
        if (!superiorId) {
          // Find company admin
          const companyAdmin = await dbService.findOne(model.user, {
            companyId: request.companyId,
            userRole: 2,
            isDeleted: false
          });
          superiorId = companyAdmin ? companyAdmin.id : null;
        }

        // Get superior bank accounts
        if (superiorId) {
          const banks = await dbService.findAll(model.customerBank, {
            refId: superiorId,
            companyId: request.companyId,
            isActive: true
          });
          requestData.superiorBanks = banks || [];
        } else {
          requestData.superiorBanks = [];
        }

        // Get superior wallet balance
        if (superiorId) {
          const superiorWallet = await dbService.findOne(model.wallet, {
            refId: superiorId,
            companyId: request.companyId
          });
          requestData.superiorWalletBalance = superiorWallet ? superiorWallet.mainWallet : 0;
        } else {
          requestData.superiorWalletBalance = 0;
        }

        // Add payslip URL if exists
        if (requestData.paySlip) {
          requestData.paySlipUrl = getImageUrl(requestData.paySlip);
        }

        return requestData;
      })
    );

    return res.success({
      message: 'Fund requests retrieved successfully',
      data: requestsWithBanks
    });
  } catch (error) {
    console.error('Error getting fund requests:', error);
    return res.internalServerError({ message: error.message });
  }
};

/**
 * Get My Fund Requests
 * Shows requests created by current user
 */
const getMyFundRequests = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const companyId = req.user.companyId;

    let query = {
      requestUserId: currentUserId,
      companyId: companyId
    };

    // Super admin can see all their requests
    if (req.user.userRole === 1) {
      delete query.companyId;
    }

    const dataToFind = req.body || {};
    let options = {
      include: [
        {
          model: model.user,
          as: 'requestUser',
          attributes: ['id', 'name', 'mobileNo', 'userRole', 'userId']
        },
        {
          model: model.user,
          as: 'superiorUser',
          attributes: ['id', 'name', 'mobileNo', 'userRole', 'userId'],
          required: false
        },
        {
          model: model.user,
          as: 'approver',
          attributes: ['id', 'name', 'mobileNo', 'userRole', 'userId'],
          required: false
        },
        {
          model: model.user,
          as: 'rejector',
          attributes: ['id', 'name', 'mobileNo', 'userRole', 'userId'],
          required: false
        },
        {
          model: model.company,
          as: 'company',
          attributes: ['id', 'companyName']
        },
        {
          model: model.customerBank,
          as: 'selectedBank',
          attributes: ['id', 'bankName', 'accountNumber', 'ifsc', 'beneficiaryName'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']]
    };

    if (dataToFind.options) {
      options = { ...options, ...dataToFind.options };
    }

    const requests = await dbService.findAll(model.fundManagement, query, options);

    // Add payslip URLs to requests
    const requestsWithPaySlip = requests.map(request => {
      const requestData = request.toJSON();
      if (requestData.paySlip) {
        requestData.paySlipUrl = getImageUrl(requestData.paySlip);
      }
      return requestData;
    });

    return res.success({
      message: 'Fund requests retrieved successfully',
      data: requestsWithPaySlip
    });
  } catch (error) {
    console.error('Error getting my fund requests:', error);
    return res.internalServerError({ message: error.message });
  }
};

/**
 * Approve Fund Request
 * Superior approves and transfers money
 */
const approveFundRequest = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { message } = req.body;
    const approverId = req.user.id;
    const companyId = req.user.companyId;

    // Get fund request
    const fundRequest = await dbService.findOne(
      model.fundManagement,
      { id, companyId },
      { transaction }
    );

    if (!fundRequest) {
      await transaction.rollback();
      return res.failure({ message: 'Fund request not found' });
    }

    if (fundRequest.status !== 'Pending') {
      await transaction.rollback();
      return res.failure({ message: 'Fund request is not pending' });
    }

    // Verify approver is the superior
    let superiorUserId = fundRequest.superiorUserId;
    if (!superiorUserId) {
      // Find company admin
      const companyAdmin = await model.user.findOne({
        where: {
          companyId: fundRequest.companyId,
          userRole: 2,
          isDeleted: false
        },
        transaction
      });
      
      if (!companyAdmin) {
        await transaction.rollback();
        return res.failure({ message: 'Company admin not found' });
      }
      superiorUserId = companyAdmin.id;
    }

    // Super admin can approve any request
    if (req.user.userRole !== 1 && approverId !== superiorUserId) {
      await transaction.rollback();
      return res.failure({ message: 'You are not authorized to approve this request' });
    }

    // Get superior wallet
    const superiorWallet = await model.wallet.findOne({
      where: { refId: superiorUserId, companyId: fundRequest.companyId },
      transaction
    });

    if (!superiorWallet) {
      await transaction.rollback();
      return res.failure({ message: 'Superior wallet not found' });
    }

    // Check sufficient balance - if insufficient, keep as pending (don't auto-reject)
    // Only reject manually if amount not transferred
    const hasSufficientBalance = superiorWallet.mainWallet >= fundRequest.amount;
    
    if (!hasSufficientBalance) {
      await transaction.rollback();
      return res.failure({ 
        message: 'Insufficient balance in superior wallet. Request will remain pending until sufficient funds are available.',
        data: {
          required: fundRequest.amount,
          available: superiorWallet.mainWallet,
          status: 'Pending'
        }
      });
    }

    // Get requester wallet
    const requesterWallet = await model.wallet.findOne({
      where: { refId: fundRequest.requestUserId, companyId: fundRequest.companyId },
      transaction
    });

    if (!requesterWallet) {
      await transaction.rollback();
      return res.failure({ message: 'Requester wallet not found' });
    }

    // Store old balances
    const superiorOldBalance = superiorWallet.mainWallet;
    const requesterOldBalance = requesterWallet.mainWallet;

    // Transfer money
    const transferAmount = parseFloat(fundRequest.amount);
    superiorWallet.mainWallet = parseFloat((superiorWallet.mainWallet - transferAmount).toFixed(2));
    requesterWallet.mainWallet = parseFloat((requesterWallet.mainWallet + transferAmount).toFixed(2));

    await superiorWallet.save({ transaction });
    await requesterWallet.save({ transaction });

    // Update fund request
    await model.fundManagement.update(
      {
        status: 'Approved',
        message: message || null,
        approvedBy: approverId,
        approvedAt: new Date(),
        updatedBy: approverId
      },
      {
        where: { id: fundRequest.id },
        transaction
      }
    );

    // Create ledger entries
    // Debit from superior
    await model.ledger.create(
      {
        companyId: fundRequest.companyId,
        userId: superiorUserId,
        roleType: req.user.userRole,
        walletType: 'Bank',
        transactionId: fundRequest.transactionId,
        debit: transferAmount,
        credit: 0,
        oldAmt: superiorOldBalance,
        currentAmt: superiorWallet.mainWallet,
        description: `Fund transfer to ${fundRequest.requestUserId}`,
        service: 'Fund Management',
        status: 'Success',
        remark: message || 'Fund request approved'
      },
      { transaction }
    );

    // Credit to requester
    const requesterUser = await model.user.findOne({
      where: { id: fundRequest.requestUserId },
      transaction
    });

    await model.ledger.create(
      {
        companyId: fundRequest.companyId,
        userId: fundRequest.requestUserId,
        roleType: requesterUser?.userRole || 0,
        walletType: 'Bank',
        transactionId: fundRequest.transactionId,
        debit: 0,
        credit: transferAmount,
        oldAmt: requesterOldBalance,
        currentAmt: requesterWallet.mainWallet,
        description: `Fund received from superior`,
        service: 'Fund Management',
        status: 'Success',
        remark: message || 'Fund request approved'
      },
      { transaction }
    );

    // Create wallet history entries
    await model.walletHistory.create(
      {
        refId: superiorUserId,
        companyId: fundRequest.companyId,
        walletType: 'Bank',
        amount: transferAmount,
        debit: transferAmount,
        credit: 0,
        openingAmt: superiorOldBalance,
        closingAmt: superiorWallet.mainWallet,
        transactionId: fundRequest.transactionId,
        paymentStatus: 'SUCCESS',
        remark: `Fund transfer to user ${fundRequest.requestUserId}`,
        addedBy: approverId
      },
      { transaction }
    );

    await model.walletHistory.create(
      {
        refId: fundRequest.requestUserId,
        companyId: fundRequest.companyId,
        walletType: 'Bank',
        amount: transferAmount,
        debit: 0,
        credit: transferAmount,
        openingAmt: requesterOldBalance,
        closingAmt: requesterWallet.mainWallet,
        transactionId: fundRequest.transactionId,
        paymentStatus: 'SUCCESS',
        remark: `Fund received from superior`,
        addedBy: approverId
      },
      { transaction }
    );

    // Create history entry
    await model.fundManagementHistory.create(
      {
        fundManagementId: fundRequest.id,
        requestUserId: fundRequest.requestUserId,
        superiorUserId: superiorUserId,
        companyId: fundRequest.companyId,
        amount: transferAmount,
        transactionId: fundRequest.transactionId,
        status: 'Approved',
        action: 'Approved',
        message: message || null,
        performedBy: approverId,
        oldAmount: superiorOldBalance,
        newAmount: superiorWallet.mainWallet,
        requesterOldAmount: requesterOldBalance,
        requesterNewAmount: requesterWallet.mainWallet,
        addedBy: approverId
      },
      { transaction }
    );

    await transaction.commit();

    return res.success({
      message: 'Fund request approved and money transferred successfully',
      data: {
        fundRequest: await model.fundManagement.findOne({
          where: { id: fundRequest.id },
          include: [
            { model: model.user, as: 'requestUser', attributes: ['id', 'name', 'mobileNo', 'userRole', 'userId'] },
            { model: model.user, as: 'approver', attributes: ['id', 'name', 'mobileNo', 'userRole', 'userId'] }
          ]
        }),
        superiorNewBalance: superiorWallet.mainWallet,
        requesterNewBalance: requesterWallet.mainWallet
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error approving fund request:', error);
    return res.internalServerError({ message: error.message });
  }
};

/**
 * Reject Fund Request
 */
const rejectFundRequest = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { message } = req.body;
    const rejectorId = req.user.id;
    const companyId = req.user.companyId;

    // Get fund request
    const fundRequest = await model.fundManagement.findOne({
      where: { id, companyId },
      transaction
    });

    if (!fundRequest) {
      await transaction.rollback();
      return res.failure({ message: 'Fund request not found' });
    }

    if (fundRequest.status !== 'Pending') {
      await transaction.rollback();
      return res.failure({ message: 'Fund request is not pending' });
    }

    // Verify rejector is the superior
    let superiorUserId = fundRequest.superiorUserId;
    if (!superiorUserId) {
      // Find company admin
      const companyAdmin = await model.user.findOne({
        where: {
          companyId: fundRequest.companyId,
          userRole: 2,
          isDeleted: false
        },
        transaction
      });
      
      if (!companyAdmin) {
        await transaction.rollback();
        return res.failure({ message: 'Company admin not found' });
      }
      superiorUserId = companyAdmin.id;
    }

    // Super admin can reject any request
    if (req.user.userRole !== 1 && rejectorId !== superiorUserId) {
      await transaction.rollback();
      return res.failure({ message: 'You are not authorized to reject this request' });
    }

    // Update fund request
    await model.fundManagement.update(
      {
        status: 'Rejected',
        message: message || null,
        rejectedBy: rejectorId,
        rejectedAt: new Date(),
        updatedBy: rejectorId
      },
      {
        where: { id: fundRequest.id },
        transaction
      }
    );

    // Create history entry
    await model.fundManagementHistory.create(
      {
        fundManagementId: fundRequest.id,
        requestUserId: fundRequest.requestUserId,
        superiorUserId: superiorUserId,
        companyId: fundRequest.companyId,
        amount: fundRequest.amount,
        transactionId: fundRequest.transactionId,
        status: 'Rejected',
        action: 'Rejected',
        message: message || null,
        performedBy: rejectorId,
        addedBy: rejectorId
      },
      { transaction }
    );

    await transaction.commit();

    return res.success({
      message: 'Fund request rejected successfully',
      data: await model.fundManagement.findOne({
        where: { id: fundRequest.id },
        include: [
          { model: model.user, as: 'requestUser', attributes: ['id', 'name', 'mobileNo', 'userRole', 'userId'] },
          { model: model.user, as: 'rejector', attributes: ['id', 'name', 'mobileNo', 'userRole', 'userId'] }
        ]
      })
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error rejecting fund request:', error);
    return res.internalServerError({ message: error.message });
  }
};

/**
 * Get Downline Users
 * Get all users who report to current user
 */
const getDownlineUsers = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const companyId = req.user.companyId;

    let query = {
      reportingTo: currentUserId,
      isDeleted: false,
      companyId: companyId
    };

    // Super admin can see all users
    if (req.user.userRole === 1) {
      delete query.companyId;
    }

    const dataToFind = req.body || {};
    let options = {
      include: [
        {
          model: model.wallet,
          as: 'wallet',
          attributes: ['id', 'mainWallet', 'apesWallet'],
          required: false
        },
        {
          model: model.company,
          as: 'company',
          attributes: ['id', 'companyName']
        }
      ],
      attributes: ['id', 'name', 'mobileNo', 'userRole', 'userId', 'reportingTo', 'companyId'],
      order: [['createdAt', 'DESC']]
    };

    if (dataToFind.options) {
      options = { ...options, ...dataToFind.options };
    }

    const downlineUsers = await dbService.findAll(model.user, query, options);

    return res.success({
      message: 'Downline users retrieved successfully',
      data: downlineUsers
    });
  } catch (error) {
    console.error('Error getting downline users:', error);
    return res.internalServerError({ message: error.message });
  }
};

/**
 * Get Superior Bank List
 * Get bank accounts of the superior user
 */
const getSuperiorBankList = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const companyId = req.user.companyId;

    // Get current user
    const currentUser = await dbService.findOne(model.user, {
      id: currentUserId,
      isDeleted: false
    });

    if (!currentUser) {
      return res.failure({ message: 'User not found' });
    }

    // Determine superior user
    let superiorUserId = currentUser.reportingTo;
    let superiorUser = null;

    // If reportingTo is null, find company admin
    if (!superiorUserId) {
      superiorUser = await dbService.findOne(model.user, {
        companyId: companyId,
        userRole: 2,
        isDeleted: false
      });

      if (!superiorUser) {
        return res.failure({ message: 'Company admin not found' });
      }
      superiorUserId = superiorUser.id;
    } else {
      superiorUser = await dbService.findOne(model.user, {
        id: superiorUserId,
        isDeleted: false
      });

      if (!superiorUser) {
        return res.failure({ message: 'Superior user not found' });
      }
    }

    // Get superior bank accounts
    const banks = await dbService.findAll(model.customerBank, {
      refId: superiorUserId,
      companyId: companyId,
      isActive: true
    });

    // Get superior wallet balance
    const superiorWallet = await dbService.findOne(model.wallet, {
      refId: superiorUserId,
      companyId: companyId
    });

    return res.success({
      message: 'Superior bank list retrieved successfully',
      data: {
        superiorUser: {
          id: superiorUser.id,
          name: superiorUser.name,
          mobileNo: superiorUser.mobileNo,
          userRole: superiorUser.userRole,
          userId: superiorUser.userId
        },
        banks: banks || [],
        walletBalance: superiorWallet ? superiorWallet.mainWallet : 0
      }
    });
  } catch (error) {
    console.error('Error getting superior bank list:', error);
    return res.internalServerError({ message: error.message });
  }
};

/**
 * Get Fund Request History
 */
const getFundRequestHistory = async (req, res) => {
  try {
    const { fundManagementId } = req.params;
    const companyId = req.user.companyId;

    let query = {
      fundManagementId: fundManagementId,
      companyId: companyId
    };

    // Super admin can see all
    if (req.user.userRole === 1) {
      delete query.companyId;
    }

    const dataToFind = req.body || {};
    let options = {
      include: [
        {
          model: model.user,
          as: 'requestUser',
          attributes: ['id', 'name', 'mobileNo', 'userRole', 'userId']
        },
        {
          model: model.user,
          as: 'superiorUser',
          attributes: ['id', 'name', 'mobileNo', 'userRole', 'userId'],
          required: false
        },
        {
          model: model.user,
          as: 'performer',
          attributes: ['id', 'name', 'mobileNo', 'userRole', 'userId'],
          required: false
        },
        {
          model: model.company,
          as: 'company',
          attributes: ['id', 'companyName']
        }
      ],
      order: [['createdAt', 'DESC']]
    };

    if (dataToFind.options) {
      options = { ...options, ...dataToFind.options };
    }

    const history = await dbService.findAll(model.fundManagementHistory, query, options);

    return res.success({
      message: 'Fund request history retrieved successfully',
      data: history
    });
  } catch (error) {
    console.error('Error getting fund request history:', error);
    return res.internalServerError({ message: error.message });
  }
};

module.exports = {
  createFundRequest,
  getFundRequestsForApproval,
  getMyFundRequests,
  approveFundRequest,
  rejectFundRequest,
  getDownlineUsers,
  getSuperiorBankList,
  getFundRequestHistory
};

