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
db.aadhaarCard = require('./aadhaarCard');
db.panCard = require('./panCard');
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

// Schema & Commission Models
db.schema = require('./schema');
db.adminCommission = require('./adminCommission');
db.companyCommission = require('./companyCommission');
db.masterDistributorCommission = require('./masterDistributorCommission');
db.distributorCommission = require('./distributorCommission');
db.retailerCommission = require('./retailerCommission');

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

// User Schema Relationships
db.user.belongsTo(db.schema, {
  foreignKey: 'schemaId',
  as: 'schema',
  targetKey: 'id'
});
db.schema.hasMany(db.user, {
  foreignKey: 'schemaId',
  as: 'users',
  sourceKey: 'id'
});

// Schema Relationships
db.schema.belongsTo(db.company, {
  foreignKey: 'companyId',
  as: 'company',
  targetKey: 'id'
});
db.company.hasMany(db.schema, {
  foreignKey: 'companyId',
  as: 'schemas',
  sourceKey: 'id'
});

db.schema.belongsTo(db.user, {
  foreignKey: 'createdBy',
  as: 'creator',
  targetKey: 'id'
});
db.user.hasMany(db.schema, {
  foreignKey: 'createdBy',
  as: 'createdSchemas',
  sourceKey: 'id'
});

db.schema.belongsTo(db.user, {
  foreignKey: 'assignedTo',
  as: 'assignedUser',
  targetKey: 'id'
});
db.user.hasMany(db.schema, {
  foreignKey: 'assignedTo',
  as: 'assignedSchemas',
  sourceKey: 'id'
});

// Commission Model Relationships
db.adminCommission.belongsTo(db.operator, { foreignKey: 'operatorId', as: 'operator' });
db.adminCommission.belongsTo(db.slab, { foreignKey: 'slabId', as: 'slab' });
db.adminCommission.belongsTo(db.company, { foreignKey: 'companyId', as: 'company' });
db.operator.hasMany(db.adminCommission, { foreignKey: 'operatorId', as: 'adminCommissions' });

db.companyCommission.belongsTo(db.operator, { foreignKey: 'operatorId', as: 'operator' });
db.companyCommission.belongsTo(db.schema, { foreignKey: 'schemaId', as: 'schema' });
db.companyCommission.belongsTo(db.company, { foreignKey: 'companyId', as: 'company' });
db.companyCommission.belongsTo(db.user, { foreignKey: 'assignedToUserId', as: 'assignedUser' });
db.operator.hasMany(db.companyCommission, { foreignKey: 'operatorId', as: 'companyCommissions' });

db.masterDistributorCommission.belongsTo(db.operator, { foreignKey: 'operatorId', as: 'operator' });
db.masterDistributorCommission.belongsTo(db.schema, { foreignKey: 'schemaId', as: 'schema' });
db.masterDistributorCommission.belongsTo(db.company, { foreignKey: 'companyId', as: 'company' });
db.masterDistributorCommission.belongsTo(db.user, { foreignKey: 'masterDistributorId', as: 'masterDistributor' });
db.masterDistributorCommission.belongsTo(db.user, { foreignKey: 'assignedToUserId', as: 'assignedUser' });
db.operator.hasMany(db.masterDistributorCommission, { foreignKey: 'operatorId', as: 'masterDistributorCommissions' });

db.distributorCommission.belongsTo(db.operator, { foreignKey: 'operatorId', as: 'operator' });
db.distributorCommission.belongsTo(db.schema, { foreignKey: 'schemaId', as: 'schema' });
db.distributorCommission.belongsTo(db.company, { foreignKey: 'companyId', as: 'company' });
db.distributorCommission.belongsTo(db.user, { foreignKey: 'distributorId', as: 'distributor' });
db.distributorCommission.belongsTo(db.user, { foreignKey: 'assignedToUserId', as: 'assignedUser' });
db.operator.hasMany(db.distributorCommission, { foreignKey: 'operatorId', as: 'distributorCommissions' });

db.retailerCommission.belongsTo(db.operator, { foreignKey: 'operatorId', as: 'operator' });
db.retailerCommission.belongsTo(db.schema, { foreignKey: 'schemaId', as: 'schema' });
db.retailerCommission.belongsTo(db.company, { foreignKey: 'companyId', as: 'company' });
db.retailerCommission.belongsTo(db.user, { foreignKey: 'retailerId', as: 'retailer' });
db.operator.hasMany(db.retailerCommission, { foreignKey: 'operatorId', as: 'retailerCommissions' });

// User Wallet Relationships
db.user.hasOne(db.wallet, {
  foreignKey: 'refId',
  as: 'wallet',
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
