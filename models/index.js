/**
 * index.js
 * @description :: exports all the models and its relationships among other models
 */

const dbConnection = require('../config/dbConnection');
const db = {};
db.sequelize = dbConnection;

// User Management Models
db.user = require('./user');
db.userLogin = require('./userLogin');
db.userVerification = require('./userVerification');
db.userPackage = require('./userPackage');

// Role & Permission Models
db.permission = require('./permissions');
db.role = require('./roles');
db.rolePermission = require('./rolePermission');

// Service & Package Models
db.services = require('./service');
db.packages = require('./packages');
db.packageService = require('./packageService');
db.activeServices = require('./activeServices');

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

// Company & KYC Models
db.company = require('./company');
db.kycDocumentSetting = require('./kycDocument');

// IP & Network Models
db.ipInfo = require('./ipInfo');
db.ipListType = require('./ipListType');

// Commented out models that don't exist yet
// db.outlet = require('./outlet');
// db.news = require('./news');
// db.customer = require('./customer');
// db.bbpsOperatorCategory = require('./bbpsOperatorCategory');
// db.bbpsOperator = require('./bbpsOperator');
// db.eService = require('./eServiceReport');
// db.eServices = require('./EService');
// db.signUpResponses = require('./signUpResponses');
// db.paymentHistory = require('./paymentHistory');
// db.paymentInstrument = require('./paymentInsturment');
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
