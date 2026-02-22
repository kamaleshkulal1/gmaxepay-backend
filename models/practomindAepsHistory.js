const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableModelAttribute } = require('../utils/common');

const PractomindAepsHistory = sequelize.define(
  'practomindAepsHistory',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    refId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'user',
        key: 'id'
      },
      allowNull: false,
      comment: 'User ID who performed the transaction'
    },
    companyId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'company',
        key: 'id'
      },
      allowNull: false
    },
    merchantLoginId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Practomind merchant login ID'
    },
    transactionType: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'CW (Cash Withdrawal), BE (Balance Enquiry), MS (Mini Statement), 2FA (Two Factor Auth)'
    },
    transactionAmount: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0,
      comment: 'Transaction amount'
    },
    balanceAmount: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Account balance from response'
    },
    transactionId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Our generated transaction ID'
    },
    merchantTransactionId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Practomind merchant transaction ID'
    },
    bankRRN: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Bank Reference Number'
    },
    fpTransactionId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Fingerprint transaction ID from Practomind'
    },
    partnerTxnid: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Partner transaction ID'
    },
    transactionStatus: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Transaction status from API (successful, failed, pending)'
    },
    status: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      comment: 'Overall API call status (true/false)'
    },
    message: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Response message from API'
    },
    device: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Biometric device used (e.g., MANTRA.MSIPL)'
    },
    requestTransactionTime: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Transaction time from Practomind'
    },
    consumerAadhaarNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Customer Aadhaar number'
    },
    mobileNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Customer mobile number'
    },
    bankIin: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Bank IIN/National Bank Identification Number'
    },
    latitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Transaction location latitude'
    },
    longitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Transaction location longitude'
    },
    receiptUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Receipt URL from Practomind'
    },
    outletname: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Outlet name from response'
    },
    outletmobile: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Outlet mobile from response'
    },
    ministatement: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Mini statement data (for MS transactions)'
    },
    requestPayload: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Full request payload sent to Practomind'
    },
    responsePayload: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Full response from Practomind API'
    },
    superAdminAvail: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    whitelabelAvail: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    masterDistributorAvail: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    distributorAvail: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    retailerAvail: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'IP address of the request'
    },
    // Wallet snapshot for AEPS2 wallet crediting
    openingAeps2Wallet: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'AEPS2 wallet balance before this transaction'
    },
    closingAeps2Wallet: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'AEPS2 wallet balance after this transaction'
    },
    credit: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0,
      comment: 'Net amount credited to initiator AEPS2 wallet'
    },
    // --- Commission Breakdown (for CW and MS only) ---
    superadminComm: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    whitelabelComm: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    masterDistributorCom: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    distributorCom: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    retailerCom: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    // --- TDS on Commission (2% of each party's gross incoming commission) ---
    superadminCommTDS: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    whitelabelCommTDS: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    masterDistributorComTDS: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    distributorComTDS: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    retailerComTDS: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0
    },
    // --- Avail flags: which parties existed in this chain ---
    superAdminAvail: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    whitelabelAvail: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    masterDistributorAvail: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    distributorAvail: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    retailerAvail: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    paymentStatus: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Normalised payment status: SUCCESS | FAILED | PENDING'
    },
    ...reusableModelAttribute
  },
  {
    freezeTableName: true,
    timestamps: true,
    indexes: [
      {
        fields: ['refId', 'companyId']
      },
      {
        fields: ['transactionId']
      },
      {
        fields: ['merchantTransactionId']
      },
      {
        fields: ['bankRRN']
      },
      {
        fields: ['transactionType']
      },
      {
        fields: ['transactionStatus']
      },
      {
        fields: ['createdAt']
      }
    ]
  }
);

sequelizeTransforms(PractomindAepsHistory);
sequelizePaginate.paginate(PractomindAepsHistory);

module.exports = PractomindAepsHistory;
