/**
 * index.js
 * @description :: exports all the models and its relationships among other models
 */

const dbConnection = require('../config/dbConnection');
const db = {};
db.sequelize = dbConnection;

// Company & KYC Models (Load first as other models reference it)
db.company = require('./company');
db.companyImage = require('./companyImage');
db.kycDocumentSetting = require('./kycDocument');
db.ekycHub = require('./ekycHub');

// User Management Models
db.user = require('./user');
db.userLogin = require('./userLogin');
db.userVerification = require('./userVerification');
db.userPackage = require('./userPackage');
db.onboardingToken = require('./onboardingToken');

// Role & Permission Models
db.permission = require('./permissions');
db.role = require('./roles');
db.rolePermission = require('./rolePermission');

// Service & Package Models
db.services = require('./service');
db.packages = require('./packages');
db.packageService = require('./packageService');
db.activeServices = require('./activeServices');
db.subscription = require('./subscription');
db.serviceCharge = require('./serviceCharge');

// Operator & Category Models
db.operator = require('./operatorMaster');
db.operatorType = require('./operatorTypeList');
db.category = require('./category');

// Location Models
db.state = require('./state');
db.gstState = require('./gstState');

// Financial Models
db.wallet = require('./wallet');
db.walletHistory = require('./walletHistory');
db.ledger = require('./ledger');
db.pgCommercials = require('./pgCommercials');

// Commission & Slab Models
db.slab = require('./slab');
db.commSlab = require('./CommSlab');
db.distributorSlabCom = require('./distributorSlabCom');
db.range = require('./range');
db.rangeCharges = require('./rangeCharges');
db.rangeCommission = require('./rangeCommission');

// Bank & Payment Models
db.bank = require('./bank');
db.customerBank = require('./customerBank');
db.cardType = require('./cardType');
db.paymentInstrument = require('./paymentInsturment');

// IP & Network Models
db.ipInfo = require('./ipInfo');
db.ipListType = require('./ipListType');

// Commented out models that don't exist yet
db.outlet = require('./outlet');
db.news = require('./news');
db.customer = require('./customer');
// db.bbpsOperatorCategory = require('./bbpsOperatorCategory');
// db.bbpsOperator = require('./bbpsOperator');
db.eService = require('./eServiceReport');
db.eServices = require('./EService');
// db.signUpResponses = require('./signUpResponses');
// db.paymentHistory = require('./paymentHistory');
// db.paymentLogs = require('./paymentLogs');
db.notification = require('./notification');
// db.rechargeHistory = require('./rechargeHistory');
// db.rechargeCount = require('./rechargeCount');
// db.billPaymentHistory = require('./billPaymentHistory');
// db.billFetchData = require('./billFetchData');
// db.complain = require('./complain');
// db.bbpsBillerInfo = require('./bbpsBillerInfo');
// db.bbpsPaymentInfo = require('./bbpsPaymentInfo');
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

// BBPS Operator Relationships (commented out as models don't exist yet)
// db.bbpsOperator.belongsTo(db.bbpsOperatorCategory, {
//   foreignKey: 'categoryId',
//   as: 'category'
// });
// db.bbpsOperatorCategory.hasMany(db.bbpsOperator, {
//   foreignKey: 'categoryId',
//   as: 'operators'
// });

module.exports = db;
