
const dbConnection = require('../config/dbConnection');
const db = {};
db.sequelize = dbConnection;

// Company & KYC Models (Load first as other models reference it)
db.company = require('./company');
db.companyImage = require('./companyImage');
db.kycDocumentSetting = require('./kycDocument');
db.ekycHub = require('./ekycHub');
db.aadhaarCard = require('./aadhaarCard');
db.panCard = require('./panCard');
db.panCardCrud = require('./panCardCrud');
db.digilockerDocument = require('./digilockerDocument');

// User Management Models
db.user = require('./user');
db.userLogin = require('./userLogin');
db.userVerification = require('./userVerification');
db.userPackage = require('./userPackage');
db.onboardingToken = require('./onboardingToken');
db.aepsOnboarding = require('./aepsOnboarding');
db.bioMetric = require('./bioMetric');
db.aepsDailyLogin = require('./aepsDailyLogin');
db.practomindAepsOnboarding = require('./practomindAepsOnbarding');
db.practomindAepsDailyLogin = require('./practomindAepsDailyLogin');
db.dmtRegistration = require('./dmtRegistration');

// Role & Permission Models
db.permission = require('./permissions');
db.role = require('./roles');
db.rolePermission = require('./rolePermission');

// Service & Package Models
db.services = require('./service');
db.packages = require('./packages');
db.packageService = require('./packageService');
db.activeServices = require('./activeServices');
db.serviceCharge = require('./serviceCharge');

// Operator & Category Models
db.operator = require('./operatorMaster');
db.operatorType = require('./operatorTypeList');
db.category = require('./category');

// Location Models
db.state = require('./state');
db.gstState = require('./gstState');
db.rechargeStateCode = require('./RechargeStateCode');

// Bank & Payment Models (Load customerBank early as payoutHistory depends on it)
db.bank = require('./bank');
db.customerBank = require('./customerBank');
db.cardType = require('./cardType');
db.paymentInstrument = require('./paymentInsturment');
db.aslBankList = require('./aslBankList');
db.practomindBankList = require('./practomindBankList');
db.practomindCompanyCode = require('./practomindCompanyCode');
db.practomindState = require('./practomindState');

// Financial Models
db.wallet = require('./wallet');
db.walletHistory = require('./walletHistory');
db.aepsHistory = require('./aepsHistory');
db.practomindAepsHistory = require('./practomindAepsHistory');
db.ledger = require('./ledger');
db.pgCommercials = require('./pgCommercials');
db.payoutHistory = require('./payoutHistory');
db.recharge = require('./recharge');
db.dthRecharge = require('./dthRecharge');
db.serviceTransaction = require('./serviceTransaction');
db.fundRequest = require('./fundRequest');
db.fundHistory = require('./fundHistrory');

// Commission & Slab Models
db.slab = require('./slab');
db.commSlab = require('./CommSlab');
db.distributorSlabCom = require('./distributorSlabCom');
db.range = require('./range');
db.rangeCharges = require('./rangeCharges');
db.rangeCommission = require('./rangeCommission');
db.subscription = require('./subscription');

// IP & Network Models
db.ipInfo = require('./ipInfo');
db.ipListType = require('./ipListType');

// Commented out models that don't exist yet
db.outlet = require('./outlet');
db.news = require('./news');
db.customer = require('./customer');
db.bbpsOperatorCategory = require('./bbpsOperatorCategory');
db.bbpsOperator = require('./bbpsOperator');
db.eService = require('./eServiceReport');
db.eServices = require('./EService');
// db.signUpResponses = require('./signUpResponses');
// db.paymentHistory = require('./paymentHistory');
// db.paymentLogs = require('./paymentLogs');
db.notification = require('./notification');
// db.rechargeHistory = require('./rechargeHistory');
// db.rechargeCount = require('./rechargeCount');
db.billPaymentHistory = require('./billPaymentHistory');
db.billFetchData = require('./billFetchData');
// db.complain = require('./complain');
db.bbpsBillerInfo = require('./bbpsBillerInfo');
db.bbpsPaymentInfo = require('./bbpsPaymentInfo');
// db.apiUser = require('./apiUser');
// db.apiUserWallet = require('./apiUserWallet');
// db.payInPaymentChannel = require('./payInPaymentChannel');

db.user.belongsTo(db.user, {
  foreignKey: 'addedBy',
  as: '_addedBy',
  targetKey: 'id'
});
db.user.hasMany(db.user, {
  foreignKey: 'addedBy',
  sourceKey: 'id'
});
db.user.belongsTo(db.user, {
  foreignKey: 'updatedBy',
  as: '_updatedBy',
  targetKey: 'id'
});
db.user.hasMany(db.user, {
  foreignKey: 'updatedBy',
  sourceKey: 'id'
});

/*
 *  db.rolePermission.hasMany(db.role, {
 *    foreignKey: 'id',
 *    targetKey: 'roleID',
 *  });
 */
db.rolePermission.hasMany(db.role, {
  foreignKey: 'id',
  targetKey: 'roleId'
});
db.role.hasMany(db.rolePermission, { foreignKey: 'roleId' });
db.permission.hasMany(db.rolePermission, { foreignKey: 'permissionId' });

db.rolePermission.belongsTo(db.role, { foreignKey: 'roleId' });
db.rolePermission.belongsTo(db.permission, { foreignKey: 'permissionId' });

// User Verification Relationships
db.userVerification.belongsTo(db.user, {
  foreignKey: 'userId',
  as: 'user'
});
db.user.hasOne(db.userVerification, {
  foreignKey: 'userId',
  as: 'verification'
});

// Wallet History Relationships
db.walletHistory.belongsTo(db.user, {
  foreignKey: 'refId',
  as: 'user'
});
db.user.hasMany(db.walletHistory, {
  foreignKey: 'refId',
  as: 'walletHistories'
});

db.walletHistory.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company'
});
db.company.hasMany(db.walletHistory, {
  foreignKey: 'companyId',
  as: 'walletHistories'
});

// eKYC Hub Relationships
db.ekycHub.belongsTo(db.user, {
  foreignKey: 'addedBy',
  as: 'user',
  targetKey: 'id'
});
db.user.hasMany(db.ekycHub, {
  foreignKey: 'addedBy',
  as: 'ekycRecords',
  sourceKey: 'id'
});

db.ekycHub.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.ekycHub, {
  foreignKey: 'companyId',
  as: 'ekycRecords',
  sourceKey: 'id'
});

// Company Image Relationships
db.companyImage.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.companyImage, {
  foreignKey: 'companyId',
  as: 'images',
  sourceKey: 'id'
});

db.companyImage.belongsTo(db.user, {
  foreignKey: 'userId',
  as: 'user',
  targetKey: 'id'
});
db.user.hasMany(db.companyImage, {
  foreignKey: 'userId',
  as: 'images',
  sourceKey: 'id'
});

// Onboarding Token Relationships
db.onboardingToken.belongsTo(db.user, {
  foreignKey: 'userId',
  as: 'user',
  targetKey: 'id'
});
db.user.hasMany(db.onboardingToken, {
  foreignKey: 'userId',
  as: 'onboardingTokens',
  sourceKey: 'id'
});

db.onboardingToken.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.onboardingToken, {
  foreignKey: 'companyId',
  as: 'onboardingTokens',
  sourceKey: 'id'
});

// Digilocker Document Relationships
db.digilockerDocument.belongsTo(db.user, {
  foreignKey: 'refId',
  as: 'user',
  targetKey: 'id'
});
db.user.hasMany(db.digilockerDocument, {
  foreignKey: 'refId',
  as: 'digilockerDocuments',
  sourceKey: 'id'
});

db.digilockerDocument.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.digilockerDocument, {
  foreignKey: 'companyId',
  as: 'digilockerDocuments',
  sourceKey: 'id'
});

// AEPS Onboarding Relationships
db.aepsOnboarding.belongsTo(db.user, {
  foreignKey: 'userId',
  as: 'user',
  targetKey: 'id'
});
db.user.hasMany(db.aepsOnboarding, {
  foreignKey: 'userId',
  as: 'aepsOnboardings',
  sourceKey: 'id'
});

db.aepsOnboarding.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.aepsOnboarding, {
  foreignKey: 'companyId',
  as: 'aepsOnboardings',
  sourceKey: 'id'
});

// Bio Metric Relationships
db.bioMetric.belongsTo(db.user, {
  foreignKey: 'refId',
  as: 'user',
  targetKey: 'id'
});
db.user.hasMany(db.bioMetric, {
  foreignKey: 'refId',
  as: 'bioMetrics',
  sourceKey: 'id'
});

db.bioMetric.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.bioMetric, {
  foreignKey: 'companyId',
  as: 'bioMetrics',
  sourceKey: 'id'
});

// AEPS Daily Login Relationships
db.aepsDailyLogin.belongsTo(db.user, {
  foreignKey: 'refId',
  as: 'user',
  targetKey: 'id'
});
db.user.hasMany(db.aepsDailyLogin, {
  foreignKey: 'refId',
  as: 'aepsDailyLogins',
  sourceKey: 'id'
});

db.aepsDailyLogin.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.aepsDailyLogin, {
  foreignKey: 'companyId',
  as: 'aepsDailyLogins',
  sourceKey: 'id'
});

// Practomind AEPS Onboarding Relationships
db.practomindAepsOnboarding.belongsTo(db.user, {
  foreignKey: 'userId',
  as: 'user',
  targetKey: 'id'
});
db.user.hasMany(db.practomindAepsOnboarding, {
  foreignKey: 'userId',
  as: 'practomindAepsOnboardings',
  sourceKey: 'id'
});

db.practomindAepsOnboarding.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.practomindAepsOnboarding, {
  foreignKey: 'companyId',
  as: 'practomindAepsOnboardings',
  sourceKey: 'id'
});

// Practomind AEPS Daily Login Relationships
db.practomindAepsDailyLogin.belongsTo(db.user, {
  foreignKey: 'refId',
  as: 'user',
  targetKey: 'id'
});
db.user.hasMany(db.practomindAepsDailyLogin, {
  foreignKey: 'refId',
  as: 'practomindAepsDailyLogins',
  sourceKey: 'id'
});

db.practomindAepsDailyLogin.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.practomindAepsDailyLogin, {
  foreignKey: 'companyId',
  as: 'practomindAepsDailyLogins',
  sourceKey: 'id'
});

// DMT Registration Relationships
db.dmtRegistration.belongsTo(db.user, {
  foreignKey: 'refId',
  as: 'user',
  targetKey: 'id'
});
db.user.hasMany(db.dmtRegistration, {
  foreignKey: 'refId',
  as: 'dmtRegistrations',
  sourceKey: 'id'
});

db.dmtRegistration.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.dmtRegistration, {
  foreignKey: 'companyId',
  as: 'dmtRegistrations',
  sourceKey: 'id'
});

// Customer Bank Relationships
db.customerBank.belongsTo(db.user, {
  foreignKey: 'refId',
  as: 'user',
  targetKey: 'id'
});
db.user.hasMany(db.customerBank, {
  foreignKey: 'refId',
  as: 'customerBanks',
  sourceKey: 'id'
});

db.customerBank.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.customerBank, {
  foreignKey: 'companyId',
  as: 'customerBanks',
  sourceKey: 'id'
});

db.customerBank.belongsTo(db.customer, {
  foreignKey: 'customerId',
  as: 'customer',
  targetKey: 'id'
});
db.customer.hasMany(db.customerBank, {
  foreignKey: 'customerId',
  as: 'customerBanks',
  sourceKey: 'id'
});

// User Company Relationships
db.user.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.user, {
  foreignKey: 'companyId',
  as: 'users',
  sourceKey: 'id'
});


// User Wallet Relationships
db.user.hasOne(db.wallet, {
  foreignKey: 'refId',
  as: 'wallet',
  sourceKey: 'id'
});

// AEPS History Company Relationships
db.aepsHistory.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.aepsHistory, {
  foreignKey: 'companyId',
  as: 'aepsHistories',
  sourceKey: 'id'
});

// AEPS History User Relationships
// Note: belongsTo is already defined in aepsHistory.js model file
db.user.hasMany(db.aepsHistory, {
  foreignKey: 'refId',
  as: 'aepsHistories',
  sourceKey: 'id'
});

// AEPS History Bank Relationships
db.aepsHistory.belongsTo(db.aslBankList, {
  foreignKey: 'bankiin',
  targetKey: 'bankIIN',
  as: 'bank',
  required: false
});
db.aslBankList.hasMany(db.aepsHistory, {
  foreignKey: 'bankiin',
  sourceKey: 'bankIIN',
  as: 'aepsHistories'
});

// Practomind AEPS History Relationships
db.practomindAepsHistory.belongsTo(db.user, {
  foreignKey: 'refId',
  as: 'user',
  targetKey: 'id'
});
db.user.hasMany(db.practomindAepsHistory, {
  foreignKey: 'refId',
  as: 'practomindAepsHistories',
  sourceKey: 'id'
});

db.practomindAepsHistory.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.practomindAepsHistory, {
  foreignKey: 'companyId',
  as: 'practomindAepsHistories',
  sourceKey: 'id'
});

db.practomindAepsHistory.belongsTo(db.practomindBankList, {
  foreignKey: 'bankIin',
  targetKey: 'aeps_bank_id',
  as: 'bank',
  required: false
});
db.practomindBankList.hasMany(db.practomindAepsHistory, {
  foreignKey: 'bankIin',
  sourceKey: 'aeps_bank_id',
  as: 'practomindAepsHistories'
});

// BBPS Operator Relationships
db.bbpsOperator.belongsTo(db.bbpsOperatorCategory, {
  foreignKey: 'categoryId',
  as: 'category'
});
db.bbpsOperatorCategory.hasMany(db.bbpsOperator, {
  foreignKey: 'categoryId',
  as: 'operators'
});

// PAN Card CRUD Relationships
db.panCardCrud.belongsTo(db.user, {
  foreignKey: 'refId',
  as: 'user',
  targetKey: 'id'
});
db.user.hasMany(db.panCardCrud, {
  foreignKey: 'refId',
  as: 'panCardRequests',
  sourceKey: 'id'
});

db.panCardCrud.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.panCardCrud, {
  foreignKey: 'companyId',
  as: 'panCardRequests',
  sourceKey: 'id'
});

// Payout History Relationships
// Note: belongsTo association is already defined in payoutHistory.js model file
db.user.hasMany(db.payoutHistory, {
  foreignKey: 'refId',
  as: 'payoutHistories',
  sourceKey: 'id'
});

db.payoutHistory.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.payoutHistory, {
  foreignKey: 'companyId',
  as: 'payoutHistories',
  sourceKey: 'id'
});

db.payoutHistory.belongsTo(db.customerBank, {
  foreignKey: 'customerBankId',
  as: 'customerBank',
  targetKey: 'id'
});
db.customerBank.hasMany(db.payoutHistory, {
  foreignKey: 'customerBankId',
  as: 'payoutHistories',
  sourceKey: 'id'
});

// Recharge Relationships
// Note: belongsTo association is already defined in recharge.js model file
db.user.hasMany(db.recharge, {
  foreignKey: 'refId',
  as: 'recharges',
  sourceKey: 'id'
});

db.recharge.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.recharge, {
  foreignKey: 'companyId',
  as: 'recharges',
  sourceKey: 'id'
});

// DTH Recharge Relationships
// Note: belongsTo association is already defined in dthRecharge.js model file
db.user.hasMany(db.dthRecharge, {
  foreignKey: 'refId',
  as: 'dthRecharges',
  sourceKey: 'id'
});

db.dthRecharge.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.dthRecharge, {
  foreignKey: 'companyId',
  as: 'dthRecharges',
  sourceKey: 'id'
});

// Fund Request Relationships
db.fundRequest.belongsTo(db.user, {
  foreignKey: 'refId',
  as: 'requester',
  targetKey: 'id'
});
db.user.hasMany(db.fundRequest, {
  foreignKey: 'refId',
  as: 'fundRequests',
  sourceKey: 'id'
});

db.fundRequest.belongsTo(db.user, {
  foreignKey: 'approvalRefId',
  as: 'approver',
  targetKey: 'id'
});
db.user.hasMany(db.fundRequest, {
  foreignKey: 'approvalRefId',
  as: 'fundRequestsToApprove',
  sourceKey: 'id'
});

db.fundRequest.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.fundRequest, {
  foreignKey: 'companyId',
  as: 'fundRequests',
  sourceKey: 'id'
});

db.fundRequest.belongsTo(db.customerBank, {
  foreignKey: 'bankId',
  as: 'bank',
  targetKey: 'id'
});
db.customerBank.hasMany(db.fundRequest, {
  foreignKey: 'bankId',
  as: 'fundRequests',
  sourceKey: 'id'
});

// Fund History Relationships
db.fundHistory.belongsTo(db.user, {
  foreignKey: 'refId',
  as: 'requester',
  targetKey: 'id'
});
db.user.hasMany(db.fundHistory, {
  foreignKey: 'refId',
  as: 'fundHistories',
  sourceKey: 'id'
});

db.fundHistory.belongsTo(db.user, {
  foreignKey: 'approvalRefId',
  as: 'approver',
  targetKey: 'id'
});
db.user.hasMany(db.fundHistory, {
  foreignKey: 'approvalRefId',
  as: 'fundHistoriesApproved',
  sourceKey: 'id'
});

db.fundHistory.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.fundHistory, {
  foreignKey: 'companyId',
  as: 'fundHistories',
  sourceKey: 'id'
});

db.fundHistory.belongsTo(db.fundRequest, {
  foreignKey: 'fundRequestId',
  as: 'fundRequest',
  targetKey: 'id'
});
db.fundRequest.hasOne(db.fundHistory, {
  foreignKey: 'fundRequestId',
  as: 'fundHistory',
  sourceKey: 'id'
});

// Subscription Relationships
db.subscription.belongsTo(db.slab, {
  foreignKey: 'slabId',
  as: 'slab',
  targetKey: 'id'
});
db.slab.hasMany(db.subscription, {
  foreignKey: 'slabId',
  as: 'subscriptions',
  sourceKey: 'id'
});

db.subscription.belongsTo(db.user, {
  foreignKey: 'userId',
  as: 'user',
  targetKey: 'id'
});
db.user.hasMany(db.subscription, {
  foreignKey: 'userId',
  as: 'subscriptions',
  sourceKey: 'id'
});

db.subscription.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.subscription, {
  foreignKey: 'companyId',
  as: 'subscriptions',
  sourceKey: 'id'
});

module.exports = db;
