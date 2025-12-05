/**
 * seeder.js
 * @description :: functions that seeds mock data to run the application
 */
const model = require('../models');
const dbService = require('../utils/dbService');
const authConstant = require('../constants/authConstant');
// const { CopyOption } = require('../model/copyoption');

/* seeds default Settings */

/*
 * async function updateRoleTypes() {
 *     try {
 *         // Fetch all existing roles
 *         let existingRoles = await dbService.findAll(model.role, {});
 */

/*
 *         if (existingRoles && existingRoles.length > 0) {
 *             // Define the role type mapping
 *             const roleTypeMapping = {
 *                 'ADMIN': 1,
 *                 'SUB_ADMIN': 1,
 *                 'RETAILER': 1,
 *                 'MASTER_DISTRIBUTOR': 1,
 *                 'DISTRIBUTOR': 1,
 *                 'API_USER': 1,
 *                 'SALES_MANAGER': 2,
 *                 'SALES_EXECUTIVE': 2,
 *                 'EMPLOYE': 2,
 *                 'CUSTOMER_SUPPORT': 2
 *             };
 */

/*
 *             // Update roles with the new role types
 *             for (let role of existingRoles) {
 *                 if (roleTypeMapping.hasOwnProperty(role.roleName)) {
 *                     await dbService.update(
 *                         model.role,
 *                         { id: role.id },
 *                         { roleType: roleTypeMapping[role.roleName] }
 *                     );
 *                 }
 *             }
 *         } else {
 *             console.log('No roles found to update.');
 *         }
 *     } catch (error) {
 *         console.log('Failed to update role types due to:', error.message);
 *     }
 * }
 */
/*
 *  updateRoleTypes();
 */

async function createBasicPackage() {
  try {
    // Check if basic package already exists
    let existingPackage = await dbService.findOne(model.packages, {
      packageName: 'Basic'
    });

    if (!existingPackage) {
      // Create basic package
      let basicPackage = await dbService.createOne(model.packages, {
        packageName: 'Basic',
        remark: 'Basic package with all services',
        isMore: false,
        isDefault: true,
        isSelfAssigned: false,
        slabAssigned: null,
        companyId:  1,
        addedBy: 1,
        isActive: true
      });

      console.log('Basic package created successfully');

      // Get all services
      let allServices = await dbService.findAll(model.services, {});
      
      if (allServices && allServices.length > 0) {
        // Create package-service relationships for all services
        let packageServiceData = allServices.map(service => ({
          packageId: basicPackage.id,
          serviceId: service.id,
          addedBy: 1,
          isActive: true
        }));

        await dbService.createMany(model.packageService, packageServiceData);
        console.log(`Added ${allServices.length} services to Basic package`);
      }
    } else {
      console.log('Basic package already exists');
    }
  } catch (error) {
    console.log('Failed to create basic package:', error.message);
  }
}

async function KycDocumentSettings() {
  try {
    let existingDoc = await dbService.findOne(model.kycDocumentSetting, {
      id: 1
    });
    if (!existingDoc) {
      let datas = [
        {
          docName: 'PAN Card',
          remark:
            'Upload Business PAN duly signed and stamped by the authorised signatory. TDS will be deposited in this PAN only. PAN once updated cannot be changed.'
        },
        {
          docName: 'Aadhaar Card',
          remark:
            'Upload self attested copy of Aadhaar Card in the name of the authorised signatory.'
        },
        {
          docName: 'Photo',
          remark: 'Upload passport size photograph of authorised signatory.'
        },
        {
          docName: 'Service Agreement',
          remark:
            'Upload Service Agreement duly signed and stamped by authorised signatory on all pages.'
        },
        {
          docName: 'GST Registration',
          remark:
            'If you are registered for GST, it is important that you upload your GST Registration Certificate duly signed and stamped by authorised signatory at the earliest.Please Note: Admin will issue a tax invoice based on the GST registration details provided by you.'
        },
        {
          docName: 'Cancelled Cheque',
          remark:
            'Upload Cancelled Cheque in the name of Firm / Company / Institution.'
        },
        {
          docName: 'Business Address Proof',
          remark:
            'Upload any Business Address Proof duly signed and stamped by authorised signatory.Utility Bill Property Tax Receipt,Property/Municipal Tax Receipt,Business Bank A/c Passbook having address,Copy of any License issued by Govt,TAN allotment letter,TAN allotment letter,IEC Code,Certificate by village panchayat head'
        },
        {
          docName: 'BANK PASSBOOK',
          remark: 'Combined ID Proof document is needed for banking purpose.'
        },
        {
          docName: 'Voter ID',
          remark: 'Upload voter id card for personnel identity.'
        },
        {
          docName: 'Driving License',
          remark: 'Upload driving licence for personal identity.'
        },
        {
          docName: 'Shop Image',
          remark: 'upload your shop image.'
        },
        {
          docName: 'Aadhar Passport Photo',
          remark: 'Internal Use only.'
        }
      ];
      await dbService.createMany(model.kycDocumentSetting, datas);
    }
  } catch (error) {
    console.log('Failed to update Kyc Doc due to:', error.message);
  }
}

async function roles() {
  try {
    // Check if any roles exist
    let existingRoles = await dbService.findOne(model.role, { id: 1 });

    if (!existingRoles) {
      let rolesToInsert = [
        {
          roleType: 1,
          roleName: 'SUPERADMIN',
          isActive: true,
          isDeleted: false
        },
        {
          roleType: 1,
          roleName: 'ADMIN',
          isActive: true,
          isDeleted: false
        },
        {
          roleType: 1,
          roleName: 'MASTER_DISTRIBUTOR',
          isActive: true,
          isDeleted: false
        },
        {
          roleType: 1,
          roleName: 'DISTRIBUTOR',
          isActive: true,
          isDeleted: false
        },
        {
          roleType: 1,
          roleName: 'RETAILER',
          isActive: true,
          isDeleted: false
        },
        {
          roleType: 2,
          roleName: 'EMPLOYEE',
          isActive: true,
          isDeleted: false
        }
      ];

      await dbService.createMany(model.role, rolesToInsert);
    }
  } catch (error) {
    console.error('Settings seeder failed due to ', error.message);
  }
}

async function permissions() {
  try {
    let permission = await dbService.findOne(model.permission, { id: 1 });

    if (!permission) {
      let permissionToInsert = [
        {
          moduleName: 'MEMBERS',
          isParent: true,
          parentId: null,
          isActive: true,
          isDeleted: false
        },

        //API and Operator Management

        {
          moduleName: 'API_&_OPERATOR',
          isParent: true,
          parentId: null,
          isActive: true,
          isDeleted: false
        },

        // Commision
        {
          moduleName: 'RESOURCES',
          isParent: true,
          parentId: null,
          isActive: true,
          isDeleted: false
        },

        // Master and Settings
        {
          moduleName: 'FUND_MANAGEMENT',
          isParent: true,
          parentId: null,
          isActive: true,
          isDeleted: false
        },
        // Shopping
        {
          moduleName: 'REPORTS',
          isParent: true,
          parentId: null,
          isActive: true,
          isDeleted: false
        },
        {
        moduleName: 'TXN_HISTORY',
          isParent: true,
          parentId: null,
          isActive: true,
          isDeleted: false
        }
      ];
      await dbService.createMany(model.permission, permissionToInsert);
    }
  } catch (error) {
    console.log('Settings seeder failed due to ', error.message);
  }
}

async function insertPermissions() {
  try {
    let permission = await dbService.findOne(model.permission, { id: 13 });
    let rolesToInsert;
    if (!permission) {
      rolesToInsert = [
        {
          moduleName: 'USER',
          isParent: null,
          parentId: 1,
          isActive: true,
          isDeleted: false
        },
        {
          moduleName: 'AGENT',
          isParent: null,
          parentId: 1,
          isActive: true,
          isDeleted: false
        },
        {
          moduleName: 'ROLE_MANAGEMENT',
          isParent: null,
          parentId: 1,
          isActive: true,
          isDeleted: false
        },
        {
          moduleName: 'OPERATOR_LIST',
          isParent: null,
          parentId: 2,
          isActive: true,
          isDeleted: false
        },
        {
          moduleName: 'API_SETTINGS',
          isParent: true,
          parentId: 2,
          isActive: true,
          isDeleted: false
        },
        {
          moduleName: 'SCHEME_MANAGER',
          isParent: null,
          parentId: 3,
          isActive: true,
          isDeleted: false
        },
        {
          moduleName: 'ROLE_UPGRADE_REQUEST',
          isParent: null,
          parentId: 3,
          isActive: true,
          isDeleted: false
        },
        {
          moduleName: 'BUSSINESS_REPORT',
          isParent: null,
          parentId: 5,
          isActive: true,
          isDeleted: false
        },
        {
          moduleName: 'EARNINGS_REPORT',
          isParent: null,
          parentId: 5,
          isActive: true,
          isDeleted: false
        },
        {
          moduleName: 'N/W_OVERVIEW_REPORT',
          isParent: null,
          parentId: 5,
          isActive: true,
          isDeleted: false
        }
      ];
      await dbService.createMany(model.permission, rolesToInsert);
    }

    console.log('Permissions inserted successfully.');
  } catch (error) {
    console.error('Error inserting permissions:', error);
  }
}

async function rolePermission() {
  try {
    console.log('Starting rolePermission seeder...');
    
    let rolesPermission = await dbService.findOne(model.rolePermission, {
      id: 1
    });

    if (!rolesPermission) {
      console.log('No existing rolePermission found, inserting new data...');
      
      // First, let's get all existing permissions to ensure we only reference valid IDs
      let existingPermissions = await dbService.findAll(model.permission, {});
      console.log(`Found ${existingPermissions.length} existing permissions`);
      
      let rolesPermissionToInsert = [
        // For Role SUPERADMIN
        {
          roleId: 1,
          permissionId: 1,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 1,
          permissionId: 2,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 1,
          permissionId: 3,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 1,
          permissionId: 4,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 1,
          permissionId: 5,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 1,
          permissionId: 6,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 1,
          permissionId: 7,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 1,
          permissionId: 8,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 1,
          permissionId: 9,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 1,
          permissionId: 10,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 1,
          permissionId: 11,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 1,
          permissionId: 12,
          read: true,
          write: true,
          isDeleted: false
        },
        {
          roleId: 1,
          permissionId: 13,
          read: true,
          write: true,
          isDeleted: false
        },
        {
          roleId: 1,
          permissionId: 14,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 1,
          permissionId: 15,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 1,
          permissionId: 16,
          read: false,
          write: false,
          isDeleted: false
        },
        // {
        //   roleId: 1,
        //   permissionId: 17,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 18,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 19,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 20,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 21,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 22,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 23,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 24,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 25,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 26,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 27,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 28,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 29,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 30,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 31,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 32,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 33,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 34,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 35,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 36,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 37,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 38,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 39,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 40,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 41,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 42,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 43,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 44,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 45,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 46,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 47,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 48,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 49,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 50,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 51,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 52,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 53,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 54,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 55,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 56,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 57,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 58,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 59,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 60,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 61,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 62,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 63,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 64,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 65,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 66,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 67,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 68,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 69,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 1,
        //   permissionId: 70,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },

        // For Role ADMIN(COMPANY ADMIN)

        {
          roleId: 2,
          permissionId: 1,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 2,
          permissionId: 2,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 2,
          permissionId: 3,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 2,
          permissionId: 4,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 2,
          permissionId: 5,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 2,
          permissionId: 6,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 2,
          permissionId: 7,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 2,
          permissionId: 8,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 2,
          permissionId: 9,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 2,
          permissionId: 10,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 2,
          permissionId: 11,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 2,
          permissionId: 12,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 2,
          permissionId: 13,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 2,
          permissionId: 14,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 2,
          permissionId: 15,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 2,
          permissionId: 16,
          read: false,
          write: false,
          isDeleted: false
        },
        // {
        //   roleId: 2,
        //   permissionId: 17,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 18,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 19,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 20,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 21,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 22,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 23,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 24,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 25,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 26,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 27,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 28,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 29,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 30,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 31,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 32,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 33,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 34,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 35,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 36,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 37,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 38,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 39,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 40,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 41,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 42,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 43,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 44,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 45,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 46,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 47,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 48,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 49,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 50,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 51,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 52,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 53,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 54,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 55,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 56,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 57,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 58,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 59,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 60,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 61,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 62,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 63,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 64,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 65,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 66,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 67,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 68,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 69,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 2,
        //   permissionId: 70,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },

        // For Role MASTER_DISTRIBUTOR

        {
          roleId: 3,
          permissionId: 1,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 3,
          permissionId: 2,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 3,
          permissionId: 3,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 3,
          permissionId: 4,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 3,
          permissionId: 5,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 3,
          permissionId: 6,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 3,
          permissionId: 7,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 3,
          permissionId: 8,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 3,
          permissionId: 9,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 3,
          permissionId: 10,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 3,
          permissionId: 11,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 3,
          permissionId: 12,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 3,
          permissionId: 13,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 3,
          permissionId: 14,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 3,
          permissionId: 15,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 3,
          permissionId: 16,
          read: false,
          write: false,
          isDeleted: false
        },
        // {
        //   roleId: 3,
        //   permissionId: 17,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 18,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 19,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 20,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 21,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 22,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 23,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 24,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 25,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 26,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 27,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 28,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 29,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 30,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 31,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 32,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 33,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 34,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 35,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 36,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 37,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 38,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 39,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 40,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 41,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 42,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 43,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 44,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 45,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 46,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 47,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 48,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 49,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 50,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 51,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 52,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 53,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 54,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 55,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 56,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 57,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 58,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 59,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 60,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 61,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 62,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 63,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 64,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 65,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 66,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 67,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 68,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 69,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 3,
        //   permissionId: 70,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },

        // // For Role DISTRIBUTOR

        {
          roleId: 4,
          permissionId: 1,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 4,
          permissionId: 2,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 4,
          permissionId: 3,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 4,
          permissionId: 4,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 4,
          permissionId: 5,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 4,
          permissionId: 6,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 4,
          permissionId: 7,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 4,
          permissionId: 8,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 4,
          permissionId: 9,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 4,
          permissionId: 10,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 4,
          permissionId: 11,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 4,
          permissionId: 12,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 4,
          permissionId: 13,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 4,
          permissionId: 14,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 4,
          permissionId: 15,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 4,
          permissionId: 16,
          read: false,
          write: false,
          isDeleted: false
        },
        // {
        //   roleId: 4,
        //   permissionId: 17,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 18,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 19,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 20,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 21,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 22,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 23,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 24,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 25,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 26,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 27,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 28,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 29,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 30,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 31,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 32,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 33,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 34,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 35,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 36,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 37,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 38,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 39,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 40,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 41,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 42,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 43,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 44,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 45,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 46,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 47,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 48,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 49,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 50,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 51,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 52,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 53,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 54,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 55,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 56,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 57,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 58,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 59,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 60,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 61,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 62,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 63,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 64,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 65,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 66,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 67,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 68,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 69,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 4,
        //   permissionId: 70,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // For Role RETAILER

        {
          roleId: 5,
          permissionId: 1,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 5,
          permissionId: 2,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 5,
          permissionId: 3,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 5,
          permissionId: 4,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 5,
          permissionId: 5,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 5,
          permissionId: 6,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 5,
          permissionId: 7,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 5,
          permissionId: 8,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 5,
          permissionId: 9,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 5,
          permissionId: 10,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 5,
          permissionId: 11,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 5,
          permissionId: 12,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 5,
          permissionId: 13,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 5,
          permissionId: 14,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 5,
          permissionId: 15,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 5,
          permissionId: 16,
          read: false,
          write: false,
          isDeleted: false
        },
        // {
        //   roleId: 5,
        //   permissionId: 17,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 18,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 19,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 20,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 21,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 22,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 23,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 24,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 25,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 26,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 27,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 28,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 29,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 30,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 31,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 32,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 33,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 34,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 35,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 36,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 37,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 38,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 39,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 40,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 41,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 42,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 43,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 44,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 45,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 46,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 47,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 48,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 49,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 50,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 51,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 52,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 53,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 54,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 55,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 56,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 57,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 58,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 59,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 60,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 61,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 62,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 63,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 64,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 65,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 66,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 67,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 68,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 69,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 5,
        //   permissionId: 70,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // // For Role EMPLOYEE

        {
          roleId: 6,
          permissionId: 1,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 6,
          permissionId: 2,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 6,
          permissionId: 3,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 6,
          permissionId: 4,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 6,
          permissionId: 5,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 6,
          permissionId: 6,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 6,
          permissionId: 7,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 6,
          permissionId: 8,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 6,
          permissionId: 9,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 6,
          permissionId: 10,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 6,
          permissionId: 11,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 6,
          permissionId: 12,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 6,
          permissionId: 13,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 6,
          permissionId: 14,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 6,
          permissionId: 15,
          read: false,
          write: false,
          isDeleted: false
        },
        {
          roleId: 6,
          permissionId: 16,
          read: false,
          write: false,
          isDeleted: false
        },
        // {
        //   roleId: 6,
        //   permissionId: 17,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 18,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 19,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 20,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 21,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // }
        // {
        //   roleId: 6,
        //   permissionId: 22,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 23,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 24,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 25,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 26,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 27,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 28,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 29,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 30,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 31,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 32,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 33,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 34,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 35,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 36,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 37,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 38,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 39,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 40,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 41,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 42,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 43,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 44,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 45,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 46,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 47,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 48,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 49,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 50,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 51,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 52,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 53,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 54,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 55,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 56,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 57,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 58,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 59,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 60,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 61,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 62,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 63,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 64,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 65,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 66,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 67,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 68,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 69,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 6,
        //   permissionId: 70,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },

        // // For Role 
        // {
        //   roleId: 7,
        //   permissionId: 1,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 2,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 3,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 4,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 5,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 6,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 7,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 8,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 9,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 10,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 11,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 12,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 13,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 14,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 15,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 16,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 17,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 18,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 19,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 20,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 21,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 22,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 23,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 24,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 25,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 26,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 27,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 28,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 29,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 30,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 31,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 32,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 33,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 34,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 35,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 36,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 37,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 38,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 39,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 40,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 41,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 42,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 43,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 44,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 45,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 46,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 47,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 48,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 49,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 50,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 51,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 52,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 53,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 54,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 55,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 56,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 57,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 58,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 59,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 60,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 61,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 62,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 63,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 64,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 65,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 66,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 67,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 68,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 69,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 7,
        //   permissionId: 70,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },

        // // // For Role SALES_EXECUTIVE

        // {
        //   roleId: 8,
        //   permissionId: 1,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 2,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 3,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 4,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 5,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 6,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 7,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 8,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 9,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 10,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 11,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 12,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 13,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 14,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 15,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 16,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 17,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 18,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 19,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 20,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 21,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 22,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 23,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 24,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 25,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 26,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 27,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 28,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 29,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 30,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 31,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 32,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 33,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 34,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 35,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 36,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 37,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 38,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 39,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 40,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 41,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 42,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 43,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 44,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 45,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 46,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 47,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 48,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 49,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 50,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 51,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 52,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 53,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 54,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 55,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 56,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 57,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 58,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 59,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 60,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 61,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 62,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 63,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 64,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 65,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 66,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 67,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 68,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 69,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 8,
        //   permissionId: 70,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },

        // // // For Role CUSTOMER_SUPPORT

        // {
        //   roleId: 9,
        //   permissionId: 1,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 2,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 3,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 4,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 5,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 6,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 7,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 8,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 9,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 10,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 11,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 12,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 13,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 14,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 15,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 16,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 17,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 18,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 19,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 20,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 21,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 22,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 23,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 24,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 25,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 26,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 27,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 28,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 29,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 30,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 31,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 32,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 33,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 34,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 35,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 36,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 37,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 38,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 39,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 40,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 41,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 42,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 43,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 44,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 45,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 46,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 47,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 48,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 49,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 50,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 51,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 52,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 53,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 54,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 55,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 56,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 57,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 58,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 59,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 60,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 9,
        //   permissionId: 61,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },

        // //Customer SUpport
        // {
        //   roleId: 10,
        //   permissionId: 1,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 2,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 3,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 4,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 5,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 6,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 7,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 8,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 9,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 10,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 11,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 12,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 13,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 14,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 15,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 16,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 17,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 18,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 19,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 20,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 21,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 22,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 23,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 24,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 25,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 26,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 27,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 28,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 29,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 30,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 31,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 32,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 33,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 34,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 35,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 36,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 37,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 38,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 39,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 40,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 41,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 42,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 43,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 44,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 45,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 46,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 47,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 48,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 49,
        //   read: false,
        //   write: false,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 50,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 51,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 52,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 53,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 54,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 55,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 56,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 57,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 58,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 59,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 60,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // },
        // {
        //   roleId: 10,
        //   permissionId: 61,
        //   read: true,
        //   write: true,
        //   isDeleted: false
        // }
      ];
      
      console.log(`Inserting ${rolesPermissionToInsert.length} rolePermission records...`);
      await dbService.createMany(model.rolePermission, rolesPermissionToInsert);
      console.log('RolePermission data inserted successfully.');
    } else {
      console.log('RolePermission data already exists, skipping insertion.');
    }
  } catch (error) {
    console.error('RolePermission seeder failed due to:', error.message);
    console.error('Full error:', error);
  }
}

async function servicePush() {
  try {
    let existingDoc = await dbService.findOne(model.services, { id: 1 });
    if (!existingDoc) {
      const datas = [
        {
          isActive: true,
          serviceName: 'AEPS 1'
        },
        {
          isActive: true,
          serviceName: 'AEPS 2'
        },
        {
          isActive: true,
          serviceName: 'DMT 1'
        },
        {
          isActive: true,
          serviceName: 'DMT 2'
        },
        {
          isActive: true,
          serviceName: 'BBPS'
        },
        {
          isActive: true,
          serviceName: 'Credit Card 1'
        },
        {
          isActive: true,
          serviceName: 'Credit Card 2'
        },
        {
          isActive: true,
          serviceName: 'CMS 1'
        },
        {
          isActive: true,
          serviceName: 'CMS 2'
        },
        {
          isActive: true,
          serviceName: 'MATM'
        },
        {
          isActive: true,
          serviceName: 'IndoNepal'
        },
        {
          isActive: true,
          serviceName: 'AEPS Cash Withdrawal'
        },
       {
          isActive: true,
          serviceName: 'Issuance'
        }
      ]
      await dbService.createMany(model.services, datas);
    }
  } catch (error) {
    console.log('Failed to update Services due to:', error.message);
  }
}
async function OperatorType() {
  try {
    let existingDoc = await dbService.findOne(model.operatorType, { id: 1 });
    if (!existingDoc) {
      let datas = [{ name: 'PayIn' }, { name: 'PayOut' },{name:'Prepaid'},{name:'DTH 1'},{name:'DTH 2'},{name:'UPI DMT'}, {name:'BBPS'}, {name:'Credit Card 1'}, {name:'Credit Card 2'}, {name:'CMS 1'}, {name:'CMS 2'}, {name:'MATM'}, {name:'IndoNepal'}, {name:'AEPS Cash Withdrawal'}, {name:'Insurance'}];

      await dbService.createMany(model.operatorType, datas);
    }
  } catch (error) {
    console.log('Failed to update Services due to:', error.message);
  }
}
async function state() {
  try {
    let existingDoc = await dbService.findOne(model.state, { id: 1 });
    if (!existingDoc) {
      const initialStateData = [
        {
          code: 1,
          name: 'Andhra Pradesh'
        },
        {
          code: 2,
          name: 'Assam'
        },
        {
          code: 3,
          name: 'Bihar and Jharkhand'
        },
        {
          code: 5,
          name: 'Chennai Metro'
        },
        {
          code: 6,
          name: 'Delhi Metro'
        },
        {
          code: 7,
          name: 'Gujarat'
        },
        {
          code: 8,
          name: 'Haryana'
        },
        {
          code: 9,
          name: 'Himachal Pradesh'
        },
        {
          code: 10,
          name: 'Jammu and Kashmir'
        },
        {
          code: 11,
          name: 'Karnataka'
        },
        {
          code: 12,
          name: 'Kerala'
        },
        {
          code: 13,
          name: 'Kolkata Metro'
        },
        {
          code: 14,
          name: 'MP and Chhattisgarh'
        },
        {
          code: 15,
          name: 'Maharashtra'
        },
        {
          code: 16,
          name: 'Mumbai Metro'
        },
        {
          code: 17,
          name: 'North East India'
        },
        {
          code: 18,
          name: 'Odisha'
        },
        {
          code: 19,
          name: 'Punjab'
        },
        {
          code: 20,
          name: 'Rajasthan'
        },
        {
          code: 21,
          name: 'Tamil Nadu'
        },
        {
          code: 22,
          name: 'UP(East)'
        },
        {
          code: 23,
          name: 'UP(West) and Uttarakhand'
        },
        {
          code: 25,
          name: 'West Bengal'
        }
      ];

      await dbService.createMany(model.state, initialStateData);
    }
  } catch (error) {
    console.log('Failed to update Services due to:', error.message);
  }
}

/*
 * async function copyOption () {
 *   try {
 *     let existingDoc = await dbService.findOne(CopyOption, { id: 1 });
 *     if (!existingDoc) {
 *       let copyOption = [
 *         { copyOptions: '{MOBILE}' },
 *         { copyOptions: '{AMOUNT}' },
 *         { copyOptions: '{OPERATOR}' },
 *         { copyOptions: '{TID}' },
 *         { copyOptions: '{VENDORID}' },
 *         { copyOptions: '{OPTIONAL1}' },
 *         { copyOptions: '{OPTIONAL2}' },
 *         { copyOptions: '{OPTIONAL3}' },
 *         { copyOptions: '{OPTIONAL4}' },
 *         { copyOptions: '{OUTLETID}' },
 *         { copyOptions: '{CUSTMOB}' },
 *         { copyOptions: '{GEOCODE}' },
 *         { copyOptions: '{PINCODE}' },
 *         { copyOptions: '{REFID}' },
 *         { copyOptions: '{RECHTYPE}' },
 *         { copyOptions: '{DATE}' },
 *         { copyOptions: '{MARGIN}' },
 *         { copyOptions: '{ISROFFER}' }
 *       ];
 */

/*
 *       await dbService.createMany(CopyOption, copyOption);
 *     }
 *   } catch (error) {
 *     console.log('Failed to update Services due to:', error.message);
 *   }
 * }
 */

async function gstState() {
  try {
    let existingDoc = await dbService.findOne(model.gstState, { id: 1 });
    if (!existingDoc) {
      const initialStateData = [
        {
          gstCode: '37',
          state: 'Andhra Pradesh'
        },
        {
          gstCode: '35',
          state: 'Andaman and Nicobar Islands'
        },
        {
          gstCode: '12',
          state: 'Arunachal Pradesh'
        },
        {
          gstCode: '18',
          state: 'Assam'
        },
        {
          gstCode: '10',
          state: 'Bihar'
        },
        {
          gstCode: '04',
          state: 'Chandigarh'
        },
        {
          gstCode: '22',
          state: 'Chhattisgarh'
        },
        {
          gstCode: '07',
          state: 'Delhi'
        },
        {
          gstCode: '26',
          state: 'Dadra and Nagar Haveli and Daman and Diu'
        },
        {
          gstCode: '24',
          state: 'Gujarat'
        },
        {
          gstCode: '06',
          state: 'Haryana'
        },
        {
          gstCode: '02',
          state: 'Himachal Pradesh'
        },
        {
          gstCode: '20',
          state: 'Jharkhand'
        },
        {
          gstCode: '01',
          state: 'Jammu and Kashmir'
        },
        {
          gstCode: '29',
          state: 'Karnataka'
        },
        {
          gstCode: '32',
          state: 'Kerala'
        },
        {
          gstCode: '38',
          state: 'Ladakh'
        },
        {
          gstCode: '31',
          state: 'Lakshadweep'
        },
        {
          gstCode: '14',
          state: 'Manipur'
        },
        {
          gstCode: '23',
          state: 'Madhya Pradesh'
        },
        {
          gstCode: '27',
          state: 'Maharashtra'
        },
        {
          gstCode: '17',
          state: 'Meghalaya'
        },
        {
          gstCode: '15',
          state: 'Mizoram'
        },
        {
          gstCode: '13',
          state: 'Nagaland'
        },
        {
          gstCode: '21',
          state: 'Odisha'
        },
        {
          gstCode: '34',
          state: 'Puducherry'
        },
        {
          gstCode: '03',
          state: 'Punjab'
        },
        {
          gstCode: '08',
          state: 'Rajasthan'
        },
        {
          gstCode: '11',
          state: 'Sikkim'
        },
        {
          gstCode: '33',
          state: 'Tamil Nadu'
        },
        {
          gstCode: '36',
          state: 'Telangana'
        },
        {
          gstCode: '16',
          state: 'Tripura'
        },
        {
          gstCode: '05',
          state: 'Uttarakhand'
        },
        {
          gstCode: '09',
          state: 'Uttar Pradesh'
        },
        {
          gstCode: '19',
          state: 'West Bengal'
        },
        {
          gstCode: '97',
          state: 'Other Territory'
        },
        {
          gstCode: '99',
          state: 'Centre Jurisdiction'
        }
      ];

      await dbService.createMany(model.gstState, initialStateData);
    }
  } catch (error) {
    console.log('Failed to update Services due to:', error.message);
  }
}

async function bank() {
  try {
    let existingDoc = await dbService.findOne(model.bank, { id: 1 });
    if (!existingDoc) {
      const initialBankData = [
        {
          bankId: '1',
          bankName: 'AP MAHESH COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '2',
          bankName: 'ABHYUDAYA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '3',
          bankName: 'ABHYUDAYA MAHILA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '4',
          bankName: 'ABU DHABI COMMERCIAL BANK'
        },
        {
          bankId: '5',
          bankName: 'ACE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '6',
          bankName: 'ADARSH COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '7',
          bankName: 'AHILYADEVI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '8',
          bankName: 'AHMEDABAD MERCANTILE COOPERATIVE BANK'
        },
        {
          bankId: '9',
          bankName: 'AIRTEL PAYMENTS BANK LIMITED'
        },
        {
          bankId: '10',
          bankName: 'AKOLA JANATA COMMERCIAL COOPERATIVE BANK'
        },
        {
          bankId: '11',
          bankName: 'ALAPUZHA DISTRICT COOPERATIVE BANK'
        },
        {
          bankId: '12',
          bankName: 'ALAVI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '13',
          bankName: 'ALLAHABAD BANK'
        },
        {
          bankId: '14',
          bankName: 'ALLAHABAD DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '15',
          bankName: 'ALLAHABAD UP GRAMIN BANK'
        },
        {
          bankId: '16',
          bankName: 'ALMORA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '17',
          bankName: 'ANANDA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '18',
          bankName: 'ANDHRA BANK'
        },
        {
          bankId: '19',
          bankName: 'CHAITANYA GODAVARI GRAMIN BANK'
        },
        {
          bankId: '20',
          bankName: 'ANDHRA PRAGATHI GRAMIN BANK'
        },
        {
          bankId: '21',
          bankName: 'APNA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '22',
          bankName: 'ARIHANT URBAN COOPERATIVE BANK LIMITED, YES BANK'
        },
        {
          bankId: '23',
          bankName: 'ARIHANT URBAN COOPERATIVE BANK LIMITED, HDFC BANK'
        },
        {
          bankId: '24',
          bankName: 'ARUNACHAL PRADESH COOPERATIVE APEX BANK'
        },
        {
          bankId: '25',
          bankName: 'ASSAM GRAMIN VIKASH BANK'
        },
        {
          bankId: '26',
          bankName: 'AU SMALL FINANCE BANK LIMITED'
        },
        {
          bankId: '27',
          bankName: 'AUSTRALIA AND NEW ZEALAND BANKING GROUP LIMITED'
        },
        {
          bankId: '28',
          bankName: 'THE VEJALPUR NAGRIK SAHAKARI BANK'
        },
        {
          bankId: '29',
          bankName: 'THE YEMMIGANUR COOPERATIVE TOWN BANK LIMITED'
        },
        {
          bankId: '30',
          bankName: 'WARANGAL URBAN COOPERATIVE BANK LIMITED, AXIS BANK'
        },
        {
          bankId: '31',
          bankName: 'WARANGAL URBAN COOPERATIVE BANK LIMITED, ICICI BAN'
        },
        {
          bankId: '32',
          bankName: 'AXIS BANK'
        },
        {
          bankId: '33',
          bankName: 'THE VAIDYANATH URBAN COOPERATIVE BANK, AXIS BANK'
        },
        {
          bankId: '34',
          bankName: 'THE VAIDYANATH URBAN COOPERATIVE BANK, HDFC BANK'
        },
        {
          bankId: '35',
          bankName: 'VAISHYA NAGARI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '36',
          bankName: 'VAISHYA NAGARI SAH BANK LIMITED'
        },
        {
          bankId: '37',
          bankName: 'VALMIKI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '38',
          bankName: 'SHIVSHAKTI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '39',
          bankName: 'YARAGATTI URBAN COOPERATIVE CREDIT BANK'
        },
        {
          bankId: '40',
          bankName: 'NAGRIK SAHAKARI BANK'
        },
        {
          bankId: '41',
          bankName: 'THE MOTI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '42',
          bankName: 'THE MAHUDHA NAGRIK SAHAKARI BANK'
        },
        {
          bankId: '43',
          bankName: 'THE KANAKAMAHALAKSHMI COOPERATIVE BANK'
        },
        {
          bankId: '44',
          bankName: 'TUMKUR DISTRICT COOPERATIVE CENTRAL BANK'
        },
        {
          bankId: '45',
          bankName: 'THE CITIZEN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '46',
          bankName: 'SHRI VIJAY MAHANTESH COOPERATIVE BANK'
        },
        {
          bankId: '47',
          bankName: 'SHIVA SAHAKARI BANK'
        },
        {
          bankId: '48',
          bankName: 'THE SUDHA COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '49',
          bankName: 'STAMBADRI COOPERATIVE URBAN BANK'
        },
        {
          bankId: '50',
          bankName: 'SHRI SHARAN VEERESHWAR SAHAKARI BANK'
        },
        {
          bankId: '51',
          bankName: 'SRI SEETHARAGHAVA SOUHARDA SAHAKARI BANK'
        },
        {
          bankId: '52',
          bankName: 'SRI SHIVESHWAR NAGRI SAHAKARI BANK'
        },
        {
          bankId: '53',
          bankName: 'SHRI SHIDDESHWAR COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '54',
          bankName: 'SANMATI SAHAKARI BANK'
        },
        {
          bankId: '55',
          bankName: 'SANGLI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '56',
          bankName: 'SHRI PRAGATI PATTAN SAHAKARI BANK'
        },
        {
          bankId: '57',
          bankName: 'SEHORE NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '58',
          bankName: 'SARAKARI NAUKARARA SAHAKARI BANK'
        },
        {
          bankId: '59',
          bankName: 'SAIBABA NAGARI SAHAKARI  BANK LIMITED'
        },
        {
          bankId: '60',
          bankName: 'SHRI MAHANT SHIVAYOGI COOPERATIVE BANK'
        },
        {
          bankId: '61',
          bankName: 'SEC MERCANTILE COOPERATIVE URBAN BANK'
        },
        {
          bankId: '62',
          bankName: 'SHREE MURUGHARAJENDRA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '63',
          bankName: 'THE SARDARGANJ MERCANTILE  COOPERATIVE BANK LIMITE'
        },
        {
          bankId: '64',
          bankName: 'SRI AMBABHAVANI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '65',
          bankName: 'RATANCHAND SHAH SAHAKARI BANK LIMITED'
        },
        {
          bankId: '66',
          bankName: 'RUKMINI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '67',
          bankName: 'RAJMATA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '68',
          bankName: 'PRIYADARSHINI URBAN COOPERATIVE BANK'
        },
        {
          bankId: '69',
          bankName: 'THE PRODDATUR COOPERATIVE TOWN BANK'
        },
        {
          bankId: '70',
          bankName: 'PALUS SAHAKARI BANK LIMITED'
        },
        {
          bankId: '71',
          bankName: 'PALAKKAD DISTRICT  COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '72',
          bankName: 'PALAMOOR COOPERATIVE URBAN BANK'
        },
        {
          bankId: '73',
          bankName: 'THE PACHHAPUR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '74',
          bankName: 'NALBARI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '75',
          bankName: 'THE NAGALAND STATE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '76',
          bankName: 'NYAYAMITRA SAHAKARA BANK'
        },
        {
          bankId: '77',
          bankName: 'NORTHERN RAILWAY PRIMARY COOPERATIVE BANK'
        },
        {
          bankId: '78',
          bankName: 'NANDED DISCTRICT CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '79',
          bankName: 'THE MANIPUR WOMENS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '80',
          bankName: 'THE MERCHANT URBAN COOPERATIVE BANK'
        },
        {
          bankId: '81',
          bankName: 'MAHESH URBAN COOPERATIVE BANK'
        },
        {
          bankId: '82',
          bankName: 'THE MALAD SAHAKARI BANK LIMITED'
        },
        {
          bankId: '83',
          bankName: 'SHRI MAHALAXMI PATTAN SAHAKARA BANK'
        },
        {
          bankId: '84',
          bankName: 'THE MOIRANG PRIMARY COOPERATIVE BANK'
        },
        {
          bankId: '85',
          bankName: 'MANGALDAI NAGAR SAMABAI BANK LIMITED'
        },
        {
          bankId: '86',
          bankName: 'THE MANDVI MERCANTILE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '87',
          bankName: 'MERCHANTS LIBERAL COOPERATIVE BANK'
        },
        {
          bankId: '88',
          bankName: 'THE MANDAPETA COOPERATIVE TOWN BANK'
        },
        {
          bankId: '89',
          bankName: 'THE MAHENDERGARH CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '90',
          bankName: 'THE MUSLIM COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '91',
          bankName: 'LAXMI SAHAKARI BANK'
        },
        {
          bankId: '92',
          bankName: 'LUNAWADA NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '93',
          bankName: 'LOKNETE DATTAJI PATIL SAHAKARI BANK'
        },
        {
          bankId: '94',
          bankName: 'KADUTHURUTHY URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '95',
          bankName: 'THE KRANTHI COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '96',
          bankName: 'THE KAPURTHALA CENTRAL  COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '97',
          bankName: 'THE KORAPUT CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '98',
          bankName: 'KISAN NAGRI SAHAKARI BANK'
        },
        {
          bankId: '99',
          bankName: 'KARNALA NAGARI SAHAKARI BANK'
        },
        {
          bankId: '100',
          bankName: 'SHRI KANYAKA NAGARI SAHAKARI BANK'
        },
        {
          bankId: '101',
          bankName: 'KRISHNA MERCANTILE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '102',
          bankName: 'KOTTAKKAL COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '103',
          bankName: 'THE KAKINADA COOPERATIVE TOWN BANK'
        },
        {
          bankId: '104',
          bankName: 'JANSEWA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '105',
          bankName: 'JUBILEE HILLS MERCANTILE COOPERATIVE URBAN BANK'
        },
        {
          bankId: '106',
          bankName: 'JILA SAHAKARI KENDRIYA BANK'
        },
        {
          bankId: '107',
          bankName: 'JANATA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '108',
          bankName: 'DR JAIPRAKASH MUNDADA URBAN COOPERATIVE BANK'
        },
        {
          bankId: '109',
          bankName: 'JAMMU AND KASHMIR GRAMEEN BANK'
        },
        {
          bankId: '110',
          bankName: 'INDRAPRASTHA SEHKARI BANK LIMITED'
        },
        {
          bankId: '111',
          bankName: 'HANAMASAGAR URBAN COOPERATIVE BANK'
        },
        {
          bankId: '112',
          bankName: 'HASSAN DISTRICT COOPERATIVE CENTRAL BANK'
        },
        {
          bankId: '113',
          bankName: 'THE HAZARIBAG CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '114',
          bankName: 'GODHRA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '115',
          bankName: 'THE GUNTUR COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '116',
          bankName: 'GUNA NAGRIK SAHAKARI BANK'
        },
        {
          bankId: '117',
          bankName: 'THE GHOTI MERCHANTS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '118',
          bankName: 'THE GIRIDIH CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '119',
          bankName: 'THE GONDIA DISTRICT BANK'
        },
        {
          bankId: '120',
          bankName: 'FIROZABAD ZILA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '121',
          bankName: 'DHULE VIKAS SAHAKARI BANK LIMITED'
        },
        {
          bankId: '122',
          bankName: 'DHANASHREE URBAN COOPERATIVE BANK'
        },
        {
          bankId: '123',
          bankName: 'DAIVADNYA SAHAKARA BANK'
        },
        {
          bankId: '124',
          bankName: 'DADASAHEB RAMRAO PATIL COOPERATIVE BANK'
        },
        {
          bankId: '125',
          bankName: 'DEENDAYAL NAGARI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '126',
          bankName: 'DHULE AND NANDURBAR JILHA SARKARI BANK'
        },
        {
          bankId: '127',
          bankName: 'DEOGHAR JAMATRA CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '128',
          bankName: 'DAVANGERE HARIHAR URBAN SAHAKARI BANK'
        },
        {
          bankId: '129',
          bankName: 'DR BABASAHEB AMBEDKAR URBAN COOPERATIVE BANK'
        },
        {
          bankId: '130',
          bankName: 'THE CHOPDA PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '131',
          bankName: 'KARNATAKA MAHILA SAHAKARI BANK'
        },
        {
          bankId: '132',
          bankName: 'CHAITANYA MAHILA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '133',
          bankName: 'THE CATHOLIC COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '134',
          bankName: 'SHREE BASAVESHWAR URBAN COOPERATIVE BANK'
        },
        {
          bankId: '135',
          bankName: 'SRI BASAVESHWAR PATTANA SAHAKARI BANK'
        },
        {
          bankId: '136',
          bankName: 'SARDAR BHILADWALA PARDI PEOPLE COOPERATIVE BANK'
        },
        {
          bankId: '137',
          bankName: 'THE BHADRAN PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '138',
          bankName: 'BETUL NAGRIK SAHAKARI BANK'
        },
        {
          bankId: '139',
          bankName: 'SHRI BARIA NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '140',
          bankName: 'BOMBAY MERCANTILE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '141',
          bankName: 'BULDANA DISTRICT CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '142',
          bankName: 'THE BHAVASAR KSHATRIYA COOPERATIVE BANK'
        },
        {
          bankId: '143',
          bankName: 'BIJAPUR DISTRICT MAHILA COOPERATIVE BANK'
        },
        {
          bankId: '144',
          bankName: 'BHAUSAHEB BIRAJDAR NAGARI SAHAKARI BANK'
        },
        {
          bankId: '145',
          bankName: 'AHMEDNAGAR ZILLA PRATHAMIK SHIKSHAK SAHAKARI BANK '
        },
        {
          bankId: '146',
          bankName: 'SREE MAHAYOGI LAKSHMAMMA COOPERATIVE BANK'
        },
        {
          bankId: '147',
          bankName: 'ANDARSUL URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '148',
          bankName: 'THE ASKA COOPERATIVE CENTRAL BANK LIMITED'
        },
        {
          bankId: '149',
          bankName: 'ARUNA SAHAKARA BANK'
        },
        {
          bankId: '150',
          bankName: 'AP RAJARAJESWARI MAHILA COOPERATIVE URBAN BANK LIM'
        },
        {
          bankId: '151',
          bankName: 'AP MAHAJANS COOPERATIVE URBAN BANK'
        },
        {
          bankId: '152',
          bankName: 'AKKAMAHADEVI MAHILA SAHAKARI BANK'
        },
        {
          bankId: '153',
          bankName: 'AROODH JYOTI PATTAN SAHAKARA BANK'
        },
        {
          bankId: '154',
          bankName: 'AHMEDNAGAR DIST CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '155',
          bankName: 'AGARTALA COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '156',
          bankName: 'SHRI ANAND COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '157',
          bankName: 'ACBL ASHOKNAGAR COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '158',
          bankName: 'BELAGAVI SHREE BASAVESHWAR COOPERATIVE BANK'
        },
        {
          bankId: '159',
          bankName: 'BIJAPUR SAHAKARI BANK'
        },
        {
          bankId: '160',
          bankName: 'SHRI REVANSIDDESHWAR SAHAKARI BANK'
        },
        {
          bankId: '161',
          bankName: 'THE PUNJAB STATE COOPERATIVE BANK'
        },
        {
          bankId: '162',
          bankName: 'THE NADIAD PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '163',
          bankName: 'THE NAGAR SAHAKARI BANK LIMITED'
        },
        {
          bankId: '164',
          bankName: 'MAHEMDAVAD URBAN PEOPLES COOPERATIVE BANK'
        },
        {
          bankId: '165',
          bankName: 'THE BHUJ COMMERCIAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '166',
          bankName: 'THE TIRUVALLA EAST COOPERATIVE BANK'
        },
        {
          bankId: '167',
          bankName: 'BNP PARIBAS BANK'
        },
        {
          bankId: '168',
          bankName: 'BALAGERIA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '169',
          bankName: 'BALLY COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '170',
          bankName: 'BALOTRA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '171',
          bankName: 'BALTIKURI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '172',
          bankName: 'BANARAS MERCANTILE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '173',
          bankName: 'BOLANGIR CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '174',
          bankName: 'BANDHAN BANK LIMITED'
        },
        {
          bankId: '175',
          bankName: 'BANGIYA GRAMIN VIKASH BANK'
        },
        {
          bankId: '177',
          bankName: 'BANK OF AMERICA'
        },
        {
          bankId: '178',
          bankName: 'BANK OF BAHARAIN AND KUWAIT'
        },
        {
          bankId: '179',
          bankName: 'BANK OF BARODA'
        },
        {
          bankId: '180',
          bankName: 'BANK OF CEYLON'
        },
        {
          bankId: '181',
          bankName: 'BANK OF INDIA'
        },
        {
          bankId: '182',
          bankName: 'DHAKURIA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '183',
          bankName: 'VISAKHAPATNAM MID CORPORATE BANK'
        },
        {
          bankId: '184',
          bankName: 'BANK OF MAHARASHTRA'
        },
        {
          bankId: '185',
          bankName: 'BANK OF TOKYO MITSUBISHI LIMITED'
        },
        {
          bankId: '186',
          bankName: 'BANKURA TOWN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '187',
          bankName: 'BAPUJI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '188',
          bankName: 'BARAMULLA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '189',
          bankName: 'BARCLAYS BANK'
        },
        {
          bankId: '190',
          bankName: 'BARODA GUJARAT GRAMIN BANK'
        },
        {
          bankId: '191',
          bankName: 'BARODA RAJASTHAN GRAMIN BANK'
        },
        {
          bankId: '192',
          bankName: 'BARODA UTTAR PRADESH GRAMIN BANK'
        },
        {
          bankId: '193',
          bankName: 'BASSEIN CATHOLIC COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '194',
          bankName: 'BEAWAR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '195',
          bankName: 'BHARAT COOPERATIVE BANK MUMBAI LIMITED'
        },
        {
          bankId: '196',
          bankName: 'BHEL EMPLOYEES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '197',
          bankName: 'BIHAR KSHETRIYA GRAMIN BANK'
        },
        {
          bankId: '198',
          bankName: 'BRAHMAWART COMMERCIAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '199',
          bankName: 'CANARA BANK'
        },
        {
          bankId: '200',
          bankName: 'CAPITAL SMALL FINANCE BANK LIMITED'
        },
        {
          bankId: '201',
          bankName: 'CATHOLIC SYRIAN BANK LIMITED'
        },
        {
          bankId: '202',
          bankName: 'JILA SAHAKARI KENDRIYA BANK '
        },
        {
          bankId: '203',
          bankName: 'INDORE PREMIER COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '204',
          bankName: 'BHOPAL  COOPERATIVE CENTRAL BANK LIMITED'
        },
        {
          bankId: '205',
          bankName: 'M.P. RAJYA SAHAKARI BANK '
        },
        {
          bankId: '206',
          bankName: 'CG RAJYA SAHAKRI BANK '
        },
        {
          bankId: '207',
          bankName: 'CENTRAL BANK OF INDIA'
        },
        {
          bankId: '208',
          bankName: 'CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '209',
          bankName: 'CENTRAL MADHYA PRADESH GRAMIN BANK'
        },
        {
          bankId: '210',
          bankName: 'CHHATTISGARH GRAMIN BANK'
        },
        {
          bankId: '211',
          bankName: 'CHINATRUST COMMERCIAL BANK LIMITED'
        },
        {
          bankId: '212',
          bankName: 'CITI BANK'
        },
        {
          bankId: '213',
          bankName: 'CITIZEN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '214',
          bankName: 'CITIZEN CREDIT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '215',
          bankName: 'CITIZENS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '216',
          bankName: 'CITY COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '217',
          bankName: 'CITY UNION BANK LIMITED'
        },
        {
          bankId: '218',
          bankName: 'COMMERCIAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '219',
          bankName: 'COMMONWEALTH BANK OF AUSTRALIA'
        },
        {
          bankId: '220',
          bankName: 'CONTAI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '221',
          bankName: 'CORPORATION BANK'
        },
        {
          bankId: '222',
          bankName: 'CREDIT AGRICOLE CORPORATE AND INVESTMENT BANK CALYON BANK'
        },
        {
          bankId: '223',
          bankName: 'CREDIT SUISEE AG BANK'
        },
        {
          bankId: '224',
          bankName: 'CUTTACK CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '225',
          bankName: 'DARJEELING DISTRICT CENTRAL COOPERATIVE BANK LIMIT'
        },
        {
          bankId: '226',
          bankName: 'DAUSA URBAN COOPERATIVE BANK'
        },
        {
          bankId: '227',
          bankName: 'DCB BANK LIMITED'
        },
        {
          bankId: '228',
          bankName: 'DENA BANK'
        },
        {
          bankId: '229',
          bankName: 'DEOGIRI NAGARI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '230',
          bankName: 'DEORIA KASIA DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '231',
          bankName: 'DEPOSIT INSURANCE AND CREDIT GUARANTEE CORPORATION'
        },
        {
          bankId: '232',
          bankName: 'DEUSTCHE BANK'
        },
        {
          bankId: '233',
          bankName: 'DEVELOPMENT BANK OF SINGAPORE'
        },
        {
          bankId: '234',
          bankName: 'DEVIKA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '235',
          bankName: 'DHANALAKSHMI BANK'
        },
        {
          bankId: '236',
          bankName: 'DISTRICT COOPERATIVE BANK'
        },
        {
          bankId: '237',
          bankName: 'DOHA BANK'
        },
        {
          bankId: '238',
          bankName: 'DOMBIVLI NAGARI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '239',
          bankName: 'DUMKA CENTRAL COOPERATIVE  BANK LIMITED'
        },
        {
          bankId: '240',
          bankName: 'DURGAPUR STEEL PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '241',
          bankName: 'EQUITAS SMALL FINANCE BANK LIMITED'
        },
        {
          bankId: '242',
          bankName: 'ESAF SMALL FINANCE BANK LIMITED'
        },
        {
          bankId: '243',
          bankName: 'ETAH DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '244',
          bankName: 'ETAH URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '245',
          bankName: 'ETAWAH DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '246',
          bankName: 'EXPORT IMPORT BANK OF INDIA'
        },
        {
          bankId: '247',
          bankName: 'FATEHPUR DISTRICT COOPERATIVE BANK'
        },
        {
          bankId: '248',
          bankName: 'THE WAYANAD DIST COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '249',
          bankName: 'THE FEDERAL BANK LIMITED'
        },
        {
          bankId: '250',
          bankName: 'THE PONANI COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '251',
          bankName: 'THE FEDERAL BANK LIMITED, AUCB BR ALENGAD'
        },
        {
          bankId: '252',
          bankName: 'THE FEDERAL BANK LIMITED, AUCB BR CHUNANGAMVELI'
        },
        {
          bankId: '256',
          bankName: 'THE FEDERAL BANK LIMITED, ALWAYE URBAN COOPERATIVE'
        },
        {
          bankId: '257',
          bankName: 'THE MEENACHIL EAST URBAN COOPERATIVE BANK'
        },
        {
          bankId: '258',
          bankName: 'BHUJ MERCHANTILE BANK'
        },
        {
          bankId: '259',
          bankName: 'FEDERAL BANK'
        },
        {
          bankId: '260',
          bankName: 'FINCARE SMALL FINANCE BANK LIMITED'
        },
        {
          bankId: '261',
          bankName: 'FINO PAYMENTS BANK LIMITED'
        },
        {
          bankId: '262',
          bankName: 'FIROZABAD DISTRICT CENTRAL COOPERATIVE BANK LIMITE'
        },
        {
          bankId: '263',
          bankName: 'FIRSTRAND BANK LIMITED'
        },
        {
          bankId: '264',
          bankName: 'GOPINATH PATIL PARSIK BANK'
        },
        {
          bankId: '265',
          bankName: 'GANDHIDHAM COOPERATIVE BANK'
        },
        {
          bankId: '266',
          bankName: 'GULSHAN MERCANTILE URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '267',
          bankName: 'GURGAON GRAMIN BANK'
        },
        {
          bankId: '268',
          bankName: 'HADAGALI URBAN COOPERATIVE BANK'
        },
        {
          bankId: '269',
          bankName: 'HAMIRPUR DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '270',
          bankName: 'HARDOI DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '271',
          bankName: 'HARDOI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '272',
          bankName: 'YASHWANT NAGARI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '273',
          bankName: 'THE YAVATMAL MAHILA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '274',
          bankName: 'YEOLA MER COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '275',
          bankName: 'YOUTH DEVELOPMENT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '276',
          bankName: 'THE YASHWANT COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '277',
          bankName: 'WARUD URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '278',
          bankName: 'THE WASHIM URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '279',
          bankName: 'WARDHMAN URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '280',
          bankName: 'THE WOMENS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '281',
          bankName: 'WANI NAGRI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '282',
          bankName: 'V.V.C.C BANK LIMITED'
        },
        {
          bankId: '283',
          bankName: 'THE VALLABH VIDYANAGAR COMM COOPERATIVE BANK LIMIT'
        },
        {
          bankId: '284',
          bankName: 'VEPAR UDYOG VIKAS SAHAKARI BANK LIMITED'
        },
        {
          bankId: '285',
          bankName: 'THE VITA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '286',
          bankName: 'VISHWAKARAMA SAHAKARA BANK LIMITED'
        },
        {
          bankId: '287',
          bankName: 'VISHWAKALYAN SAHAKAR BANK '
        },
        {
          bankId: '288',
          bankName: 'VYAPARI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '289',
          bankName: 'VIKAS SAHAKARI BANK LIMITED '
        },
        {
          bankId: '290',
          bankName: 'VEERASHAIVA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '291',
          bankName: 'VIRAJPET PATTANA SAHAKARA BANK '
        },
        {
          bankId: '292',
          bankName: 'THE VERAVAL PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '293',
          bankName: 'HDFC BANK LIMITED, VASUNDHARA MAHILA N G B L AMBAJ'
        },
        {
          bankId: '294',
          bankName: 'THE VERAVAL MERCANTILE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '295',
          bankName: 'VYAVASAYIK EVAM AUDHYOGIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '296',
          bankName: 'VASAI JANATA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '297',
          bankName: 'VIKAS SOUHARDA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '298',
          bankName: 'VISHWAS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '299',
          bankName: 'VIDYANAND COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '300',
          bankName: 'SHRI VEERSHAIV COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '301',
          bankName: 'THE VAISH COOPERATIVE ADARSH BANK LIMITED'
        },
        {
          bankId: '302',
          bankName: 'VARDHAMAN MAHILA COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '303',
          bankName: 'HDFC BANK LIMITED, VAIJANATH APPA SARAF MARAT NSBL'
        },
        {
          bankId: '304',
          bankName: 'VANI MERCHANTS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '305',
          bankName: 'THE UDGIR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '306',
          bankName: 'UDYAM VIKAS SAHAKARI BANK LIMITED'
        },
        {
          bankId: '307',
          bankName: 'UNIVERSAL COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '308',
          bankName: 'URBAN COOPERATIVE BANK '
        },
        {
          bankId: '309',
          bankName: 'HDFC BANK'
        },
        {
          bankId: '310',
          bankName: 'THE VYANKATESHWARA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '311',
          bankName: 'THE VAISH COOPERATIVE COMM BANK LIMITED'
        },
        {
          bankId: '312',
          bankName: 'VIJAY COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '313',
          bankName: 'THE TAPINDU URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '314',
          bankName: 'TIRUPATI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '315',
          bankName: 'TEXTILE TRADERS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '316',
          bankName: 'THE SANGAMNER MERCH COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '317',
          bankName: 'RAIPUR URBAN MERCANTILE CO BANK LIMITED'
        },
        {
          bankId: '318',
          bankName: 'THE TRICHUR URBAN CO OPERA BANK LIMITED'
        },
        {
          bankId: '319',
          bankName: 'THE PEOPLES COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '320',
          bankName: 'THE NARODA NAGRIK COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '321',
          bankName: 'THE MALKAPUR URB COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '322',
          bankName: 'MAHILA COOPERATIVE NAGARIK BANK LIMITED'
        },
        {
          bankId: '323',
          bankName: 'THE MAHAVEER COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '324',
          bankName: 'THE LAXMI COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '325',
          bankName: 'THE KALOL URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '326',
          bankName: 'THE KUKARWADA NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '327',
          bankName: 'THE KUTCH MERCANTILE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '328',
          bankName: 'THE JAMNAGAR PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '329',
          bankName: 'THE ISLAMPUR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '330',
          bankName: 'THE HUKKERI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '331',
          bankName: 'THE GANDHINAGAR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '332',
          bankName: 'THE GOZARIA NAGARIK SAHAKARI BANK'
        },
        {
          bankId: '333',
          bankName: 'THE GAYATRI COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '334',
          bankName: 'THE CHHAPI NAGARIK SAHAKARI BANK'
        },
        {
          bankId: '335',
          bankName: 'THE COMMERCIAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '336',
          bankName: 'THE BORAL UNION COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '337',
          bankName: 'THE BAVLA NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '338',
          bankName: 'BANASKANTHA MERCANTILE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '339',
          bankName: 'THE BHAGYODAYA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '340',
          bankName: 'THE AGRASEN NAGARI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '341',
          bankName: 'SHREE WARANA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '342',
          bankName: 'SAWAI MADHOPUR URBAN COOPERATIVE LIMITED '
        },
        {
          bankId: '343',
          bankName: 'SARDAR VALLABHBHAI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '344',
          bankName: 'SHRI VAIBHAV LAKSHMI MAHILA NS BANK'
        },
        {
          bankId: '345',
          bankName: 'SHREE VYAS DHANVARSHA SAHAKARI BANK'
        },
        {
          bankId: '346',
          bankName: 'SUVARNAYUG SAHAKARI BANK LIMITED'
        },
        {
          bankId: '347',
          bankName: 'SUDHA COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '348',
          bankName: 'SUCO SOUHARDA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '349',
          bankName: 'THE SAVANUR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '350',
          bankName: 'SANGLI URBAN COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '351',
          bankName: 'SIKAR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '352',
          bankName: 'SHRIRAM URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '353',
          bankName: 'STERLING URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '354',
          bankName: 'SOLAPUR SOCIAL URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '355',
          bankName: 'SHRI SAWAMI SAMARATH SAHAKARI BANK LIMITED'
        },
        {
          bankId: '356',
          bankName: 'SHUSHRUTI SOUAHRDA SAHAKRA BANK'
        },
        {
          bankId: '357',
          bankName: 'SANT SOPANKAKA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '358',
          bankName: 'SHRI SATYAVIJAY SAHAKARI BANK LIMITED'
        },
        {
          bankId: '359',
          bankName: 'SARDAR SINGH NAGRIK SAHAKARI BANK '
        },
        {
          bankId: '360',
          bankName: 'SHREE SAVLI NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '361',
          bankName: 'SSMS URBAN COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '362',
          bankName: 'SHIVAM COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '363',
          bankName: 'DEVYANI SAHAKARI BANK '
        },
        {
          bankId: '364',
          bankName: 'SHREE SAMARTH SAHAKARI BANK LIMITED'
        },
        {
          bankId: '365',
          bankName: 'SAMRUDDHI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '366',
          bankName: 'SAMARTH SAHAKARI BANK LIMITED '
        },
        {
          bankId: '367',
          bankName: 'SANAWAD NAGARIK SAHAKARI BANK '
        },
        {
          bankId: '368',
          bankName: 'SHIKSHAK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '369',
          bankName: 'SHIVA SAHAKARI BANK '
        },
        {
          bankId: '370',
          bankName: 'SANMITRA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '371',
          bankName: 'SHRI PATNESHWAR URB COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '372',
          bankName: 'THE SATHAMBA PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '373',
          bankName: 'SADGURU NAGRIK SAHAKARI BANK '
        },
        {
          bankId: '374',
          bankName: 'SONBHADRA NAGAR SAHAKARI BANK LIMITED'
        },
        {
          bankId: '375',
          bankName: 'SIHOR NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '376',
          bankName: 'THE SANKHEDA NAGRIK SAHAKARI BANK'
        },
        {
          bankId: '377',
          bankName: 'SURAT NATIONAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '378',
          bankName: 'SARASPUR NAGARIK COOPERATIVE  BANK LIMITED'
        },
        {
          bankId: '379',
          bankName: 'SHRI MAHAVIR URB COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '380',
          bankName: 'SHRI MAHILA SEWA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '381',
          bankName: 'SMRITI NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '382',
          bankName: 'SHANKARRAO MOHITE PATIL SAHAKARI BANK'
        },
        {
          bankId: '383',
          bankName: 'SANMITRA MAHILA NAG SAHAKARI BANK '
        },
        {
          bankId: '384',
          bankName: 'SHRI LAXMIKRUPA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '385',
          bankName: 'SHREE LAXMI COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '386',
          bankName: 'SUBHADRA LOCAL AREA BANK LIMITED'
        },
        {
          bankId: '387',
          bankName: 'SRI KANNIKAPARAMESWARI COOPBANK LIMITED'
        },
        {
          bankId: '388',
          bankName: 'SINDHUDURG DIST CENT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '389',
          bankName: 'SOLAPUR SIDDHESHWAR SAHAKARI BANK LIMITED'
        },
        {
          bankId: '390',
          bankName: 'SIDDHESHWAR SAHAKARI BANK LIMITED '
        },
        {
          bankId: '391',
          bankName: 'SHARAD SAHAKARI BANK LIMITED'
        },
        {
          bankId: '392',
          bankName: 'SHIHORI NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '393',
          bankName: 'SADGURU GAHININATH SAHAKARI BANK LIMITED'
        },
        {
          bankId: '394',
          bankName: 'SHRI GANESH SAHAKARI BANK LIMITED'
        },
        {
          bankId: '395',
          bankName: 'SARDAR GUNJ MERCAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '396',
          bankName: 'SHRI GURUSIDDHESHWAR COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '397',
          bankName: 'SHIVDAULAT SAHAKARI BANK LIMITED'
        },
        {
          bankId: '398',
          bankName: 'SHREE CHHANI NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '399',
          bankName: 'THE SOCIAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '400',
          bankName: 'THE SARVODAYA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '401',
          bankName: 'SHRI BHAUSAHEB THORAT AMRUTVAHINI SAHAKARI BANK LI'
        },
        {
          bankId: '402',
          bankName: 'SONALI BANK LIMITED'
        },
        {
          bankId: '403',
          bankName: 'SADHANA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '404',
          bankName: 'SHRI BHAILALBHAI CONTRACTOR SMARAK COOPERATIVE BAN'
        },
        {
          bankId: '405',
          bankName: 'SRI BHAGAVATHI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '406',
          bankName: 'SHIVAJIRAO BHOSALE SAHAKARI BANK LIMITED'
        },
        {
          bankId: '407',
          bankName: 'SHRI ANAND NAGARI SAHAKARI BANK LIMITED, HDFC BANK'
        },
        {
          bankId: '408',
          bankName: 'SANMITRA URBAN COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '409',
          bankName: 'SHRI ADINATH COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '410',
          bankName: 'SUMERPUR MERC. URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '411',
          bankName: 'RAJARSHI SHAHU SAHAKARI BANK LIMITED'
        },
        {
          bankId: '412',
          bankName: 'THE RANDER PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '413',
          bankName: 'COL R D NIKAM SAINIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '414',
          bankName: 'RAIGARH NAGRIK SAHAKARI BANK'
        },
        {
          bankId: '415',
          bankName: 'RAJPUTANA MAHILA URB COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '416',
          bankName: 'RANI LAXMIBAI URBAN COOPERATIVE BANK'
        },
        {
          bankId: '417',
          bankName: 'THE RAJLAXMI MAHILA UC BANK LIMITED'
        },
        {
          bankId: '418',
          bankName: 'RENUKA NAGRIK SAHAKARI BANK '
        },
        {
          bankId: '419',
          bankName: 'CHURU ZILA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '420',
          bankName: 'RAVI COMMERCIAL UR COP BANK LIMITED'
        },
        {
          bankId: '421',
          bankName: 'THE RAJAJINAGAR COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '422',
          bankName: 'RATNAGIRI DIST CENT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '423',
          bankName: 'THE RANUJ NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '424',
          bankName: 'QATAR NATIONAL BANK'
        },
        {
          bankId: '425',
          bankName: 'ABHINANDAN URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '426',
          bankName: 'PORBANDAR VIBHAGIYA NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '427',
          bankName: 'PEOPLES URBAN COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '428',
          bankName: 'PROGRESSIVE URBAN COOPERATIVE BANK'
        },
        {
          bankId: '429',
          bankName: 'PRIYADARSHANI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '430',
          bankName: 'THE PATAN URBAN COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '431',
          bankName: 'PRAVARA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '432',
          bankName: 'THE POSTAL & RMS EMPLOY COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '433',
          bankName: 'PRAGATI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '434',
          bankName: 'THE PACHORA PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '435',
          bankName: 'PATAN NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '436',
          bankName: 'POORNAWADI NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '437',
          bankName: 'PRIYADARSHANI MAH NAG SAHAKARI BANK LIMITED'
        },
        {
          bankId: '438',
          bankName: 'PUNE MUNICIPALCORPSER COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '439',
          bankName: 'PROGRESSIVE MERCANTILE COOPERATIVE BANK'
        },
        {
          bankId: '440',
          bankName: 'PIMPALGOAN MER COOPERATIVE BANK'
        },
        {
          bankId: '441',
          bankName: 'ADAR P.D.PATIL SAHAKARI BANK LIMITED '
        },
        {
          bankId: '442',
          bankName: 'PUNE DISTRICT CENTRAL COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '443',
          bankName: 'THE POCHAMPALLY COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '444',
          bankName: 'PUNE CANTONMENT SAHAKARI BANK LIMITED'
        },
        {
          bankId: '445',
          bankName: 'PORBANDAR COMMERCIAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '446',
          bankName: 'PEOPLES COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '447',
          bankName: 'PARSHWANATH COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '448',
          bankName: 'PADMAVATHI COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '449',
          bankName: 'OMKAR NAGARIYA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '450',
          bankName: 'THE OJHAR MERCHANTS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '451',
          bankName: 'ODE URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '452',
          bankName: 'THE NANDURA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '453',
          bankName: 'THE NEW URBAN COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '454',
          bankName: 'NAVANAGARA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '455',
          bankName: 'THE NIPHAD URBAN COOPERATIVE BANK'
        },
        {
          bankId: '456',
          bankName: 'NAGNATH URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '457',
          bankName: 'NAGRIK SAHAKARI BANK '
        },
        {
          bankId: '458',
          bankName: 'NAGARIK SAHAKARI BANK '
        },
        {
          bankId: '459',
          bankName: 'NISHIGANDHA SAHAKARI BANK LIMITED '
        },
        {
          bankId: '460',
          bankName: 'NANDANI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '461',
          bankName: 'NAGARIK SAMABAY BANK LIMITED'
        },
        {
          bankId: '462',
          bankName: 'BASODA NAGRIK SAHAKARI BANK '
        },
        {
          bankId: '463',
          bankName: 'NASHIK JILHA MAHILA VIKAS SAHAKARI BANK'
        },
        {
          bankId: '464',
          bankName: 'NAVSARJAN INDUSTRIAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '465',
          bankName: 'THE NAKODAR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '466',
          bankName: 'NAGINA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '467',
          bankName: 'NEELA KRISHNA COOPERATIVE URBAN BANK'
        },
        {
          bankId: '468',
          bankName: 'NASHIK DIST GIRNA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '469',
          bankName: 'THE NEMMARA COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '470',
          bankName: 'THE NABADWIP COOPERATIVE CREDIT BANK LIMITED'
        },
        {
          bankId: '471',
          bankName: 'NIRMAL URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '472',
          bankName: 'MOHOL URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '473',
          bankName: 'THE MUSLIM COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '474',
          bankName: 'MUKTAI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '475',
          bankName: 'MADHESHWARI URBAN  DEV COOPERATIVE BANK'
        },
        {
          bankId: '476',
          bankName: 'MALVIYA URBAN COOPERATIVE BANK'
        },
        {
          bankId: '477',
          bankName: 'THE MEHKAR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '478',
          bankName: 'MALVIYA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '479',
          bankName: 'THE MAPUSA URB COOPERATIVE BANK OF GOA LIMITED '
        },
        {
          bankId: '480',
          bankName: 'THE MAHILA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '481',
          bankName: 'MAHESH URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '482',
          bankName: 'THE MADGAUM URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '483',
          bankName: 'MAHILA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '484',
          bankName: 'MANVI PATTANA SOUH SAHAKARI BANK'
        },
        {
          bankId: '485',
          bankName: 'THE MADANAPALLE COOPERATIVE TOWN BANK LIMITED'
        },
        {
          bankId: '486',
          bankName: 'MOHOL URBAN COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '487',
          bankName: 'MODEL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '488',
          bankName: 'MAHILA NAGRIK SAHA BANK '
        },
        {
          bankId: '489',
          bankName: 'SHREE MAHUVA NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '490',
          bankName: 'MAHATMA FULE DIST UR COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '491',
          bankName: 'MAHATAMA FULE DIST URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '492',
          bankName: 'MAHAVEER COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '493',
          bankName: 'THE MALLESWARAM COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '494',
          bankName: 'THE MODERN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '495',
          bankName: 'THE AHMEDNAGAR MER COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '496',
          bankName: 'MAHESH SAHAKARI BANK LIMITED'
        },
        {
          bankId: '497',
          bankName: 'MANWATH UR COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '498',
          bankName: 'THE MANDAL NAGRIC SAHAKARI BANK LIMITED'
        },
        {
          bankId: '499',
          bankName: 'MANORAMA COOPERATIVE.BANK LIMITED'
        },
        {
          bankId: '500',
          bankName: 'MANMAD URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '501',
          bankName: 'MALAD SAHAKARI BANK LIMITED'
        },
        {
          bankId: '502',
          bankName: 'ANNASAHEB CHOUGULE COOPERATIVE URBAN BANK'
        },
        {
          bankId: '503',
          bankName: 'LAXMI VISHNU SAHAKARI BANK LIMITED'
        },
        {
          bankId: '504',
          bankName: 'LONAVALA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '505',
          bankName: 'THE LUNAWADA PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '506',
          bankName: 'LAXMI MAHILA NAGRIK SAHAKARI BANK'
        },
        {
          bankId: '507',
          bankName: 'LALBAUG COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '508',
          bankName: 'LALA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '509',
          bankName: 'KASHIPUR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '510',
          bankName: 'THE KENDRAPARA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '511',
          bankName: 'KAVITA URBAN COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '512',
          bankName: 'KALYANSAGAR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '513',
          bankName: 'THE KOLHAPUR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '514',
          bankName: 'KARAN URBAN COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '515',
          bankName: 'KRUSHISEVA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '516',
          bankName: 'KRISHNA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '517',
          bankName: 'THE KATTAPPANA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '518',
          bankName: 'KHAMGAON URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '519',
          bankName: 'THE KALNA TOWN CREDIT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '520',
          bankName: 'KOTESHWARA SAHAKARI BANK '
        },
        {
          bankId: '521',
          bankName: 'KOHINOOR SAHAKARI BANK LIMITED '
        },
        {
          bankId: '522',
          bankName: 'THE KARMALA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '523',
          bankName: 'KHATRA PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '524',
          bankName: 'THE KAPADWANJ PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '525',
          bankName: 'THE KOYLANCHAL URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '526',
          bankName: 'THE KODINAR NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '527',
          bankName: 'KOTA NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '528',
          bankName: 'THE KALWAN MERCHANTS COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '529',
          bankName: 'KOLHAPUR MAHILA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '530',
          bankName: 'THE KARAD JANATA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '531',
          bankName: 'THE KRISHNANAGAR CITY COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '532',
          bankName: 'HDFC BANK LIMITED, KRISHNA BHIMA SAMRUDDHI LAB'
        },
        {
          bankId: '533',
          bankName: 'KASHMIR MERCANTILE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '534',
          bankName: 'THE JAMSHEDPUR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '535',
          bankName: 'JANKALYAN URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '536',
          bankName: 'JANSEWA URBAN COOPERATIVE BANK'
        },
        {
          bankId: '537',
          bankName: 'JAI TULJA BHAVANI UR BANK COOPERATIVE LIMITED '
        },
        {
          bankId: '539',
          bankName: 'THE JALNA PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '540',
          bankName: 'THE JALNA PEOPLES COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '541',
          bankName: 'JHARNESHWAR NAGRIK SAHAKARI BANK'
        },
        {
          bankId: '542',
          bankName: 'THE JHALAWAR NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '543',
          bankName: 'JANSEVA NAGARI SAHAKARI BANK LIMITED '
        },
        {
          bankId: '544',
          bankName: 'JODHPUR NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '545',
          bankName: 'JIJAMATA MAHILA SAHAKARI BANK LIMITED '
        },
        {
          bankId: '546',
          bankName: 'JIJAMATA MAHILA NAG SAHAKARI BANK LIMITED'
        },
        {
          bankId: '547',
          bankName: 'JALNA MERCHANTS COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '548',
          bankName: 'THE JUNAGADH COMM COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '549',
          bankName: 'JANAKALYAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '550',
          bankName: 'JANATA COOPERATIVE BANK LIMITED, MALEGAON'
        },
        {
          bankId: '551',
          bankName: 'JATH URBAN COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '552',
          bankName: 'JALORE NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '553',
          bankName: 'INTEGRAL URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '554',
          bankName: 'IRINJALAKUDA TOWN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '555',
          bankName: 'INDORE SWAYAMSIDH MAHILA COOPERATIVE BANK'
        },
        {
          bankId: '556',
          bankName: 'INDIRA  MAHILA  SAHAKARI BANK LIMITED'
        },
        {
          bankId: '557',
          bankName: 'THE ICHALKARANJI MER COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '558',
          bankName: 'INDRAYANI COOPERATIVE  BANK LIMITED'
        },
        {
          bankId: '559',
          bankName: 'INDEPEDENCE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '560',
          bankName: 'THE HIRASUGAR EMPLOYEES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '561',
          bankName: 'SIHOR MERCANTILE COOPERATIVE BANK'
        },
        {
          bankId: '562',
          bankName: 'THE HALOL MERCANTILE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '563',
          bankName: 'THE HANUMANTHANAGAR COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '564',
          bankName: 'THE HASTI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '565',
          bankName: 'GHOGHAMBA VIBHAG NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '566',
          bankName: 'THE GOA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '567',
          bankName: 'SHREE GVERDHNSNGH RAGUVNSHI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '568',
          bankName: 'THE GHATAL PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '569',
          bankName: 'GONDAL NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '570',
          bankName: 'THE GADCHIROLI NAG SAHAKARI BANK'
        },
        {
          bankId: '571',
          bankName: 'GANDHINAGAR NAG. COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '572',
          bankName: 'GUJARAT MERCANTILE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '573',
          bankName: 'GODAVARI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '574',
          bankName: 'GANRAJ NAGARI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '575',
          bankName: 'ETAWAH URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '576',
          bankName: 'HDFC BANK LIMITED, EASTERN & NORTH EAST FRONTIER R'
        },
        {
          bankId: '577',
          bankName: 'THE EENADU COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '578',
          bankName: 'EXCELLENT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '579',
          bankName: 'DARUSSALAM COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '580',
          bankName: 'THE DAHOD URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '581',
          bankName: 'THE DARUSSALAM COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '582',
          bankName: 'DAIVADNYA SAHAKARA BANK '
        },
        {
          bankId: '583',
          bankName: 'THE DHARMAJ PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '584',
          bankName: 'DEENDAYAL N S BANK LIMITED'
        },
        {
          bankId: '585',
          bankName: 'DESAIGANJ NAGARI COOPERATIVE BANK'
        },
        {
          bankId: '586',
          bankName: 'DURGAPUR MAHILA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '587',
          bankName: 'THE DHANERA MERCANTILE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '588',
          bankName: 'THE DAHOD MERCANTILE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '589',
          bankName: 'DILIP URBAN COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '590',
          bankName: 'DEVI GAYATRI COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '591',
          bankName: 'THE DEVGAD URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '593',
          bankName: 'DAUND URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '594',
          bankName: 'CHURUZILA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '595',
          bankName: 'CHITTORGARH URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '596',
          bankName: 'THE CHIKHLI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '597',
          bankName: 'CHOPDA PEOPLES COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '598',
          bankName: 'THE CHANASMA NAGRIK SAHA. BANK LIMITED'
        },
        {
          bankId: '599',
          bankName: "COLOUR MERCHANT'S COOPERATIVE BANK LIMITED"
        },
        {
          bankId: '600',
          bankName: 'THE CHARADA NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '601',
          bankName: 'SRI CHANNABASAVASWAMY BANK'
        },
        {
          bankId: '602',
          bankName: 'THE BHABHAR VIBHAG NAG SAHAKARI BANK LIMITED'
        },
        {
          bankId: '603',
          bankName: 'THE BICHOLIUM URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '604',
          bankName: 'BRAMHAPURI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '605',
          bankName: 'THE BUNDI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '606',
          bankName: 'BHARATHIYA SAHAKARA BANK '
        },
        {
          bankId: '607',
          bankName: 'THE BARAMATI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '608',
          bankName: 'BHIND NAGRIK SAHAKARI BANK '
        },
        {
          bankId: '609',
          bankName: 'BALASINOR NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '610',
          bankName: 'BILASPUR NAGRIK SAHA BANK LIMITED'
        },
        {
          bankId: '611',
          bankName: 'BHILAI NAGRIK SAHAKARI BANK '
        },
        {
          bankId: '612',
          bankName: 'BHAGINI NIVEDITA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '613',
          bankName: 'BARAN NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '614',
          bankName: 'BHILWARA MAHILA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '615',
          bankName: 'BILASA MAHILA NAGRIK SAHAKARI BANK'
        },
        {
          bankId: '616',
          bankName: 'THE BAPUNAGAR MAHILA COOPERATIVE BANK'
        },
        {
          bankId: '617',
          bankName: 'THE BHUJ MERCANTILE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '618',
          bankName: 'THE BHAGYALAKSHMI MAHILA SAHAKARI BANK'
        },
        {
          bankId: '619',
          bankName: 'BELGAUM INDUSTRIAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '620',
          bankName: 'THE BHANDARA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '621',
          bankName: 'SHRI BHARAT UR COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '622',
          bankName: 'BHILWARA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '623',
          bankName: 'BHAGYODAYA FRIENDS UR COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '624',
          bankName: 'BAIDYABATI SHEORAPHULI COOPERATIVE BANK'
        },
        {
          bankId: '625',
          bankName: 'THE BERHAMPUR COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '626',
          bankName: 'THE BURDWAN CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '627',
          bankName: 'THE BANTRA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '628',
          bankName: 'DR BABASAHEB AMBEDKAR UR COOPERATIVE BANK'
        },
        {
          bankId: '629',
          bankName: 'THE BIHAR AWAMI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '630',
          bankName: 'AMRAVATI ZILLA MAHILA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '631',
          bankName: 'ANURADHA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '632',
          bankName: 'ARVIND SAHAKARI BANK LIMITED'
        },
        {
          bankId: '633',
          bankName: 'DR BABASAHEB AMBEDKAR SAHAKARI BANK LIMITED'
        },
        {
          bankId: '634',
          bankName: 'THE AP JANATA COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '635',
          bankName: 'AMBAJOGAI PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '636',
          bankName: 'APANI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '637',
          bankName: 'ANDAMAN & NICOBAR STATE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '638',
          bankName: 'THE AMOD NAGRIK COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '639',
          bankName: 'ASTHA MAHILA NAGRIK SAHAKARI BANK'
        },
        {
          bankId: '640',
          bankName: 'ADARSH MAHILA MERCNT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '641',
          bankName: 'AKOLA MERCHANT COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '642',
          bankName: 'AKOLA MERCHANT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '643',
          bankName: 'AMARNATH COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '644',
          bankName: 'THE AGS EMPLOYEES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '645',
          bankName: 'THE ADINATH COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '646',
          bankName: 'THE ARYAPURAM COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '648',
          bankName: 'THE ASSAM COOPERATIVE APEX BANK LIMITED'
        },
        {
          bankId: '649',
          bankName: 'A B BANK LIMITED'
        },
        {
          bankId: '650',
          bankName: 'AKHAND ANAND COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '651',
          bankName: 'RAIGAD SAHAKARI BANK LIMITED'
        },
        {
          bankId: '652',
          bankName: 'THE CHAMBA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '653',
          bankName: 'HIMACHAL PRADESH STATE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '654',
          bankName: 'HSBC BANK'
        },
        {
          bankId: '656',
          bankName: 'ICICI BANK LIMITED'
        },
        {
          bankId: '657',
          bankName: 'ZILA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '658',
          bankName: 'WARDHA ZILLA PARISHAD EMPLOYEES URBAN COOPERATIVE '
        },
        {
          bankId: '659',
          bankName: 'VIKRAMADITYA NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '660',
          bankName: 'VIVEKANAND NAGRIK SAHAKARI BANK'
        },
        {
          bankId: '661',
          bankName: 'THE VALSAD MAHILA NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '662',
          bankName: 'THE VITA MERCHANTS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '663',
          bankName: 'ICICI BANK LIMITED, VAISHYA NAGARI'
        },
        {
          bankId: '664',
          bankName: 'UDAIPUR MAHILA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '665',
          bankName: 'THE URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '666',
          bankName: 'THE TALOD NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '667',
          bankName: 'THE SATANA MERCHANTS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '668',
          bankName: 'THE THODUPUZHA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '669',
          bankName: 'THASRA PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '670',
          bankName: 'TERNA NAGARI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '671',
          bankName: 'THE MAYANI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '672',
          bankName: 'THE MERCHANTS URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '673',
          bankName: 'THE KARJAN NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '674',
          bankName: 'TEHRI GARHWAL ZILA SAHAKARI BANK LIMITED, ICICI BA'
        },
        {
          bankId: '675',
          bankName: 'THE GANESH SAHAKARI BANK LIMITED'
        },
        {
          bankId: '676',
          bankName: 'THE ELURU URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '677',
          bankName: 'THE DEOLA MERCHANTS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '678',
          bankName: 'THE CHITNAVISPURA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '679',
          bankName: 'THE ANAND MERCANTILE COOPERATIVE BANK'
        },
        {
          bankId: '680',
          bankName: 'SHREE VYANKATESH COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '681',
          bankName: 'SULAIMANI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '682',
          bankName: 'SAMARTH URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '683',
          bankName: 'THE SINDAGI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '684',
          bankName: 'THE SSK COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '685',
          bankName: 'SANMATI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '686',
          bankName: 'THE SINOR NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '687',
          bankName: 'SHRIMANT MALOJIRAJE SAHAKARI BANK LIMITED'
        },
        {
          bankId: '688',
          bankName: 'SAMARTH SAHAKARI BANK LIMITED'
        },
        {
          bankId: '689',
          bankName: 'SANMITRA MAHILA NAGRI SAHAKARI BANK'
        },
        {
          bankId: '690',
          bankName: 'THE SECUNDERABAD MERCANTILE COOPERATIVE URBAN BANK'
        },
        {
          bankId: '691',
          bankName: 'SRI KALIDASA SAHAKARA BANK '
        },
        {
          bankId: '692',
          bankName: 'SIDDHESHWAR URBAN COOPERATIVE BANK'
        },
        {
          bankId: '693',
          bankName: 'URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '694',
          bankName: 'THE SEVALIA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '695',
          bankName: 'SHRI BASAVESHWAR SAHAKARI BANK '
        },
        {
          bankId: '696',
          bankName: 'SAMATA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '697',
          bankName: 'THE RAIPUR URBAN MERCHANT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '698',
          bankName: 'RAJAPUR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '699',
          bankName: 'RAMPUR ZILA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '700',
          bankName: 'THE PIJ PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '701',
          bankName: 'THE PANDHARPUR  MERCHANTS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '702',
          bankName: 'OMERGA JANTA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '703',
          bankName: 'THE NAVJEEVAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '704',
          bankName: 'NARODA NAGRIK COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '705',
          bankName: 'NIDHI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '706',
          bankName: 'NISHIGANDHA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '707',
          bankName: 'NORTH EAST SMALL FINANCE BANK LIMITED'
        },
        {
          bankId: '708',
          bankName: 'THE NASIK DIST CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '709',
          bankName: 'MATHURA ZILLA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '710',
          bankName: 'MAHESH URBAN COP BANK LIMITED'
        },
        {
          bankId: '711',
          bankName: 'MAA SHARDA MAHILA NAGRIK BANK'
        },
        {
          bankId: '712',
          bankName: 'MAHARANA PRATAP COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '713',
          bankName: 'MARKANDEY NAGARI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '714',
          bankName: 'MAHISHMATI NAGRIK SAHAKARI BANK'
        },
        {
          bankId: '715',
          bankName: 'THE MANJERI COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '716',
          bankName: 'MANWATH URBAN COOPERATIVE BANK'
        },
        {
          bankId: '717',
          bankName: 'LAXMI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '718',
          bankName: 'LAXMIBAI MAHILA NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '719',
          bankName: 'LAKHIMPUR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '720',
          bankName: 'KANPUR ZILLA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '721',
          bankName: 'THE KURLA NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '722',
          bankName: 'THE KHEDA PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '723',
          bankName: 'KEDARNATH URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '724',
          bankName: 'KHALILABAD NAGAR SAHAKARI BANK LIMITED ICICI BANK'
        },
        {
          bankId: '725',
          bankName: 'DISTRICT COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '726',
          bankName: 'THE KAIRA DISTRICT CENTRAL COOPERATIVE BANK LIMITE'
        },
        {
          bankId: '727',
          bankName: 'JAYSINGPUR UDGAON SAHAKARI BANK LIMITED'
        },
        {
          bankId: '728',
          bankName: 'JANTA URBAN COOPERATIVE BANK'
        },
        {
          bankId: '729',
          bankName: 'JANTA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '730',
          bankName: 'JAIPRAKASH NARAYAN NAGRI SAHAKARI BANK'
        },
        {
          bankId: '731',
          bankName: 'THE JANATA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '732',
          bankName: 'INDAPUR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '733',
          bankName: 'INDORE PARASPAR SAHAKARI BANK LIMITED'
        },
        {
          bankId: '734',
          bankName: 'INDIRA MAHILA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '735',
          bankName: 'INDRAYANI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '736',
          bankName: 'HUTATMA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '737',
          bankName: 'HARIHARESHWAR SAHAKARI BANK LIMITED'
        },
        {
          bankId: '738',
          bankName: 'GOMTI NAGARIYA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '739',
          bankName: 'GAJANAN NAGARI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '741',
          bankName: 'THE ELURI COOPERATIVE URBAN BANK LIMITED '
        },
        {
          bankId: '742',
          bankName: 'DWARKADAS MANTRI NAGARI SAHAKARI BANK'
        },
        {
          bankId: '743',
          bankName: 'DATTATRAYA MAHARAJ KALAMBE JAOLI SAHAKARI BANK LIM'
        },
        {
          bankId: '744',
          bankName: 'CHAMOLI ZILA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '745',
          bankName: 'THE CHANDGAD URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '746',
          bankName: 'THE CHEMBUR NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '747',
          bankName: 'THE CHANDWAD MERCHANT S COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '748',
          bankName: 'THE BHADGAON PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '749',
          bankName: 'BHAVANI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '750',
          bankName: 'THE BABASAHEB DESHMUKH SAHAKARI BANK LIMITED'
        },
        {
          bankId: '751',
          bankName: 'BIRDEV SAHAKARI BANK '
        },
        {
          bankId: '752',
          bankName: 'BASTI ZILA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '753',
          bankName: 'BHAUSAHEB BIRAJDAR NAGARI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '754',
          bankName: 'ASHOK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '755',
          bankName: 'ARIHANT URBAN CO-OPERATIVA BANK LIMITED'
        },
        {
          bankId: '756',
          bankName: 'SHRI ARIHANT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '757',
          bankName: 'AMAN SAHAKARI BANK LIMITED '
        },
        {
          bankId: '758',
          bankName: 'AMBARNATH JAI HIND COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '759',
          bankName: 'THE AHMEDNAGAR DIST CEN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '760',
          bankName: 'ARMY BASE WORKSHOP CREDIT CO PRIMARY BANK LIMITED'
        },
        {
          bankId: '761',
          bankName: 'IDBI BANK'
        },
        {
          bankId: '762',
          bankName: 'SIR M VISHWESHARAIAH SAHAKAR BANK '
        },
        {
          bankId: '763',
          bankName: 'SRI CHATRAPATI SHIVAJI SAHAKARI BANK'
        },
        {
          bankId: '764',
          bankName: 'SRI GURU RAGHAVENDRA SAHAKARA BANK '
        },
        {
          bankId: '765',
          bankName: 'SANDUR PATTANA SOUHARDA SAHAKARI BANK'
        },
        {
          bankId: '766',
          bankName: 'PITHORAGARH JILA SAHAKARI BANK'
        },
        {
          bankId: '767',
          bankName: 'PITHORAGARH ZILA SAHAKARI BANK'
        },
        {
          bankId: '768',
          bankName: 'CHAITANYA MAHILA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '769',
          bankName: 'THE QUILON COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '770',
          bankName: 'THE SITAMARHI CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '771',
          bankName: 'THE BARDOLI NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '772',
          bankName: 'TEHRI GARHWAL ZILA SAHAKARI BANK, IDBI BANK'
        },
        {
          bankId: '773',
          bankName: 'AMRELI NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '774',
          bankName: 'JHARKHAND STATE COOPERATIVE BANK '
        },
        {
          bankId: '775',
          bankName: 'STATE TRANSPORT COOPERATIVE BANK '
        },
        {
          bankId: '776',
          bankName: 'STATE TRANSPORT  BANK '
        },
        {
          bankId: '777',
          bankName: 'THE TASGAON URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '778',
          bankName: 'THE BHANDARA DISTRICT CENTRAL COOPERATIVE BANK LIM'
        },
        {
          bankId: '779',
          bankName: 'THE RAJAPUR SAHAKARI BANK'
        },
        {
          bankId: '780',
          bankName: 'BHAVANI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '781',
          bankName: 'RATNAGIRI DISTRICT CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '782',
          bankName: 'THE GRAIN MERCHANTS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '783',
          bankName: 'PUNE PEOPLES COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '784',
          bankName: 'SAHYOG URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '785',
          bankName: 'IDBI BANK LIMITED,MHAISAL'
        },
        {
          bankId: '786',
          bankName: 'JALNA DIST CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '787',
          bankName: 'THE NAGPUR DIST CENTRAL COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '788',
          bankName: 'VAISHYA SAHAKARI BANK LIMITED '
        },
        {
          bankId: '789',
          bankName: 'THE NANDED MERCHANT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '790',
          bankName: 'THE LATUR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '791',
          bankName: 'SANGLI DISTRICT PRIMARY TEACHERS COOPERATIVE BANK '
        },
        {
          bankId: '792',
          bankName: 'THE SANGLI DISTRICT CENTRAL COOPERATIVE BANK LIMIT'
        },
        {
          bankId: '793',
          bankName: 'PRATHAMIC SHIKSHAK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '794',
          bankName: 'MANN DESHI MAHILA SAHAKARI BANK LIMITED, MHASWAD'
        },
        {
          bankId: '795',
          bankName: 'DHULE AND NANDURBAR DISTRICT CENTRAL COOPERATIVE B'
        },
        {
          bankId: '796',
          bankName: 'VIKAS SAHAKARI BANK LIMITED'
        },
        {
          bankId: '797',
          bankName: 'SHARAD NAGARI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '798',
          bankName: 'THE MAHABALESHWAR URBAN COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '799',
          bankName: 'THE PRITISANGAM SAHAKARI BANK LIMITED'
        },
        {
          bankId: '800',
          bankName: 'KOYANA SAHAKARI BANK LIMITED '
        },
        {
          bankId: '801',
          bankName: 'KRISHNA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '802',
          bankName: 'NUTAN SAHAKARI BANK LIMITED '
        },
        {
          bankId: '803',
          bankName: 'JIVAJI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '804',
          bankName: 'THE BABASAHEB DESHMUKH SAHAKARI BANK LIMITED '
        },
        {
          bankId: '805',
          bankName: 'THE PRATHAMIK SHIKSHAK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '806',
          bankName: 'SHRI PANCHGANGA NAGARI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '807',
          bankName: 'SHRI YASHWANT SAHAKARI BANK '
        },
        {
          bankId: '808',
          bankName: 'KUMBHI KASARI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '809',
          bankName: 'KOLHAPUR DISTRICT CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '810',
          bankName: 'D.Y.PATIL SAHAKARI BANK LIMITED'
        },
        {
          bankId: '811',
          bankName: 'SAMPADA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '812',
          bankName: 'THE NASHIK JILHA MAHILA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '813',
          bankName: 'THE CITY COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '814',
          bankName: 'MOGAVEERA COOPERATIVE BANK'
        },
        {
          bankId: '815',
          bankName: 'THE JAIN SAHAKARI BANK LIMITED'
        },
        {
          bankId: '816',
          bankName: 'AJINKYATARA MAHILA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '817',
          bankName: 'SARVODAYA COOPERATIVE BANK'
        },
        {
          bankId: '818',
          bankName: 'THE MEHSANA NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '819',
          bankName: 'MIDNAPORE PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '820',
          bankName: 'MAGADH CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '821',
          bankName: 'RAMGARHIA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '822',
          bankName: 'THE KESHAV SEHKARI BANK LIMITED'
        },
        {
          bankId: '823',
          bankName: 'KEMPEGOWDA PATTANA SOUHARDA SAHAKARI BANK '
        },
        {
          bankId: '824',
          bankName: 'TALIPARAMBA COOPERATIVE URBAN BANK'
        },
        {
          bankId: '825',
          bankName: 'PAYANGADI URBAN COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '826',
          bankName: 'NILESHWAR COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '827',
          bankName: 'KANNUR DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '828',
          bankName: 'ALIBAG COOPERATIVE URBAN BANK LIMITED '
        },
        {
          bankId: '829',
          bankName: 'MUZAFFARPUR CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '830',
          bankName: 'SHREE GAJANAN LOKSEVA SAHAKARI BANK '
        },
        {
          bankId: '831',
          bankName: 'ANNASAHEB MAGAR SAHAKARI BANK'
        },
        {
          bankId: '832',
          bankName: 'HIMATNAGAR NAGARIK SAHAKARI BANK'
        },
        {
          bankId: '833',
          bankName: 'LOKNETE DATTAJI PATIL SAHAKARI BANK LIMITED'
        },
        {
          bankId: '834',
          bankName: 'THE PANVELURBAN COOPERATIVE BANK'
        },
        {
          bankId: '835',
          bankName: 'SHRI KADASIDDESHWAR PATTAN SAHAKARI BANK '
        },
        {
          bankId: '836',
          bankName: 'RAJKOT PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '837',
          bankName: 'SHREE BOTAD MERCANTILE COOPERATIVE BANK'
        },
        {
          bankId: '838',
          bankName: 'THE DHRANGADHRA PEO COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '839',
          bankName: 'SHILLONG COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '840',
          bankName: 'SRIRAMANAGAR PATTANA SAHAKARA BANK '
        },
        {
          bankId: '841',
          bankName: 'THE CARDAMOM MERCHANTS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '842',
          bankName: 'THE BADAGARA COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '843',
          bankName: 'THE KALOL NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '844',
          bankName: 'THE GUMLA SIMDEGA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '845',
          bankName: 'THE NATIONAL CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '846',
          bankName: 'THE AZAD COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '847',
          bankName: 'THE MERCHANTS SOUHARDA SAHAKARA BANK '
        },
        {
          bankId: '848',
          bankName: 'NAVI COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '849',
          bankName: 'UTTARKASHI ZILA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '850',
          bankName: 'SHREE GAVISIDDHESHWAR URBAN COOPERATIVE BANK LIMIT'
        },
        {
          bankId: '851',
          bankName: 'AURANGABAD DIST CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '852',
          bankName: 'THE VITA MERCHANT COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '853',
          bankName: 'VISHWANATHRAO PATIL MURGUD SAHAKARI BANK '
        },
        {
          bankId: '854',
          bankName: 'SHRIPATRAODADA SAHAKARI BANK LIMITED '
        },
        {
          bankId: '855',
          bankName: 'SHRIPAL ALASE KURUNWAD URB COOPERATIVE BANK'
        },
        {
          bankId: '856',
          bankName: 'RENDAL SAHAKARI BANK LIMITED'
        },
        {
          bankId: '857',
          bankName: 'RAJARAMBAPU SAHAKARI BANK LIMITED'
        },
        {
          bankId: '858',
          bankName: 'THE KODOLI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '859',
          bankName: 'THE KAGAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '860',
          bankName: 'JAWAHAR SAHAKARI BANK LIMITED '
        },
        {
          bankId: '861',
          bankName: 'HUTATMA SHAHKARI BANK LIMITED '
        },
        {
          bankId: '862',
          bankName: 'DAPOLI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '863',
          bankName: 'THE AJARA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '864',
          bankName: 'THE ASTHA PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '865',
          bankName: 'THE INDUSTRIAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '866',
          bankName: 'NADAPURAM COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '867',
          bankName: 'BALUSSERY COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '868',
          bankName: 'MYSORE ZILLA MAHILA SAHAKARA BANK '
        },
        {
          bankId: '869',
          bankName: 'THE SONEPAT CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '870',
          bankName: 'THE IDAR NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '871',
          bankName: 'SWARNA BHARATHI SAHAKARA BANK '
        },
        {
          bankId: '872',
          bankName: 'THE KHAGARIA DISTRICTCENTRAL COOPERATIVE BANK LIMI'
        },
        {
          bankId: '873',
          bankName: 'THE RANUJ NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '874',
          bankName: 'BILAGI PATTANA SAHAKARI BANK'
        },
        {
          bankId: '875',
          bankName: 'BAGALKOT DIST CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '876',
          bankName: 'THE ROHIKA CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '877',
          bankName: 'NAGAR SAHAKARI BANK, BANK OF INDIA'
        },
        {
          bankId: '878',
          bankName: 'THE BELLARY DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '879',
          bankName: 'SHRI SHANTAPPANNA MIRAJI URBAN COOPERATIVE BANK LI'
        },
        {
          bankId: '880',
          bankName: 'SHREE BASAVESHWAR COOPERATIVE BANK '
        },
        {
          bankId: '881',
          bankName: 'MARATHA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '882',
          bankName: 'JIJAMATA MAHILA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '883',
          bankName: 'BELGAUM ZILLA RANI CHANNAMMA MAHILA SAHAKARI BANK '
        },
        {
          bankId: '884',
          bankName: 'THE BAILHONGAL URBAN COOPERATIVE BANK'
        },
        {
          bankId: '885',
          bankName: 'THE BELGAUM DIST CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '886',
          bankName: 'BELLAD BAGEWADI URBAN SOUHARD SAHAKARI BANK '
        },
        {
          bankId: '887',
          bankName: 'THE SRI KANNIKAPARAMESHWARI COOPERATIVE BANK LIMIT'
        },
        {
          bankId: '888',
          bankName: 'NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '889',
          bankName: 'THE JAWHAR URBAN COOPERATIVE BANK'
        },
        {
          bankId: '890',
          bankName: 'THE INCOME TAX DEPT COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '891',
          bankName: 'THE KAKINADA TOWN COOPERATIVE TOWN BANK'
        },
        {
          bankId: '892',
          bankName: 'THE GUDIVADA COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '893',
          bankName: 'PIMPRI CHINCHWAD SAHAKARI BANK '
        },
        {
          bankId: '894',
          bankName: 'PAVANA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '895',
          bankName: 'THE JAYNAGAR MOZILPUR PEOPLES COOPERATIVE BANK LIM'
        },
        {
          bankId: '896',
          bankName: 'THE RADHASOMAY URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '897',
          bankName: 'DAYALBAGH MAHILA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '898',
          bankName: 'SOUBHAGYA MAHILA SOUHARDHA SAHAKARI BANK '
        },
        {
          bankId: '899',
          bankName: 'THE SIRSI URBAN SAHAKARI BANK LIMITED'
        },
        {
          bankId: '900',
          bankName: 'THE RADDI SAHAKARA BANK '
        },
        {
          bankId: '901',
          bankName: 'SHREE GAJANAN URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '902',
          bankName: 'THE DAVANGERE URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '903',
          bankName: 'SHREE BASAVESHWAR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '904',
          bankName: 'AZAD URBAN BANK'
        },
        {
          bankId: '905',
          bankName: 'THE ANKOLA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '906',
          bankName: 'THE GANDEVI PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '907',
          bankName: 'JABALPUR MAHILA NAGRIK SHAKARI BANK'
        },
        {
          bankId: '908',
          bankName: 'KHORDHA CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '909',
          bankName: 'THE YAVATMAL URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '910',
          bankName: 'SAMRUDDHI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '911',
          bankName: 'VIDARBHA MERCHANTS U.C.B. LIMITED'
        },
        {
          bankId: '912',
          bankName: 'THE VISAKHAPATNAM COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '913',
          bankName: 'THE MAHARAJA COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '914',
          bankName: 'STANDARD URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '915',
          bankName: 'SHRAMIK NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '916',
          bankName: 'IDFC BANK LIMITED'
        },
        {
          bankId: '917',
          bankName: 'IDUKKI DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '918',
          bankName: 'IDUKKI DISTRICT COOPERATIVE BANK'
        },
        {
          bankId: '919',
          bankName: 'ILKAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '920',
          bankName: 'IMPHAL URBAN COOPERATIVE BANK'
        },
        {
          bankId: '921',
          bankName: 'INDIAN BANK'
        },
        {
          bankId: '922',
          bankName: 'ODISHA GRAMEEN BANK'
        },
        {
          bankId: '923',
          bankName: 'IOB PANDYAN GRAMA BANK'
        },
        {
          bankId: '924',
          bankName: 'INDIAN OVERSEAS BANK'
        },
        {
          bankId: '925',
          bankName: 'THE UTTARSANDA PEOPLES COOPERATIVE BANK'
        },
        {
          bankId: '927',
          bankName: 'INDUSIND BANK'
        },
        {
          bankId: '928',
          bankName: 'SRI SHARADA MAHILA COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '929',
          bankName: 'SREENIDHI SOUH BANK'
        },
        {
          bankId: '930',
          bankName: 'SREENIDHI SOUH SAHAK BANK '
        },
        {
          bankId: '931',
          bankName: 'SRIMATHA MAHILA SAHAKARI BANK '
        },
        {
          bankId: '932',
          bankName: 'SRI LAKSHMINARAYANA COOPERATIVE BANK '
        },
        {
          bankId: '933',
          bankName: 'SRI LAKSHMI MAHILA SAHAKARI BANK '
        },
        {
          bankId: '934',
          bankName: 'SREE CHARAN BANK '
        },
        {
          bankId: '935',
          bankName: 'SRI BANASHANKAR MAHILA COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '936',
          bankName: 'THE SAMMCO BANK LIMITED '
        },
        {
          bankId: '937',
          bankName: 'THE NEHRUNAGAR COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '938',
          bankName: 'NOIDA COMMERCIAL COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '939',
          bankName: 'THE GANDHIDHAM MER COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '940',
          bankName: 'DOHA BANK '
        },
        {
          bankId: '941',
          bankName: 'BANGALORE CITY COOPERATIVE BANK'
        },
        {
          bankId: '942',
          bankName: 'INDUSTRIAL AND COMMERCIAL BANK OF CHINA LIMITED'
        },
        {
          bankId: '943',
          bankName: 'INDUSTRIAL BANK OF KOREA'
        },
        {
          bankId: '944',
          bankName: 'JAGRUTI COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '945',
          bankName: 'JALAUN DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '946',
          bankName: 'JALGAON JANATA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '947',
          bankName: 'JAMIA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '948',
          bankName: 'JAMMU AND KASHMIR BANK LIMITED'
        },
        {
          bankId: '949',
          bankName: 'JAMPETA COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '950',
          bankName: 'JANAKALYAN SAHAKARI BANK LIMITED'
        },
        {
          bankId: '951',
          bankName: 'JANASEVA SAHAKARI BANK BORIVLI LIMITED'
        },
        {
          bankId: '952',
          bankName: 'JANASEVA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '953',
          bankName: 'JANATHA SEVA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '955',
          bankName: 'JIVAN COMMERCIAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '956',
          bankName: 'JP MORGAN BANK'
        },
        {
          bankId: '957',
          bankName: 'KALLAPPANNA AWADE ICHALKARANJI JANATA SAHAKARI BAN'
        },
        {
          bankId: '958',
          bankName: 'KALPARUKSHA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '959',
          bankName: 'KALUPUR COMMERCIAL COOPERATIVE BANK'
        },
        {
          bankId: '960',
          bankName: 'THE KONARK URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '961',
          bankName: 'KALYAN JANATA SAHAKARI BANK'
        },
        {
          bankId: '962',
          bankName: 'KAMALA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '963',
          bankName: 'KANNUR DISTRICT  COOPERATIVE BANK'
        },
        {
          bankId: '964',
          bankName: 'KAPOL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '965',
          bankName: 'KARAMANA COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '966',
          bankName: 'KARNATAKA BANK LIMITED'
        },
        {
          bankId: '967',
          bankName: 'KARNATAKA VIKAS GRAMIN BANK'
        },
        {
          bankId: '968',
          bankName: 'KARUR VYSYA BANK'
        },
        {
          bankId: '969',
          bankName: 'KEB Hana Bank'
        },
        {
          bankId: '970',
          bankName: 'KEONJHAR CENTRAL COOOPERATIVE BANK'
        },
        {
          bankId: '971',
          bankName: 'KERALA GRAMIN BANK'
        },
        {
          bankId: '972',
          bankName: 'KHARDAH COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '974',
          bankName: 'KODOLI URBAN COOPERATIVE BANK'
        },
        {
          bankId: '975',
          bankName: 'KOLKATA POLICE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '976',
          bankName: 'KONOKLOTA MAHILA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '977',
          bankName: 'YESHWANT URBAN COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '979',
          bankName: 'VIJAY COMMERCIAL COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '980',
          bankName: 'UMIYA URBAN COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '981',
          bankName: 'THE SARVODAYA SAHAKARI BANK LIMITED '
        },
        {
          bankId: '982',
          bankName: 'THE SANKHEDA NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '983',
          bankName: 'SHREE TALAJA NAGARIK SAHA BANK LIMITED'
        },
        {
          bankId: '984',
          bankName: 'THE NATIONAL COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '985',
          bankName: 'THE KARNAVATI COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '987',
          bankName: 'SARASWATI SHAKARI BANK LIMITED '
        },
        {
          bankId: '988',
          bankName: 'SHRI RUKHMINI SAHAKARI BANK LIMITED '
        },
        {
          bankId: '989',
          bankName: 'KOTAK MAHINDRA BANK LIMITED'
        },
        {
          bankId: '990',
          bankName: 'SONPETH NAGARI SAHAKARI BANK'
        },
        {
          bankId: '991',
          bankName: 'SHAJAPUR NAGRIK SAHAKARI BANK '
        },
        {
          bankId: '992',
          bankName: 'SAMATHA MAHILA COOPERATIVE URBAN BANK LIMITED '
        },
        {
          bankId: '993',
          bankName: 'SHREE MAHAVIR SAHAKARI BANK LIMITED '
        },
        {
          bankId: '994',
          bankName: 'THE SHIRPUR PEOPLES COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '995',
          bankName: 'SANMITRA SAHAKARI BANK LIMITED '
        },
        {
          bankId: '996',
          bankName: 'SAHYOG URBAN COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '997',
          bankName: 'SAIBABA NAGARI SAHAKARI BANK'
        },
        {
          bankId: '998',
          bankName: 'THE RANGA REDDY COOPERATIVE URBAN BANK LIMITED '
        },
        {
          bankId: '999',
          bankName: 'PARNER TALUKA SAINIK SAHAKARI BANK LIMITED '
        },
        {
          bankId: '1000',
          bankName: 'PRERNA NAGARI SAHAKARI BANK LIMITED '
        },
        {
          bankId: '1001',
          bankName: 'PRIYADARSHANI NAGARI SAHAKARI BANK '
        },
        {
          bankId: '1002',
          bankName: 'PROGRESSIVE COOPERATIVE BANK'
        },
        {
          bankId: '1003',
          bankName: 'THE NIPHAD URBAN COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '1004',
          bankName: 'THE NANDURBAR MERCHANTS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1005',
          bankName: 'NAVABHARAT COOPERATIVE URBAN BANK LIMITED '
        },
        {
          bankId: '1006',
          bankName: 'THE MAHILA VIKAS COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '1007',
          bankName: 'MANTHA URBAN COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '1008',
          bankName: 'MYSORE SILK CLOTH MERCHANT COOPERATIVE BANK LIMITE'
        },
        {
          bankId: '1009',
          bankName: 'THE MODASA NAGARIK SAHAKARI BANK LIMITED '
        },
        {
          bankId: '1010',
          bankName: 'KOKAN MERCANTILE COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '1011',
          bankName: 'THE JHALOD URBAN COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '1012',
          bankName: 'JAI BHAVANI SAHAKARI BANK LIMITED '
        },
        {
          bankId: '1013',
          bankName: 'INDIRA MAHILA SAHAKARI BANK LIMITED '
        },
        {
          bankId: '1014',
          bankName: 'INDIRA MAHILA NAGARI SAHAKARI BANK LIMITED '
        },
        {
          bankId: '1015',
          bankName: 'SHRI GAJANAN MAHARAJ URBAN COOPERATIVE BANK LIMITE'
        },
        {
          bankId: '1017',
          bankName: 'GODAVARI LAXMI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1018',
          bankName: 'GUJARAT AMBUJA COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '1019',
          bankName: 'THE DAHOD MERCANTILE COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '1020',
          bankName: 'THE DAHANU ROAD JANATA COOPERATIVE BANK'
        },
        {
          bankId: '1021',
          bankName: 'THE DECCAN COOPERATIVE URBAN BANK LIMITED '
        },
        {
          bankId: '1022',
          bankName: 'CHAITANYA COOPERATIVE URBAN BANK LIMITED '
        },
        {
          bankId: '1023',
          bankName: 'THE COOPERATIVE BANK OF MEHSANA LIMITED  '
        },
        {
          bankId: '1024',
          bankName: 'THE BAVLA NAGRIK SAHAKARI BANK LIMITED '
        },
        {
          bankId: '1025',
          bankName: 'ADARSH MAHILA NAGARI SAHAKARI BANK '
        },
        {
          bankId: '1026',
          bankName: 'KOTTAYAM COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1027',
          bankName: 'KOTTAYAM DISTRICT COOPERATIVE BANK'
        },
        {
          bankId: '1028',
          bankName: 'KOZHIKODE DISTRICT COOPERATIAVE BANK LIMITED'
        },
        {
          bankId: '1029',
          bankName: 'KUTCH COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1030',
          bankName: 'KUTTIADY COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1031',
          bankName: 'LATUR DISTRICT CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1032',
          bankName: 'LAXMI VILAS BANK'
        },
        {
          bankId: '1033',
          bankName: 'LIC COOPERATIVE BANK'
        },
        {
          bankId: '1034',
          bankName: 'LIC EMPLOYEES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1035',
          bankName: 'LIC OF INDIA STAFF COOPERATIVE BANK'
        },
        {
          bankId: '1036',
          bankName: 'LILUAH COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1037',
          bankName: 'LOKMANGAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1038',
          bankName: 'M S COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1039',
          bankName: 'M.D. PAWAR PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1040',
          bankName: 'MADHYA BHARAT GRAMIN BANK'
        },
        {
          bankId: '1041',
          bankName: 'MAHABHAIRAB COOPERATIVE URBAN BANK'
        },
        {
          bankId: '1042',
          bankName: 'MAHALAKSHMI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1043',
          bankName: 'MAHANAGAR COOPERATIVE BANK'
        },
        {
          bankId: '1044',
          bankName: 'MAHARASHTRA GRAMIN BANK'
        },
        {
          bankId: '1045',
          bankName: 'MAHARASHTRA STATE COOPERATIVE BANK'
        },
        {
          bankId: '1046',
          bankName: 'MAHATAMA FULE DISTRICT URBAN COOPERATIVE BANK'
        },
        {
          bankId: '1047',
          bankName: 'MAHOBA URBAN COOPERATIVE BANK'
        },
        {
          bankId: '1048',
          bankName: 'MALAPPURAM DISTRICT COOPERATIVE BANK'
        },
        {
          bankId: '1049',
          bankName: 'MALWA GRAMIN BANK'
        },
        {
          bankId: '1050',
          bankName: 'MANGAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1051',
          bankName: 'KANKARIA MANINAGAR COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1052',
          bankName: 'MANJERI COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1053',
          bankName: 'MANSING COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1054',
          bankName: 'MASHREQ BANK'
        },
        {
          bankId: '1055',
          bankName: 'MERCHANTS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1056',
          bankName: 'MILLATH COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1057',
          bankName: 'MIZORAM COOPERATIVE APEX BANK LIMITED'
        },
        {
          bankId: '1058',
          bankName: 'MIZUHO BANK LIMITED'
        },
        {
          bankId: '1059',
          bankName: 'MOHAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1060',
          bankName: 'MONGHYR JAMUI CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1061',
          bankName: 'MUDGAL URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1062',
          bankName: 'MUGBERIA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1063',
          bankName: 'MUKTAI COOPERATIVE BANK LIMITED NIPHAD'
        },
        {
          bankId: '1064',
          bankName: 'NADIA DISTRICT CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1065',
          bankName: 'NAGAR URBAN COOPERATIVE BANK'
        },
        {
          bankId: '1066',
          bankName: 'NAGAUR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1067',
          bankName: 'NAGPUR NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1068',
          bankName: 'NALANDA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1069',
          bankName: 'NATIONAL AUSTRALIA BANK LIMITED'
        },
        {
          bankId: '1070',
          bankName: 'NATIONAL BANK OF ABU DHABI PJSC'
        },
        {
          bankId: '1071',
          bankName: 'NATIONAL URBAN COOPERATIVE  BANK LIMITED'
        },
        {
          bankId: '1072',
          bankName: 'NELLORE COOPERATIVE URBAN BANK'
        },
        {
          bankId: '1073',
          bankName: 'NEW INDIA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1074',
          bankName: 'NILKANTH COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1075',
          bankName: 'NKGSB COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1076',
          bankName: 'NOBLE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1077',
          bankName: 'NORTH MALABAR GRAMIN BANK'
        },
        {
          bankId: '1078',
          bankName: 'NUTAN NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1079',
          bankName: 'OMAN INTERNATIONAL BANK SAOG'
        },
        {
          bankId: '1080',
          bankName: 'ORIENTAL BANK OF COMMERCE'
        },
        {
          bankId: '1081',
          bankName: 'PALI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1082',
          bankName: 'PASCHIM BANGA GRAMIN BANK'
        },
        {
          bankId: '1083',
          bankName: 'PATAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1084',
          bankName: 'PATLIPUTRA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1085',
          bankName: 'PAYTM PAYMENTS BANK LIMITED'
        },
        {
          bankId: '1086',
          bankName: 'PAYYANUR COOPERATIVE TOWN BANK LIMITED'
        },
        {
          bankId: '1087',
          bankName: 'PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1088',
          bankName: 'PILIBHIT DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1089',
          bankName: 'PONDICHERRY STATE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1090',
          bankName: 'PONNAMPET TOWN COOPERATIVE BANK'
        },
        {
          bankId: '1091',
          bankName: 'PRAGATHI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1092',
          bankName: 'PRAGATHI KRISHNA GRAMIN BANK'
        },
        {
          bankId: '1093',
          bankName: 'PRATHAMA BANK'
        },
        {
          bankId: '1094',
          bankName: 'PRERANA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1095',
          bankName: 'PRIME COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1096',
          bankName: 'PT BANK MAYBANK INDONESIA TBK'
        },
        {
          bankId: '1097',
          bankName: 'PUNE MERCHANTS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1098',
          bankName: 'PUNJAB AND MAHARSHTRA COOPERATIVE BANK'
        },
        {
          bankId: '1099',
          bankName: 'PUNJAB AND SIND BANK'
        },
        {
          bankId: '1100',
          bankName: 'PUNJAB NATIONAL BANK'
        },
        {
          bankId: '1101',
          bankName: 'PURVANCHAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1102',
          bankName: 'PURVANCHAL GRAMIN BANK'
        },
        {
          bankId: '1103',
          bankName: 'RABOBANK INTERNATIONAL'
        },
        {
          bankId: '1104',
          bankName: 'RAE BARELI DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1105',
          bankName: 'RAICHUR DISTRICT CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1106',
          bankName: 'RAILWAY EMPLOYEE COOPERATIVE BANK'
        },
        {
          bankId: '1107',
          bankName: 'RAJADHANI COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1108',
          bankName: 'RAJARSHI SHAHU GOVERMENT SERVANTS COOPERATIVE BANK'
        },
        {
          bankId: '1109',
          bankName: 'RAJASTHAN MARUDHARA GRAMIN BANK'
        },
        {
          bankId: '1110',
          bankName: 'RAJGURUNAGAR SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1111',
          bankName: 'RAJKOT NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1112',
          bankName: 'RANAGHAT PEOPLES COOPERATIVE BANK'
        },
        {
          bankId: '1113',
          bankName: 'RANIGANJ COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1114',
          bankName: 'RATNAGIRI DISTRICT CENTRAL COOPERATIVE BANK LIMIT'
        },
        {
          bankId: '1115',
          bankName: 'RBL BANK LIMITED'
        },
        {
          bankId: '1116',
          bankName: 'RESERVE BANK OF INDIA'
        },
        {
          bankId: '1117',
          bankName: 'SAHEBRAO DESHMUKH COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1118',
          bankName: 'SAMATA COOPERATIVE DEVELOPMENT BANK'
        },
        {
          bankId: '1119',
          bankName: 'SAMRUDDHI COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '1120',
          bankName: 'SANGOLA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1121',
          bankName: 'SARASWAT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1122',
          bankName: 'SUNDARLAL SAVJI COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '1123',
          bankName: 'SUNDARLAL SAWJI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1124',
          bankName: 'SAMATA SAHAKARI BANK'
        },
        {
          bankId: '1125',
          bankName: 'NATIONAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1126',
          bankName: 'MAHESH SAHAKARI BANK '
        },
        {
          bankId: '1127',
          bankName: 'LUCKNOW URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1128',
          bankName: 'KURLA N S BANK '
        },
        {
          bankId: '1129',
          bankName: 'JIJAU COMMERCIAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1131',
          bankName: 'CHEMBUR NAGARIK SAHAKARI BANK'
        },
        {
          bankId: '1132',
          bankName: 'BHADRADRI COOPERATIVE URBAN BANK LIMITED '
        },
        {
          bankId: '1133',
          bankName: 'MANSAROVAR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1134',
          bankName: 'SBU- MERGED BANKS'
        },
        {
          bankId: '1135',
          bankName: 'SASARAM BHABHUA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1136',
          bankName: 'SATLUJ GRAMIN BANK BATHINDA'
        },
        {
          bankId: '1137',
          bankName: 'SAURASHTRA GRAMIN BANK'
        },
        {
          bankId: '1138',
          bankName: 'SAWANTWADI URBAN COPERATIVE BANK'
        },
        {
          bankId: '1139',
          bankName: 'SBER BANK'
        },
        {
          bankId: '1141',
          bankName: 'SEVEN HILLS COOPERATIVE URBAN BANK'
        },
        {
          bankId: '1142',
          bankName: 'SHAHJAHANPUR DISTRICT CENTRAL COOPERATIVE BANK LIM'
        },
        {
          bankId: '1143',
          bankName: 'SHIGGAON URBAN COOPERATIVE BANK'
        },
        {
          bankId: '1144',
          bankName: 'SHINHAN BANK'
        },
        {
          bankId: '1145',
          bankName: 'SHIVALIK MERCANTILE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1146',
          bankName: 'SHREE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1147',
          bankName: 'SHREE DHARTI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1148',
          bankName: 'SHREE PARSWANATH COOPERATIVE BANK'
        },
        {
          bankId: '1149',
          bankName: 'SHREE TUKARAM COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1150',
          bankName: 'SHRI BALAJI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1151',
          bankName: 'SHRI CHHATRAPATI RAJASHRI SHAHU URBAN COOPERATIVE'
        },
        {
          bankId: '1152',
          bankName: 'SHRI D T PATIL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1153',
          bankName: 'SHRI MAHALAXMI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1154',
          bankName: 'SHRI SHIDDHESHWAR COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1155',
          bankName: 'SHRI VEER PULIKESHI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1156',
          bankName: 'SIDDAGANGA URBAN COOPERATIVE BANK'
        },
        {
          bankId: '1157',
          bankName: 'SIDDHI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1158',
          bankName: 'SIKKIMSTATE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1159',
          bankName: 'SINDHUDURG COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1160',
          bankName: 'SIR M VISVESVARAYA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1161',
          bankName: 'SOCIETE GENERALE BANK LIMITED'
        },
        {
          bankId: '1162',
          bankName: 'SOLAPUR JANATA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1163',
          bankName: 'SOUTH INDIAN BANK'
        },
        {
          bankId: '1164',
          bankName: 'SREE CHARAN SOUHARDHA COOPERATIVE BANK  LIMITED'
        },
        {
          bankId: '1165',
          bankName: 'SREE SUBRAMANYESWARA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1166',
          bankName: 'SREE THYAGARAJA COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1167',
          bankName: 'SREENIVASA PADMAVATHI COOPERATIVE BANK'
        },
        {
          bankId: '1168',
          bankName: 'SRI GANESH COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1169',
          bankName: 'SRI GAYATRI COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1170',
          bankName: 'SRI GOKARNATH COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1171',
          bankName: 'SRI POTTI SRI RAMULU NELLORE DISTRICT COOPERATIVE '
        },
        {
          bankId: '1172',
          bankName: 'SRI RAMA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1173',
          bankName: 'SRI SHARADA MAHILA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1174',
          bankName: 'SRI SUDHA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1175',
          bankName: 'SRI VASAVAMBA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1176',
          bankName: 'STANDARD CHARTERED BANK'
        },
        {
          bankId: '1177',
          bankName: 'STATE BANK OF INDIA'
        },
        {
          bankId: '1178',
          bankName: 'STATE BANK OF MAURITIUS LIMITED'
        },
        {
          bankId: '1179',
          bankName: 'SUMITOMO MITSUI BANKING CORPORATION'
        },
        {
          bankId: '1180',
          bankName: 'SURYODAY SMALL FINANCE BANK LIMITED'
        },
        {
          bankId: '1181',
          bankName: 'SUTEX COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1182',
          bankName: 'SUVARNA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1183',
          bankName: 'SYNDICATE BANK'
        },
        {
          bankId: '1184',
          bankName: 'TAMILNAD MERCANTILE BANK LIMITED'
        },
        {
          bankId: '1185',
          bankName: 'TAMLUK GHATAL CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1186',
          bankName: 'TARAPUR COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1187',
          bankName: 'TEACHERS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1188',
          bankName: 'TELANGANA STATE COOPERATIVE BANK APEX BANK'
        },
        {
          bankId: '1189',
          bankName: 'NIZAMABAD DISTRICT COOPERATIVE CENTRAL BANK LIMITE'
        },
        {
          bankId: '1190',
          bankName: 'TELANGANA GRAMEEN BANK'
        },
        {
          bankId: '1191',
          bankName: 'THA UTTARPARA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1192',
          bankName: 'THE  KHEDA  PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1193',
          bankName: 'THE A.P. MAHESH COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1194',
          bankName: 'THE ADARSH COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1195',
          bankName: 'THE ADILABAD DISTRICT COOPERATIVE CENTRAL BANK LIM'
        },
        {
          bankId: '1196',
          bankName: 'THE AGROHA COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1197',
          bankName: 'THE AKKI ALUR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1198',
          bankName: 'THE AKOLA DISTRICT CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '1199',
          bankName: 'THE ALLEPPEY URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1200',
          bankName: 'THE ALMEL URBAN COOPERATIVE BANK'
        },
        {
          bankId: '1201',
          bankName: 'THE ALNAVAR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1202',
          bankName: 'THE AMBALA CENTRAL COOPERATIVE  BANK LIMITED'
        },
        {
          bankId: '1203',
          bankName: 'THE AMRITSAR CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1204',
          bankName: 'THE ANAND MERCANTILE  COOPERATIVE BANK LIMITED, AX'
        },
        {
          bankId: '1205',
          bankName: 'THE ANDHRA PRADESH STATE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1206',
          bankName: 'THE GUNTUR DIST COOPERATIVE CENTRAL BANK LIMITED '
        },
        {
          bankId: '1207',
          bankName: 'THE KRISHNA DISTRICT COOPERATIVE CENTRAL BANK LIMI'
        },
        {
          bankId: '1208',
          bankName: 'THE DISTRICT COOPERATIVE CENTRAL BANK '
        },
        {
          bankId: '1209',
          bankName: 'THE ARSIKERE URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1210',
          bankName: 'THE BAGALKOT COOPERATIVE BANK'
        },
        {
          bankId: '1211',
          bankName: 'THE BAILHONGAL MERCHANTS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1212',
          bankName: 'THE BANK OF NOVA SCOTIA'
        },
        {
          bankId: '1213',
          bankName: 'THE BAPUNAGAR MAHILA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1214',
          bankName: 'THE BARODA CITY COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1215',
          bankName: 'THE BARODA TRADERS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1216',
          bankName: 'THE BATHINDA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1217',
          bankName: 'THE BEGUSARAI DISTRICT CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '1218',
          bankName: 'THE BELLARY DISTRICT CENTRAL COOPERATIVE BANK LIMI'
        },
        {
          bankId: '1219',
          bankName: 'THE BERHAMPORE COOPERATIVE CENTRAL BANK LIMITED'
        },
        {
          bankId: '1220',
          bankName: 'THE BHAGALPUR CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '1221',
          bankName: 'THE BHAGAT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1222',
          bankName: 'THE BHARAT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1223',
          bankName: 'THE BHATKAL URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1224',
          bankName: 'THE BHAWANIPATNA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1225',
          bankName: 'THE BHIWANI CENTRAL COOPERATIVE  BANK LIMITED'
        },
        {
          bankId: '1226',
          bankName: 'THE BIJNOR URBAN COOPERATIVE BANK'
        },
        {
          bankId: '1227',
          bankName: 'THE BISHNUPUR TOWN COOPERATIVE BANK'
        },
        {
          bankId: '1228',
          bankName: 'THE BODELI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1229',
          bankName: 'THE BOTAD PEOPLE S COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1230',
          bankName: 'THE CALICUT COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1231',
          bankName: 'THE CHANDIGARH STATE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1232',
          bankName: 'THE CHANGANACHERRY COOPERATIVE URBAN BANK  LIMITED'
        },
        {
          bankId: '1233',
          bankName: 'THE CHENNAI CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1234',
          bankName: 'THE CHERPALCHERI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1235',
          bankName: 'THE CKP COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1236',
          bankName: 'THE COASTAL URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1237',
          bankName: 'THE COIMBATORE DISTRICT CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1238',
          bankName: 'THE COOPERATIVE BANK OF MEHSANA LIMITED '
        },
        {
          bankId: '1239',
          bankName: 'THE COOPERATIVE CITY BANK LIMITED'
        },
        {
          bankId: '1240',
          bankName: 'THE COSMOS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1241',
          bankName: 'THE CUDDALORE DISTRICT CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1242',
          bankName: 'THE DECCAN MERCHANTS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1243',
          bankName: 'THE DELHI STATE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1244',
          bankName: 'THE DEOLA MERCHANT S COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1245',
          bankName: 'THE DHANBAD CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1246',
          bankName: 'THE DHARMAJ PEOPLES  COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1247',
          bankName: 'THE DHARMAPURI DISTRICT CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1248',
          bankName: 'THE DHOLPUR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1249',
          bankName: 'THE DHRANGADHRA PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1250',
          bankName: 'THE DINDIGUL CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1252',
          bankName: 'THE DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1253',
          bankName: 'THE DURGA COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1254',
          bankName: 'THE ERNAKULAM DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1255',
          bankName: 'THE ERODE DISTRICT CENTRAL COOPERATIVE BANK LIMITE'
        },
        {
          bankId: '1256',
          bankName: 'THE FARIDABAD CENTRAL  COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1257',
          bankName: 'THE FARIDKOT CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1258',
          bankName: 'THE FATEHABAD CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1259',
          bankName: 'THE FATEHGARH SAHIB CENTRAL COOPERATIVE  BANK LIMI'
        },
        {
          bankId: '1260',
          bankName: 'THE FAZILKA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1261',
          bankName: 'THE FEROKE COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1262',
          bankName: 'THE FEROZEPUR CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1263',
          bankName: 'THE GADCHIROLI DISTRICT CENTRAL COOPERATIVE BANK L'
        },
        {
          bankId: '1264',
          bankName: 'THE GADHINGLAJ URBAN COOPERATIVE BANK'
        },
        {
          bankId: '1265',
          bankName: 'THE GANDHI GUNJ COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1266',
          bankName: 'THE GANDHIDHAM COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1267',
          bankName: 'THE GANGA MERCANTILE URBAN COOPERATIVE BANK LIMITE'
        },
        {
          bankId: '1268',
          bankName: 'THE GAUHATI COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1269',
          bankName: 'THE GODHRA CITY COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1270',
          bankName: 'THE GODHRA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1271',
          bankName: 'THE GOKAK URBAN COOPERATIVE CREDIT BANK LIMITED'
        },
        {
          bankId: '1272',
          bankName: 'THE GOPALGANJ CENTRAL GOPALGANJ COOPERATIVE BANK L'
        },
        {
          bankId: '1273',
          bankName: 'THE GREATER BOMBAY COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1274',
          bankName: 'VALSAD DISRICT CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1275',
          bankName: 'THE VADALI NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1276',
          bankName: 'VADNAGAR NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1277',
          bankName: 'SHREE VIRPUR URBAN SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1278',
          bankName: 'THE VIRAMGAM MERCANTILE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1279',
          bankName: 'THE VEPAR UDHYOG VIKAS SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1280',
          bankName: 'THE UNAVA NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1281',
          bankName: 'UNJHA NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1282',
          bankName: 'THE UNA PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1283',
          bankName: 'THE VIJAPUR NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1284',
          bankName: 'THE SARVODAYA NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1285',
          bankName: 'THE PATDI NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1286',
          bankName: 'THE PRAGATI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1287',
          bankName: 'THE TALOD NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1288',
          bankName: 'THE MANDVI NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1289',
          bankName: 'THE KARJAN NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1290',
          bankName: 'THE KHERALU NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1291',
          bankName: 'THE HANSOT NAGARIC SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1292',
          bankName: 'THE BECHRAJI NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1293',
          bankName: 'THE BARDOLI  NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1294',
          bankName: 'THE SALAL SARVODAY NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1295',
          bankName: 'SARASPUR NAGARIK COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1296',
          bankName: 'SHREE MORBI NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1297',
          bankName: 'THE SARDAR GUNJ MERC COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1298',
          bankName: 'SHRI JANATA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1299',
          bankName: 'SHIHORI NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1300',
          bankName: 'SARDARGUNJ MERCANTILE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1301',
          bankName: 'SHREE BHAVNAGAR NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1302',
          bankName: 'SHREE SAVLI  NAGRIK SAHAKARI  BANK LIMITED'
        },
        {
          bankId: '1303',
          bankName: 'SHREE SAVARKUNDLA NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1304',
          bankName: 'THE RAJPIPLA  NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1305',
          bankName: 'THE RANDHEJA COMMERCIAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1306',
          bankName: 'THE RAJULA NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1307',
          bankName: 'THE PADRA NAGAR NAG SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1308',
          bankName: 'THE GUJARAT STATE CO-OPERATIVE BANK LTD'
        },
        {
          bankId: '1309',
          bankName: 'THE PIJ  PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1310',
          bankName: 'PATAN NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1311',
          bankName: 'THE ODE URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1312',
          bankName: 'THE MANDAL NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1313',
          bankName: 'THE MEGHRAJ NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1314',
          bankName: 'THE MEHSANA JILLA PANCHAYAT KARMACHARI COOPERATIVE'
        },
        {
          bankId: '1315',
          bankName: 'MARKETYARD COMM COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1316',
          bankName: 'THE MANSA NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1317',
          bankName: 'THE MALPUR NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1318',
          bankName: 'THE MAHILA VIKAS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1319',
          bankName: 'THE LIMBASI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1320',
          bankName: 'SHREE LODRA NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1321',
          bankName: 'SHRI LAXMI MAHILA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1322',
          bankName: 'THE LAKHWAD NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1323',
          bankName: 'THE KHAMBHAT NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1324',
          bankName: 'THE KOSAMBA  MERC COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1325',
          bankName: 'THE JAMBUSAR PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1326',
          bankName: 'THE JAMNAGAR MAHILA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1327',
          bankName: 'THE IDAR NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1328',
          bankName: 'THE HARIJ NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1329',
          bankName: 'THE HALOL URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1330',
          bankName: 'THE GHOGHAMBA  VIBHAG NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1331',
          bankName: 'THE GANDHIDHAM MERCANTILE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1333',
          bankName: 'THE DHINOJ  NAGARIK SAHAKARI  BANK LIMITED'
        },
        {
          bankId: '1334',
          bankName: 'THE CHHAPI NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1335',
          bankName: 'THE CHANASMA NAGARIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1336',
          bankName: 'THE CHANASMA COMM COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1337',
          bankName: 'SHREE BOTAD MERCANTILE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1338',
          bankName: 'THE BHABHAR VIBHAG NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1339',
          bankName: 'THE AMOD NAGRIC COOPEARATIVE BANK LIMITED, GUJRAT'
        },
        {
          bankId: '1340',
          bankName: 'SURENDRANAGAR DISTRICT CENTRAL COOPERATIVE BANK LI'
        },
        {
          bankId: '1341',
          bankName: 'SABARKANTHA DISTRICT CENTRAL COOPERATIVE BANK LIMI'
        },
        {
          bankId: '1342',
          bankName: 'RAJKOT DISTRICT CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1343',
          bankName: 'PANCHMAHAL DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1344',
          bankName: 'MEHSANA DISTRICT CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1345',
          bankName: 'KATCH DISTRICT CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1346',
          bankName: 'KODINAR TALUKA COOPERATIVE BANKING UNION LIMITED '
        },
        {
          bankId: '1347',
          bankName: 'JUNAGADH JILLA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1348',
          bankName: 'JAMNAGAR DISTRICT CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1349',
          bankName: 'THE GUJARAT RAJYA KARMACHARI COOPERATIVE BANK LIMI'
        },
        {
          bankId: '1350',
          bankName: 'BHAVNAGAR DISTRICT CENTRAL COOPERATIVE BANK LIMITE'
        },
        {
          bankId: '1351',
          bankName: 'BARODA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1352',
          bankName: 'BHARUCH DISTRICT CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1353',
          bankName: 'BANASKANTHA DISTRICT CENTRAL COOPERATIVE BANK LIMI'
        },
        {
          bankId: '1354',
          bankName: 'AMRELI JILLA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1355',
          bankName: 'THE GUJARAT STATE CO-OPERATIVE BANK LTD'
        },
        {
          bankId: '1357',
          bankName: 'THE GURDASPUR CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1358',
          bankName: 'THE GURGAON CENTRAL  COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1359',
          bankName: 'THE HARYANA STATE COOPERATIVE  APEX BANK LIMITED'
        },
        {
          bankId: '1360',
          bankName: 'THE HAVERI URBAN COOPERATIVE BANK'
        },
        {
          bankId: '1361',
          bankName: 'THE HAVERI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1362',
          bankName: 'THE HAZARIBAG CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1363',
          bankName: 'THE HINDU COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1364',
          bankName: 'THE HIRIYUR URBAN COOPERATIVE BANK'
        },
        {
          bankId: '1365',
          bankName: 'THE HISAR CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1366',
          bankName: 'THE HISAR URBAN COOPERATIVE BANK'
        },
        {
          bankId: '1367',
          bankName: 'THE HONAVAR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1368',
          bankName: 'THE HOOGHLY COOPERATIVE CREDIT BANK LIMITED'
        },
        {
          bankId: '1369',
          bankName: 'THE HOSHIARPUR CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1370',
          bankName: 'THE HYDERABAD DISTRICT COOPERATIVE CENTRAL BANK LI'
        },
        {
          bankId: '1371',
          bankName: 'THE INNESPETA  COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1372',
          bankName: 'THE JAGRUTI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1373',
          bankName: 'THE JAIN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1374',
          bankName: 'THE JAIPUR CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1375',
          bankName: 'THE JALANDHAR CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1376',
          bankName: 'THE JALGAON DISTRICT CENTRAL COOPERATIVE BANK LIMI'
        },
        {
          bankId: '1377',
          bankName: 'THE JALGAON PEOPELS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1378',
          bankName: 'THE JAMKHANDI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1379',
          bankName: 'THE JANATHA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1380',
          bankName: 'THE JHAJJAR CENTRAL COOPERATIVE  BANK LIMITED'
        },
        {
          bankId: '1381',
          bankName: 'THE JHALOD URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1382',
          bankName: 'THE JIND CENTRAL COOPERATIVE  BANK LIMITED'
        },
        {
          bankId: '1383',
          bankName: 'THE JOWAI COOPERATIVE URBAN BANK'
        },
        {
          bankId: '1384',
          bankName: 'THE JOWAI COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1385',
          bankName: 'THE KAITHAL CENTRAL COOPERATIVE  BANK LIMITED'
        },
        {
          bankId: '1386',
          bankName: 'THE KAKATIYA COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1387',
          bankName: 'THE KANAKAMAHALAKSHMI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1388',
          bankName: 'THE KANCHIPURAM CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1389',
          bankName: 'THE KANGRA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1390',
          bankName: 'THE KANGRA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1391',
          bankName: 'THE KANNUR COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1392',
          bankName: 'THE KANYAKUMARI DISTRICT CENTRAL COOPERATIVE BANK '
        },
        {
          bankId: '1393',
          bankName: 'THE KARAD URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1394',
          bankName: 'BAGALKOT DISTRICT CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '1395',
          bankName: 'DAVANAGERE CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1396',
          bankName: 'THE BALLARI DISTRICT COOPERATIVE CENTRAL BANK LIMI'
        },
        {
          bankId: '1397',
          bankName: 'THE DISTRICT COOPERATIVE CENTRAL BANK LIMITED '
        },
        {
          bankId: '1398',
          bankName: 'GULBARGA YADAGIR COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1399',
          bankName: 'KANARA DISTRICT CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '1400',
          bankName: 'KARNATAKA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1401',
          bankName: 'BIJAPUR COOPERATIVE CENTRAL BANK LIMITED'
        },
        {
          bankId: '1402',
          bankName: 'CHIKMAGALUR DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1403',
          bankName: 'KODAGU CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1404',
          bankName: 'MANDYA DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1405',
          bankName: 'MYSORE CHAMARAJANAGAR COOPERATIVE BANK'
        },
        {
          bankId: '1406',
          bankName: 'TUMKUR DCC BANK LIMITED'
        },
        {
          bankId: '1407',
          bankName: 'TUMKUR DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1408',
          bankName: 'SHIMOGA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1409',
          bankName: 'CHITRADURGA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1410',
          bankName: 'KOLAR CHIKKABALLAPUR COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1411',
          bankName: 'BANGALORE RURAL RAMANAGAR COOPERATIVE BANK'
        },
        {
          bankId: '1412',
          bankName: 'THE KARANATAKA STATE COOPERATIVE APEX BANK LIMITED'
        },
        {
          bankId: '1413',
          bankName: 'THE KARIMNAGAR DISTRICT COOPERATIVE CENTRAL BANK L'
        },
        {
          bankId: '1414',
          bankName: 'THE KARNAL CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1415',
          bankName: 'THE KARNATAKA COOPERATIVE BANK LIMITED,'
        },
        {
          bankId: '1416',
          bankName: 'THE KARWAR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1417',
          bankName: 'THE KASARAGOD COOPERATIVE TOWN BANK LIMITED'
        },
        {
          bankId: '1418',
          bankName: 'THE KASARAGOD DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1419',
          bankName: 'THE KERALA MERCANTILE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1420',
          bankName: 'THE KERALA STATE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1421',
          bankName: 'THE KHAMMAM DISTRICT COOPERATIVE CENTRAL BANK LIMI'
        },
        {
          bankId: '1422',
          bankName: 'THE KODUNGALLUR TOWN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1423',
          bankName: 'THE KOZHIKODE DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1424',
          bankName: 'THE KUMBAKONAM CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1425',
          bankName: 'THE KUMTA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1426',
          bankName: 'THE KURMANCHAL NAGAR SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1427',
          bankName: 'THE KURUKSHETRA CENTRAL  COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1428',
          bankName: 'THE LAXMI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1429',
          bankName: 'THE LAXMI URBAN COOPERATIVE BANK'
        },
        {
          bankId: '1430',
          bankName: 'THE LIMDI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1431',
          bankName: 'THE LUDHIANA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1432',
          bankName: 'THE MADURAI DISTRICT CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1433',
          bankName: 'THE MAHABOOBNAGAR DISTRICT COOPERATIVE CENTRAL BAN'
        },
        {
          bankId: '1434',
          bankName: 'THE MAHANAGAR COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1435',
          bankName: 'THE MALEGAON MERCHANT S COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1436',
          bankName: 'THE MANDYA CITY COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1437',
          bankName: 'THE MANGALORE CATHOLIC COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1438',
          bankName: 'THE MANGALORE COOPERATIVE TOWN BANK LIMITED'
        },
        {
          bankId: '1439',
          bankName: 'THE MANMANDIR COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1440',
          bankName: 'THE MANSA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1441',
          bankName: 'THE MATTANCHERRY MAHAJANIK COOPERATIVE BANK LIMITE'
        },
        {
          bankId: '1442',
          bankName: 'THE MATTANCHERRY SARVAJANIK COOPERATIVE BANK LIMIT'
        },
        {
          bankId: '1443',
          bankName: 'THE MEDAK DISTRICT COOPERATIVE CENTRAL BANK LIMITE'
        },
        {
          bankId: '1444',
          bankName: 'THE MEHMADABAD URBAN PEOPLES COOPERATIVE BANK LIMI'
        },
        {
          bankId: '1445',
          bankName: 'THE MEHSANA URBAN COOPERATIVE BANK'
        },
        {
          bankId: '1446',
          bankName: 'THE MODA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1447',
          bankName: 'THE MODEL COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1448',
          bankName: 'THE MOTIHARI CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1449',
          bankName: 'THE MUDALAGI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1450',
          bankName: 'THE MUKTSAR CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1451',
          bankName: 'PRATAP COOPERATIVE BANK '
        },
        {
          bankId: '1453',
          bankName: 'R S COOPERATIVE BANK '
        },
        {
          bankId: '1454',
          bankName: 'RAMESHWAR COOPERATIVE BANK '
        },
        {
          bankId: '1455',
          bankName: 'THE MUMBAI DISTRICT CENTRAL COOPERATIVE BANK LIMIT'
        },
        {
          bankId: '1456',
          bankName: 'STATE TRANSPORT BANK MUMBAI CENTRAL'
        },
        {
          bankId: '1457',
          bankName: 'THE MUNICIPAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1458',
          bankName: 'THE MUVATTUPUZHA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1459',
          bankName: 'THE NABAPALLI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1460',
          bankName: 'THE NAINITAL BANK LIMITED'
        },
        {
          bankId: '1461',
          bankName: 'THE NALGONDA DISTRICT COOPERATIVE CENTRAL BANK LIM'
        },
        {
          bankId: '1462',
          bankName: 'THE NASIK MERCHANTS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1464',
          bankName: 'THE NATIONAL COOPERATIVE BANK'
        },
        {
          bankId: '1465',
          bankName: 'THE NAVAL DOCKYARD COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1466',
          bankName: 'THE NAVNIRMAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1467',
          bankName: 'THE NAWANAGAR COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1468',
          bankName: 'THE NAWANSHAHR CENTRAL COOPERATIVE  BANK LIMITED'
        },
        {
          bankId: '1469',
          bankName: 'THE NEW AGRA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1470',
          bankName: 'THE NILAMBUR COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1471',
          bankName: 'THE NILGIRIS DISTRICT CENTRAL COOPERATIVE BANK LIM'
        },
        {
          bankId: '1472',
          bankName: 'THE NIZAMABAD DISTRICT COOPERATIVE APEX CENTRAL BA'
        },
        {
          bankId: '1473',
          bankName: 'THE OTTAPALAM COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1474',
          bankName: 'THE PALAMOOR COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1475',
          bankName: 'THE PANCHKULA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1476',
          bankName: 'THE PANCHKULA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1477',
          bankName: 'THE PANDHARPUR URBAN COOPERATIVE  BANK LIMITED PAN'
        },
        {
          bankId: '1478',
          bankName: 'THE PANIHATI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1479',
          bankName: 'THE PANIPAT CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1480',
          bankName: 'THE PATHANAMTHITTA DISTRICT COOPERATIVE BANK LIMIT'
        },
        {
          bankId: '1481',
          bankName: 'THE PATIALA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1482',
          bankName: 'THE PAYYOLI COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1483',
          bankName: 'THE PEOPLE S URBAN COOPERATIVE BANK,'
        },
        {
          bankId: '1484',
          bankName: 'THE PIONEER URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1485',
          bankName: 'THE PUDUKKOTTAI DISTRICT CENTRAL COOPERATIVE BANK '
        },
        {
          bankId: '1486',
          bankName: 'THE PURNIA DISTRICT CENTRAL COOPERATIVE BANK LIMIT'
        },
        {
          bankId: '1487',
          bankName: 'THE RAIGAD DISTRICT CENTRAL COOPERATIVE BANK LIMIT'
        },
        {
          bankId: '1488',
          bankName: 'THE RAILWAY COOPERATIVE BANK LIMITED, MYSORE'
        },
        {
          bankId: '1489',
          bankName: 'BARAN KENDRIYA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1490',
          bankName: 'HANUMANGARH KENDRIYA SAHAKARI BANK'
        },
        {
          bankId: '1491',
          bankName: 'DAUSA KENDRIYA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1492',
          bankName: 'THE RAJASTHAN STATE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1493',
          bankName: 'THE JAISALMER CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1494',
          bankName: 'THE UDAIPUR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1495',
          bankName: 'THE CENTARAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1496',
          bankName: 'THE GANGANAGAR KENDRIYA SAHAKARI BANK'
        },
        {
          bankId: '1497',
          bankName: 'NEW DHAN MANDI RAI SINGH NAGAR SAHAKARI BANK '
        },
        {
          bankId: '1498',
          bankName: 'THE SIROHI CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1499',
          bankName: 'SIKAR KENDRIYA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1500',
          bankName: 'SAWAI MADHOPUR KENDRIYA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1501',
          bankName: 'THE PALI CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1502',
          bankName: 'THE NAGAUR CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1503',
          bankName: 'THE KOTA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1504',
          bankName: 'THE JODHPUR CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1505',
          bankName: 'JHUNJHUNU KENDRIYA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1506',
          bankName: 'JHALAWAR KENDRIYA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1507',
          bankName: 'THE JALORE CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1508',
          bankName: 'THE DUNGARPUR CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1509',
          bankName: 'THE CHURU CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1510',
          bankName: 'CHITTORGARH CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1511',
          bankName: 'THE BUNDI CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1512',
          bankName: 'THE CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1513',
          bankName: 'THE BHARATPUR CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1514',
          bankName: 'THE BARMER CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1515',
          bankName: 'THE BANSWARA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1516',
          bankName: 'THE ALWAR CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1517',
          bankName: 'AJMER CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1518',
          bankName: 'THE RAJASTHAN URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1519',
          bankName: 'THE RAJKOT COMMERCIAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1520',
          bankName: 'THE RAMANATHAPURAM DISTRICT CENTRAL COOPERATIVE BA'
        },
        {
          bankId: '1521',
          bankName: 'THE RANCHI KHUNTI CENTRAL  COOPERATIVE BANK LIMITE'
        },
        {
          bankId: '1522',
          bankName: 'THE RAVER PEOPLES CO -OPERATIVE BANK LIMITED'
        },
        {
          bankId: '1523',
          bankName: 'THE RAYAT SEVAK COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1524',
          bankName: 'THE REWARI CENTRAL  COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1525',
          bankName: 'THE ROHTAK CENTRAL COOPERATIVE  BANK LIMITED'
        },
        {
          bankId: '1526',
          bankName: 'THE ROPAR CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1527',
          bankName: 'THE ROYAL BANK OF SCOTLAND N V'
        },
        {
          bankId: '1528',
          bankName: 'THE SALEM DISTRICT CENTRAL COOPERATIVE BANK LIMITE'
        },
        {
          bankId: '1529',
          bankName: 'THE SALUR COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1530',
          bankName: 'THE SAMASTIPUR DISTRICT CENTRAL COOPERATIVE BANK L'
        },
        {
          bankId: '1531',
          bankName: 'THE SANGRUR CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1532',
          bankName: 'THE SANTRAGACHI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1533',
          bankName: 'THE SANTRAMPUR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1534',
          bankName: 'THE SARANGPUR COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1535',
          bankName: 'THE SARSA PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1536',
          bankName: 'THE SAS NAGAR CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1537',
          bankName: 'THE SATARA DISTRICT CENTRAL COOPERATIVE BANK LIMIT'
        },
        {
          bankId: '1538',
          bankName: 'THE SAURASHTRA COOPERATIVE  BANK LIMITED'
        },
        {
          bankId: '1539',
          bankName: 'THE SAURASHTRA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1540',
          bankName: 'THE SEVA VIKAS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1541',
          bankName: 'KRISHNA PATTANA SAHAKAR BANK NIYAMITHA'
        },
        {
          bankId: '1542',
          bankName: 'BHINGAR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1543',
          bankName: 'THE KOVVUR COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1544',
          bankName: 'APPASAHEB BIRNALE SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1545',
          bankName: 'THE AMBIKA MAHILA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1546',
          bankName: 'THE GOOTY COOPERATIVE TOWN BANK LIMITED'
        },
        {
          bankId: '1547',
          bankName: 'THE ARYA VAISHYA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1548',
          bankName: 'SRI SATYA SAI NAGARIK SAHAKARI BANK'
        },
        {
          bankId: '1549',
          bankName: 'SREE MAHAYOGI LAKSHAMMA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1550',
          bankName: 'GAUTAM SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1551',
          bankName: 'THE SHALINI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1552',
          bankName: 'SRI GANAPATHI URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1553',
          bankName: 'JANATA SAHAKARI BANK LIMITED AMRAVATI'
        },
        {
          bankId: '1554',
          bankName: 'THE REVDANDA COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1555',
          bankName: 'THE HOTEL INDUSTRIALISTS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1556',
          bankName: 'PADMASHREE DR. VITTHALRAO VIKHE PATIL COOPERATIVE '
        },
        {
          bankId: '1557',
          bankName: 'THE KALWAN MERCHANTS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1558',
          bankName: 'SHRI KRISHNA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1559',
          bankName: 'THE LASALGAON MERCHANTS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1560',
          bankName: 'THE KOPARGAON PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1561',
          bankName: 'THE ANANTHPUR COOPERATIVE TOWN BANK  '
        },
        {
          bankId: '1562',
          bankName: 'THE HUBLI URBAN COOPERATIVE BANK '
        },
        {
          bankId: '1563',
          bankName: 'THE SHAMRAO VITHAL COOPERATIVE BANK'
        },
        {
          bankId: '1564',
          bankName: 'MYSORE MERCH COOPERATIVE BANK'
        },
        {
          bankId: '1565',
          bankName: 'SHRI GANESH SAHAKARI BANK'
        },
        {
          bankId: '1566',
          bankName: 'SAHYADRI  SAHAKARI BANK'
        },
        {
          bankId: '1567',
          bankName: 'BHARATI SAHAKARI BANK'
        },
        {
          bankId: '1568',
          bankName: 'CHIPLUN URBAN BANK'
        },
        {
          bankId: '1569',
          bankName: 'PUNE URBAN BANK'
        },
        {
          bankId: '1570',
          bankName: 'VIDYA BANK'
        },
        {
          bankId: '1571',
          bankName: 'GUARDIAN BANK'
        },
        {
          bankId: '1572',
          bankName: 'THE SHIBPUR COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1573',
          bankName: 'THE SHORANUR COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1574',
          bankName: 'THE SINDHUDURG DISTRICT CENTRAL COOPERATIVE BANK L'
        },
        {
          bankId: '1575',
          bankName: 'THE SINGHBHUM DISTRICT CENTRAL COOPERATIVE BANK LI'
        },
        {
          bankId: '1576',
          bankName: 'THE SIRSA CENTRAL COOPERATIVE  BANK LIMITED'
        },
        {
          bankId: '1577',
          bankName: 'THE SIVAGANGAI DISTRICT CENTRAL COOPERATIVE BANK L'
        },
        {
          bankId: '1578',
          bankName: 'SIWAN CNETRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1579',
          bankName: 'THE SOLAPUR DISTRICT CENTRAL COOPERATIVE BANK LIMI'
        },
        {
          bankId: '1580',
          bankName: 'THE SONEPAT URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1581',
          bankName: 'THE SOUTH CANARA DISTRICT CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '1582',
          bankName: 'THE SULTAN S BATTERY COOPERATIVE URBAN BANK'
        },
        {
          bankId: '1583',
          bankName: 'THE SULTAN?S BATTERY COOPERATIVE URBAN BANK LIMITE'
        },
        {
          bankId: '1584',
          bankName: 'THE SURAT DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1585',
          bankName: 'THE SURATH PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1586',
          bankName: 'THE SUVIKAS PEOPLES COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1587',
          bankName: 'THE SWASAKTHI MERCANTILE COOPERATIVE URBAN BANK LI'
        },
        {
          bankId: '1588',
          bankName: 'THE TAMIL NADU STATE APEX COOPERATIVE BANK'
        },
        {
          bankId: '1589',
          bankName: 'THE TAMILNADU INDUSTRIAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1590',
          bankName: 'THE TARN TARAN CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1591',
          bankName: 'THE THANE BHARAT SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1592',
          bankName: 'THE THANE DISTRICT CENTRAL COOPERATIVE BANK LIMITE'
        },
        {
          bankId: '1593',
          bankName: 'THE THANJAVUR CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1594',
          bankName: 'THE THIRUVANANTHAPURAM DISTRICT COOPERATIVE BANK L'
        },
        {
          bankId: '1595',
          bankName: 'THE THOOTHUKUDI DISTRICT CENTRAL COOPERATIVE BANK '
        },
        {
          bankId: '1596',
          bankName: 'THE THRISSUR DISTRICT  COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1597',
          bankName: 'THE TIRUCHIRAPALLI DISTRICT CENTRAL COOPERATIVE BANK LTD'
        },
        {
          bankId: '1598',
          bankName: 'THE TIRUNELVELI DISTRICT CENTRAL COOPERATIVE BANK '
        },
        {
          bankId: '1599',
          bankName: 'THE TIRUPATI COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1600',
          bankName: 'THE TIRUR URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1601',
          bankName: 'THE TIRUVALLA EAST COOPERATIVE BANK '
        },
        {
          bankId: '1602',
          bankName: 'THE TIRUVANNAMALAI DISTRICT CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '1603',
          bankName: 'THE TOWN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1604',
          bankName: 'THE TRIVANDRUM COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1605',
          bankName: 'THE UDUPI COOPERATIVE TOWN BANK'
        },
        {
          bankId: '1606',
          bankName: 'THE UMRETH URBAN COOPERATIVE BANK'
        },
        {
          bankId: '1607',
          bankName: 'THE UNA PEOPLES COOPERATIVE BANK'
        },
        {
          bankId: '1608',
          bankName: 'THE UNION COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1609',
          bankName: 'THE UNITED COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1610',
          bankName: 'THE UTTARPARA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1611',
          bankName: 'THE VAISHALI DISTRICT CENTRAL COOPERATIVE BANK LIM'
        },
        {
          bankId: '1612',
          bankName: 'THE VARACHHA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1613',
          bankName: 'THE VARDHMAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1614',
          bankName: 'THE VELLORE DISTRICT CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1615',
          bankName: 'THE VIJAY COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1616',
          bankName: 'THE VILLUPURAM DISTRICT CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1617',
          bankName: 'THE VIRUDHUNAGAR DISTRICT CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '1618',
          bankName: 'THE VISHWESHWAR SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1619',
          bankName: 'THE VSV COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1620',
          bankName: 'THE WAGHODIYA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1621',
          bankName: 'THE WARANGAL DISTRICT COOPERATIVE CENTRAL BANK LIM'
        },
        {
          bankId: '1622',
          bankName: 'THE WEST BENGAL STATE COOPERATIVE BANK'
        },
        {
          bankId: '1623',
          bankName: 'T G C COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '1624',
          bankName: 'MAHILA COOPERATIVE BANK'
        },
        {
          bankId: '1625',
          bankName: 'MURSHIDABAD DIST CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '1626',
          bankName: 'J C COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '1627',
          bankName: 'THE JALPAIGURI CTRL BANK '
        },
        {
          bankId: '1628',
          bankName: 'THE HOWRAH DISTRICT CENTRAL CO-OPERTAIVE BANK LIMI'
        },
        {
          bankId: '1629',
          bankName: 'BHATPARA NAIHATI COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '1630',
          bankName: 'THE YAMUNA NAGAR CENTRAL CO  OPERATIVE BANK LIMITE'
        },
        {
          bankId: '1631',
          bankName: 'THE ZOROASTRIAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1632',
          bankName: 'TJSB SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1633',
          bankName: 'TRIPURA GRAMIN BANK'
        },
        {
          bankId: '1634',
          bankName: 'TRIPURA STATE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1635',
          bankName: 'TUMKUR GRAIN MERCHANTS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1636',
          bankName: 'TUMKUR VEERASHAIVA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1637',
          bankName: 'UCO BANK'
        },
        {
          bankId: '1638',
          bankName: 'UDGIR URBAN COOPERATIVE BANK'
        },
        {
          bankId: '1639',
          bankName: 'UDHAM SINGH NAGAR DISTRICT COOPERATIVE BANK LIMITE'
        },
        {
          bankId: '1640',
          bankName: 'Ujjivan Small Finance Bank Limited'
        },
        {
          bankId: '1641',
          bankName: 'UMA COOPERATIVE BANK'
        },
        {
          bankId: '1642',
          bankName: 'UNION BANK OF INDIA'
        },
        {
          bankId: '1643',
          bankName: 'UNITED BANK OF INDIA'
        },
        {
          bankId: '1644',
          bankName: 'UNITED INDIA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1645',
          bankName: 'UNITED OVERSEAS BANK LIMITED'
        },
        {
          bankId: '1646',
          bankName: 'UTKARSH SMALL FINANCE BANK'
        },
        {
          bankId: '1647',
          bankName: 'UTTAR BANGA KSHETRIYA GRAMIN BANK'
        },
        {
          bankId: '1648',
          bankName: 'UTTAR BIHAR GRAMIN BANK'
        },
        {
          bankId: '1649',
          bankName: 'UTTAR PRADESH COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1650',
          bankName: 'UTTAR PRADESH STATE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1651',
          bankName: 'UTTARANCHAL GRAMIN BANK'
        },
        {
          bankId: '1652',
          bankName: 'UTTRAKHAND COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1653',
          bankName: 'UTTRAKHAND STATE CO-COPERATIVE BANK LIMITED'
        },
        {
          bankId: '1654',
          bankName: 'VANANCHAL GRAMIN BANK'
        },
        {
          bankId: '1655',
          bankName: 'VASAI VIKAS SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1656',
          bankName: 'VIDHARBHA KONKAN GRAMIN BANK LIMITED'
        },
        {
          bankId: '1658',
          bankName: 'VIJAYA BANK'
        },
        {
          bankId: '1659',
          bankName: 'VIKAS COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1660',
          bankName: 'VIKAS URBAN COOPERATIVE BANK'
        },
        {
          bankId: '1661',
          bankName: 'VISL EMPLOYEES COOPERATIVE BANK'
        },
        {
          bankId: '1662',
          bankName: 'VYSYA COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1663',
          bankName: 'WARDHAMAN URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1664',
          bankName: 'WESTPAC BANKING CORPORATION'
        },
        {
          bankId: '1665',
          bankName: 'WOORI BANK'
        },
        {
          bankId: '1666',
          bankName: 'YADRAV COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1667',
          bankName: 'ZILA SAHAKARI BANK, YES BANK'
        },
        {
          bankId: '1668',
          bankName: 'YES BANK'
        },
        {
          bankId: '1669',
          bankName: 'YLNS COOPERATIVE URBAN BANK '
        },
        {
          bankId: '1670',
          bankName: 'YADAGIRI LNS COOPERATIVE BANK '
        },
        {
          bankId: '1671',
          bankName: 'THE YAVATMAL DCC BANK '
        },
        {
          bankId: '1673',
          bankName: 'WARDHA NAGRI BANK '
        },
        {
          bankId: '1674',
          bankName: 'WANA NAGRI SAHAKARI BANK '
        },
        {
          bankId: '1675',
          bankName: 'WANA NAGARIK SAHAKARI BANK '
        },
        {
          bankId: '1676',
          bankName: 'VYAVSAYIK SAHAKARI BANK '
        },
        {
          bankId: '1677',
          bankName: 'VIKRAMADITYA NAGRIK SAHAKARI BANK'
        },
        {
          bankId: '1678',
          bankName: 'THE VAISH COOPERATIVE NEW BANK '
        },
        {
          bankId: '1679',
          bankName: 'VAIJAPUR MERCHANTS BANK '
        },
        {
          bankId: '1680',
          bankName: 'VIMA KAMGAR COOPERATIVE BANK '
        },
        {
          bankId: '1681',
          bankName: 'VISHWAKARMA SAHAKARI BANK '
        },
        {
          bankId: '1682',
          bankName: 'VASANTDADA NAGARI SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1683',
          bankName: 'VAISH COOPERATIVE ADARSH BANK '
        },
        {
          bankId: '1684',
          bankName: 'VYAPARIK AUDYOGIK SAHAKARI BANK '
        },
        {
          bankId: '1685',
          bankName: 'UJJAIN PARASPAR SAHAKARI BANK '
        },
        {
          bankId: '1686',
          bankName: 'UJJAIN NAGRIK SAHAKARI BANK '
        },
        {
          bankId: '1687',
          bankName: 'UMIYA URBAN COOPERATIVE BANK '
        },
        {
          bankId: '1688',
          bankName: 'UMIYA URBAN COOPERATIVE BANK'
        },
        {
          bankId: '1689',
          bankName: 'UNITED MERC COOPERATIVE BANK '
        },
        {
          bankId: '1690',
          bankName: 'THE URBAN COOPERATIVE BANK '
        },
        {
          bankId: '1691',
          bankName: 'THE UNITED COOPERATIVE BANK '
        },
        {
          bankId: '1692',
          bankName: 'UJJAIN AUDHYOGIK VIKAS NAGRIK BANK'
        },
        {
          bankId: '1693',
          bankName: 'THE TURA URBAN COOPERATIVE BANK '
        },
        {
          bankId: '1694',
          bankName: 'THE SATARA SAHAKARI BANK '
        },
        {
          bankId: '1695',
          bankName: 'UNITED PURI NIMAPRA CENTRAL COOPERATIVE BANK '
        },
        {
          bankId: '1696',
          bankName: 'PARWANOO URBAN COOPERATIVE BANK '
        },
        {
          bankId: '1697',
          bankName: 'TRANSPORT COOPERATIVE BANK '
        },
        {
          bankId: '1698',
          bankName: 'MANSA NAGRIK SAHAKARI BANK '
        },
        {
          bankId: '1699',
          bankName: 'THE TEXCO BANK '
        },
        {
          bankId: '1700',
          bankName: 'SHREE VARDHAMAN BANK '
        },
        {
          bankId: '1701',
          bankName: 'SHIMLA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1702',
          bankName: 'SAMARTH URBAN COOPERATIVE BANK '
        },
        {
          bankId: '1703',
          bankName: 'SIKKIM STATE COOPERATIVE BANK '
        },
        {
          bankId: '1705',
          bankName: 'SHAHADA PEOPLES COOPERATIVE BANK '
        },
        {
          bankId: '1707',
          bankName: 'SURAT MERC COOPERATIVE BANK '
        },
        {
          bankId: '1708',
          bankName: 'SHUBHLAKSHMI MAH COOPERATIVE BANK '
        },
        {
          bankId: '1709',
          bankName: 'SIND COOPERATIVE URBAN BANK '
        },
        {
          bankId: '1710',
          bankName: 'SIHOR MERCANTILE COOPERATIVE BANK '
        },
        {
          bankId: '1711',
          bankName: 'SHIVAM SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1712',
          bankName: 'SHREE SHARADA SAHAKARI BANK '
        },
        {
          bankId: '1713',
          bankName: 'THE SOLAPUR DIST CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '1714',
          bankName: 'SHREE DHARATI COOPERATIVE BANK '
        },
        {
          bankId: '1715',
          bankName: 'SANGHAMITRA COOPERATIVE BANK '
        },
        {
          bankId: '1716',
          bankName: 'SANGHAMITRA COOPERATIVE URBN BANK '
        },
        {
          bankId: '1717',
          bankName: 'SATYASHODHAK SAHAKARI BANK'
        },
        {
          bankId: '1718',
          bankName: 'SHRI ANAND NAGARI SAHAKARI BANK, YES BANK'
        },
        {
          bankId: '1719',
          bankName: 'SAMTA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1720',
          bankName: 'RAJSAMAND URBAN COOPERATIVE BANK '
        },
        {
          bankId: '1721',
          bankName: 'RAMRAJYA SAHAKARI BANK LIMITED '
        },
        {
          bankId: '1722',
          bankName: 'RAJDHANI NAGAR SAHAKARI BANK'
        },
        {
          bankId: '1723',
          bankName: 'RAVI COMMERCIAL URBAN COOPERATIVE BANK'
        },
        {
          bankId: '1724',
          bankName: 'THE COOPERATIVE BANK OF RAJKOT '
        },
        {
          bankId: '1725',
          bankName: 'PANIPAT URBAN COOPERATIVE BANK'
        },
        {
          bankId: '1727',
          bankName: 'PARASPAR SAHAYAK COOPERATIVE BANK '
        },
        {
          bankId: '1728',
          bankName: 'PRAGATI SAHAKARI BANK LIMITED '
        },
        {
          bankId: '1729',
          bankName: 'POSTAL AND RMS EMP COOPERATIVE BANK '
        },
        {
          bankId: '1730',
          bankName: 'PRAGATI MAHILA NAGRIK SAHAKARI BANK'
        },
        {
          bankId: '1731',
          bankName: 'PANCHSHEEL MERC COOPERATIVE BANK '
        },
        {
          bankId: '1732',
          bankName: 'PANCHSHEEL COOPERATIVE BANK '
        },
        {
          bankId: '1733',
          bankName: 'PANCHKULA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1734',
          bankName: 'PURNEA DISTRICT CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '1735',
          bankName: 'PARBHANI DISTRICT CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '1737',
          bankName: 'POCHAMPALLY COOPERATIVE BANK '
        },
        {
          bankId: '1738',
          bankName: 'OMKAR NAGREEYA SAHAKARI BANK KAUSHALPURI'
        },
        {
          bankId: '1739',
          bankName: 'OJHAR MERCHANTS BANK '
        },
        {
          bankId: '1740',
          bankName: 'NASHIK ZILHA S AND P KARMACHARI BANK'
        },
        {
          bankId: '1741',
          bankName: 'NAGAR VIKAS SAHAKARI BANK '
        },
        {
          bankId: '1742',
          bankName: 'NAGAR SAHAKARI BANK, YES BANK'
        },
        {
          bankId: '1743',
          bankName: 'NORTHERN RLY PR COOPERATIVE BANK'
        },
        {
          bankId: '1744',
          bankName: 'NASHIK RD DEOLALI BANK '
        },
        {
          bankId: '1745',
          bankName: 'NASHIK RD DEOLALI VYAPARI SAHAKARI BANK'
        },
        {
          bankId: '1746',
          bankName: 'NAVNIRMAN COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1747',
          bankName: 'NASHIK JILHA MAHILA BANK '
        },
        {
          bankId: '1748',
          bankName: 'NAKODAR HINDU URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1749',
          bankName: 'NE EC RLY EMP PRIMARY COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1750',
          bankName: 'THE NAWADA CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1751',
          bankName: 'NAGAR SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1752',
          bankName: 'THE MANIPUR WOMEN S COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1753',
          bankName: 'Mizoram Urban COOPERATIVE Development Bank'
        },
        {
          bankId: '1754',
          bankName: 'MAHILA SAMRIDHI BANK '
        },
        {
          bankId: '1755',
          bankName: 'MAMASAHEB PAWAR SATYAVIJAY COOPERATIVE BANK '
        },
        {
          bankId: '1756',
          bankName: 'MAHANAGAR NAGRIK SAHAKARI BANK'
        },
        {
          bankId: '1757',
          bankName: 'MAKARPURA IND EST COOPERATIVE BANK '
        },
        {
          bankId: '1758',
          bankName: 'MONGHYR DCC BANK LIMITED'
        },
        {
          bankId: '1759',
          bankName: 'MAYURBHANJ CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1760',
          bankName: 'MEGHALAYA COOPERATIVE APEX BANK '
        },
        {
          bankId: '1761',
          bankName: 'MANNDESHI MAHILA SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1762',
          bankName: 'LOKVIKAS NAGARI SAHAKARI BANK '
        },
        {
          bankId: '1763',
          bankName: 'LAXMI MAHILA NAG SAHAKARI BANK '
        },
        {
          bankId: '1764',
          bankName: 'KARMALA URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1765',
          bankName: 'THE KUNBI SAHAKARI BANK '
        },
        {
          bankId: '1766',
          bankName: 'SHREE KADI NAGRIK SAHAKARI BANK '
        },
        {
          bankId: '1767',
          bankName: 'KOTA MAHILA NAGRIK BANK '
        },
        {
          bankId: '1768',
          bankName: 'THE KOLLAM DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1769',
          bankName: 'KHORDA CENTRAL COOPERATIVE BANK '
        },
        {
          bankId: '1770',
          bankName: 'KHORDA CCB MAHILA BANK '
        },
        {
          bankId: '1771',
          bankName: 'KHALILABAD NAGAR SAHAKARI BANK YES BANK'
        },
        {
          bankId: '1772',
          bankName: 'KAIRA DISTRICT CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '1773',
          bankName: 'KHATTRI COOPERATIVE URBAN BANK '
        },
        {
          bankId: '1774',
          bankName: 'KATIHAR DISTRICT CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '1775',
          bankName: 'JANALAXMI COOPERATIVE BANK '
        },
        {
          bankId: '1776',
          bankName: 'JIVAN COMM COOPERATIVE BANK '
        },
        {
          bankId: '1777',
          bankName: 'JOGINDRA CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '1778',
          bankName: 'JANASEVA COOPERATIVE BANK '
        },
        {
          bankId: '1779',
          bankName: 'IMPERIAL URBAN COOPERATIVE BANK '
        },
        {
          bankId: '1780',
          bankName: 'NASHIK DISTT IMC BANK '
        },
        {
          bankId: '1781',
          bankName: 'INNOVATIVE COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1782',
          bankName: 'INDORE CLOTH MKT COOPERATIVE BANK '
        },
        {
          bankId: '1783',
          bankName: 'HINDUSTAN SHIPYARD STAFF COOPERATIVE BANK'
        },
        {
          bankId: '1784',
          bankName: 'HAVELI SAHAKARI BANK '
        },
        {
          bankId: '1785',
          bankName: 'THE HP STATE COOPERATIVE BANK '
        },
        {
          bankId: '1786',
          bankName: 'THE HASSAN DCC BANK LIMITED'
        },
        {
          bankId: '1787',
          bankName: 'GODAVARI URBAN COOPERATIVE BANK '
        },
        {
          bankId: '1788',
          bankName: 'THE GOA STATE COOPERATIVE BANK'
        },
        {
          bankId: '1789',
          bankName: 'GANDHIBAGH SAHAKARI BANK '
        },
        {
          bankId: '1790',
          bankName: 'GANDHIDHAM MERCANTILE COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1791',
          bankName: 'GODAVARI LAXMI COOPERATIVE BANK '
        },
        {
          bankId: '1792',
          bankName: 'GANDHI COOPERATIVE URBAN BANK LIMITED '
        },
        {
          bankId: '1793',
          bankName: 'GARHA COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '1794',
          bankName: 'FINANCIAL COOPERATIVE BANK '
        },
        {
          bankId: '1795',
          bankName: 'THE FAIZ MERCANTILE COOPERATIVE BANK'
        },
        {
          bankId: '1796',
          bankName: 'THE ELURI COOPERATIVE URBAN BANK '
        },
        {
          bankId: '1797',
          bankName: 'DEHRADUN DISTT COOPERATIVE BANK '
        },
        {
          bankId: '1798',
          bankName: 'THE DELHI ST COOPERATIVE BANK '
        },
        {
          bankId: '1799',
          bankName: 'DEOGIRI NAGARI SAHAKARI BANK '
        },
        {
          bankId: '1800',
          bankName: 'DELHI NAGRIK SEH BANK'
        },
        {
          bankId: '1801',
          bankName: 'DEVELOPMENT COOPERATIVE BANK '
        },
        {
          bankId: '1802',
          bankName: 'OSMANABAD DIST CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '1804',
          bankName: 'DISTRICT COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1805',
          bankName: 'CHARTERED SAHAKARI BANK NIYAMITHA'
        },
        {
          bankId: '1806',
          bankName: 'CITIZENS COOPERATIVE BANK '
        },
        {
          bankId: '1807',
          bankName: 'THE CHANDRAPUR DCC BANK '
        },
        {
          bankId: '1808',
          bankName: 'CHIKHLI URBAN COOPERATIVE BANK '
        },
        {
          bankId: '1809',
          bankName: 'CITIZENS URBAN COOPERATIVE BANK '
        },
        {
          bankId: '1810',
          bankName: 'BANDA URBAN COOPERATIVE BANK '
        },
        {
          bankId: '1811',
          bankName: 'BIHAR STATE COOPERATIVE BANK '
        },
        {
          bankId: '1812',
          bankName: 'BHAVANA RISHI COOPERATIVE BANK '
        },
        {
          bankId: '1813',
          bankName: 'THE BANKI CENTRAL COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1814',
          bankName: 'BRAHMADEODADA BANK '
        },
        {
          bankId: '1815',
          bankName: 'BIRDEV SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1816',
          bankName: 'BHADOHI URBAN COOPERATIVE BANK'
        },
        {
          bankId: '1817',
          bankName: 'BERHAMPUR CENTRAL COOPERATIVE BANK '
        },
        {
          bankId: '1818',
          bankName: 'BALASORE COOPERATIVE URBAN BANK LIMITED'
        },
        {
          bankId: '1819',
          bankName: 'BOUDH COOPERATIVE CENTRAL BANK '
        },
        {
          bankId: '1820',
          bankName: 'THE BUSINESS COOPERATIVE BANK '
        },
        {
          bankId: '1821',
          bankName: 'ALMORA ZILA SAHAKARI BANK '
        },
        {
          bankId: '1822',
          bankName: 'AURANGABAD DCC BANK'
        },
        {
          bankId: '1823',
          bankName: 'AJANTHA URBAN COOPERATIVE BANK '
        },
        {
          bankId: '1824',
          bankName: 'AKOLA URBAN COOPERATIVE BANK '
        },
        {
          bankId: '1825',
          bankName: 'ASSOCIATE COOPERATIVE BANK'
        },
        {
          bankId: '1826',
          bankName: 'YES BANK LIMITED, ARUNACHAL PRADESH SCB NAHARLAGUN'
        },
        {
          bankId: '1827',
          bankName: 'AHMEDNAGAR ZPSS BANK'
        },
        {
          bankId: '1828',
          bankName: 'AP RAJA MAHESHWARI BANK'
        },
        {
          bankId: '1829',
          bankName: 'ANENDESHWARI NAGRIK SAHAKARI BANK'
        },
        {
          bankId: '1830',
          bankName: 'AMBEDKAR NAGRIK SAHAKARI BANK LIMITED'
        },
        {
          bankId: '1832',
          bankName: 'ASTHA MAHILA NAGRIK SAHAKARI BANK MARYADIT'
        },
        {
          bankId: '1833',
          bankName: 'AMALNER URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1834',
          bankName: 'AMRAVATI DCC BANK '
        },
        {
          bankId: '1835',
          bankName: 'AGRASEN COOPERATIVE URBAN BANK'
        },
        {
          bankId: '1836',
          bankName: 'ANGUL CENTRAL COOPERATIVE BANK'
        },
        {
          bankId: '1837',
          bankName: 'THE ADINATH COOPERATIVE BANK LIMITED '
        },
        {
          bankId: '1838',
          bankName: 'UTKAL GRAMYA BANK'
        },
        {
          bankId: '1839',
          bankName: 'NAGALAND RURAL BANK'
        },
        {
          bankId: '1840',
          bankName: 'MIZORAM RURAL BANK'
        },
        {
          bankId: '1841',
          bankName: 'MEGHALAYA RURAL BANK'
        },
        {
          bankId: '1842',
          bankName: 'LANGPI DEHANGI RURAL BANK'
        },
        {
          bankId: '1843',
          bankName: 'ELLAQUAI DEHATI BANK'
        },
        {
          bankId: '1845',
          bankName: 'KAVERI KALPATARU GRAMIN BANK'
        },
        {
          bankId: '1846',
          bankName: 'ARUNACHAL PRADESH RURAL BANK'
        },
        {
          bankId: '1847',
          bankName: 'ANDHRA PRADESH GRAMIN VIKAS BANK'
        },
        {
          bankId: '1848',
          bankName: 'SARVA UP GRAMIN BANK'
        },
        {
          bankId: '1849',
          bankName: 'KASHI GOMTI SAMYUT GRAMIN BANK'
        },
        {
          bankId: '1850',
          bankName: 'MADHYA BIHAR GRAMIN BANK'
        },
        {
          bankId: '1851',
          bankName: 'PUNJAB GRAMIN BANK'
        },
        {
          bankId: '1852',
          bankName: 'ARYA VART GRAMIN BANK'
        },
        {
          bankId: '1853',
          bankName: 'BALIA ETAWA GRAMIN BANK'
        },
        {
          bankId: '1854',
          bankName: 'JHARKHAND GRAMIN BANK'
        },
        {
          bankId: '1855',
          bankName: 'SARVA HARYANA GRAMIN BANK'
        },
        {
          bankId: '1856',
          bankName: 'RUSHIKULYA GRAMIN BANK'
        },
        {
          bankId: '1857',
          bankName: 'NAINITAL ALMORA KSHETRIYA GRAMIN BANK'
        },
        {
          bankId: '1858',
          bankName: 'INDIA POST PAYMENT BANK'
        },
        {
          bankId: '1859',
          bankName: 'HIMACHAL GRAMIN BANK'
        },
        {
          bankId: '1860',
          bankName: 'ING VYSYA BANK LTD'
        },
        {
          bankId: '1861',
          bankName: 'AXIS BANK CREDIT CARD'
        },
        {
          bankId: '1862',
          bankName: 'BANK OF BARODA CREDIT CARD'
        },
        {
          bankId: '1863',
          bankName: 'CANARA BANK CREDIT CARD'
        },
        {
          bankId: '1864',
          bankName: 'CORPORATION BANK CREDIT CARD'
        },
        {
          bankId: '1865',
          bankName: 'HDFC BANK LTD CREDIT CARD'
        },
        {
          bankId: '1866',
          bankName: 'ICICI BANK LTD CREDIT CARD'
        },
        {
          bankId: '1867',
          bankName: 'INDIAN OVERSEAS BANK CREDIT CARD'
        },
        {
          bankId: '1868',
          bankName: 'KOTAK MAHINDRA BANK CREDIT CARD'
        },
        {
          bankId: '1869',
          bankName: 'PUNJAB NATIONAL BANK CREDIT CARD'
        },
        {
          bankId: '1870',
          bankName: 'STATE BANK OF INDIA CREDIT CARD'
        },
        {
          bankId: '1871',
          bankName: 'SYNDICATE BANK CREDIT CARD'
        },
        {
          bankId: '1872',
          bankName: 'UNION BANK OF INDIA CREDIT CARD'
        },
        {
          bankId: '1873',
          bankName: 'VIJAYA BANK CREDIT CARD'
        },
        {
          bankId: '1874',
          bankName: 'ABN AMRO CREDIT CARD'
        },
        {
          bankId: '1875',
          bankName: 'AMERICAN EXPRESS CREDIT CARD'
        },
        {
          bankId: '1878',
          bankName: 'BARCLAYS BANK CREDIT CARD'
        },
        {
          bankId: '1879',
          bankName: 'CITIBANK CREDIT CARD'
        },
        {
          bankId: '1881',
          bankName: 'HSBC CREDIT CARD'
        },
        {
          bankId: '1882',
          bankName: 'STANDARD CHARTERED CREDIT CARD'
        },
        {
          bankId: '1883',
          bankName: 'THE RATNAKAR BANK LIMITED CREDIT CARD'
        },
        {
          bankId: '1884',
          bankName: 'SHREYAS GRAMIN BANK'
        },
        {
          bankId: '1885',
          bankName: 'STATE BANK OF HYDERABAD, DECCAN GRAMEENA BANK'
        },
        {
          bankId: '1886',
          bankName: 'ZILA SAHKARI BANK LTD GHAZIABAD'
        },
        {
          bankId: '1887',
          bankName: 'banda district co-operative bank ltd'
        },
        {
          bankId: '1888',
          bankName: 'ADITYA BIRLA IDEA PAYMENTS BANK'
        },
        {
          bankId: '1889',
          bankName: 'RAJARAM BAPU SAHAKARI BANK LTD'
        },
        {
          bankId: '1890',
          bankName: 'THE HYDERABAD DISTRICT CO OPERATIVE CENTRAL BANK'
        },
        {
          bankId: '1891',
          bankName: 'DENA GUJARAT GRAMIN BANK'
        },
        {
          bankId: '1892',
          bankName: 'District Cooperative Bank limited'
        },
        {
          bankId: '1893',
          bankName: 'SATPURA NARMADA KSHETRIYA GRAMIN BANK'
        },
        {
          bankId: '1894',
          bankName: 'THE RAJASTHAN STATE COOPERATIVE BANK LTD'
        },
        {
          bankId: '1895',
          bankName: 'DBS'
        },
        {
          bankId: '1896',
          bankName: 'TAMILNADU GRAMA BANK'
        },
        {
          bankId: '1897',
          bankName: 'Lakshmi Vilas bank'
        },
        {
          bankId: '1898',
          bankName: 'THE HINDUSTHAN CO OP BANK LIMITED'
        },
        {
          bankId: '1899',
          bankName: 'NATIONAL URBAN COOPERATIVE BANK LIMITED'
        },
        {
          bankId: '1900',
          bankName: 'IndusInd Bank CREDIT CARD'
        },
        {
          bankId: '1901',
          bankName: 'KRISHNA GRAMEENA BANK'
        },
        {
          bankId: '1902',
          bankName: 'THE KASARAGOD DISTRICT CO-OPERATIVE BANK LTD'
        },
        {
          bankId: '1903',
          bankName: 'MANIPUR RURAL BANK'
        },
        {
          bankId: '1904',
          bankName: 'MANIPUR RURAL BANK'
        },
        {
          bankId: '1905',
          bankName: 'STATE BANK OF INDIA HYDERABAD'
        },
        {
          bankId: '1906',
          bankName: 'MEWAR AANCHALIK GRAMIN BANK'
        },
        {
          bankId: '1907',
          bankName: 'PUNE MERCHANTS CO-OPERATIVE BANK LTD'
        },
        {
          bankId: '1908',
          bankName: 'ABHINANDAN URBAN CO-OP BANK LTD'
        },
        {
          bankId: '1909',
          bankName: 'NARMADA JHABUA GRAMIN BANK'
        },
        {
          bankId: '1910',
          bankName: 'District Co Operative Bank Ltd Faizabad'
        },
        {
          bankId: '1912',
          bankName: 'SARVODAYA SAH BANK'
        },
        {
          bankId: '1913',
          bankName: 'DENA GUJARAT GRAMIN BANK'
        },
        {
          bankId: '1914',
          bankName: 'JANA SMALL FINANCE BANK LTD'
        },
        {
          bankId: '1915',
          bankName: 'ZILA SAHKARI BANK LTD MUZAFFARNAGAR'
        },
        {
          bankId: '1916',
          bankName: 'AURANGABAD DCC BANK HO'
        },
        {
          bankId: '1917',
          bankName: 'THE DISTRICT COOP CENTRAL BANK LTD BIDAR'
        },
        {
          bankId: '1918',
          bankName: 'PRIYADARSHANI NAGARI SAHAKARI BANK LTD'
        },
        {
          bankId: '1919',
          bankName: 'Kaveri Grameena Bank'
        },
        {
          bankId: '1920',
          bankName: 'The Navnirman Co - Op. Bank Ltd.'
        },
        {
          bankId: '1921',
          bankName: 'THE BHIWANI CENTRAL COOPERATIVE BANK LTD'
        },
        {
          bankId: '1922',
          bankName: 'UNITED BANK OF INDIA, LANGPI DEHANGI RURAL BANK, D'
        },
        {
          bankId: '1923',
          bankName: 'Nainital District Cooperative Bank'
        },
        {
          bankId: '1924',
          bankName: 'SIKKIM STATE CO-OPERATIVE BANK LTD'
        },
        {
          bankId: '1925',
          bankName: 'SHIVAJI NAGARI PAITHAN'
        },
        {
          bankId: '1926',
          bankName: 'NARMADA MALWA GB-INDORE BR'
        },
        {
          bankId: '1927',
          bankName: 'BIHAR GRAMIN BANK'
        },
        {
          bankId: '1929',
          bankName: 'NAGAR URBAN CO OPERATIVE BANK'
        },
        {
          bankId: '1931',
          bankName: 'MAHANAGAR CO-OP BANK LTD'
        },
        {
          bankId: '1932',
          bankName: 'THE RAMANATHAPURAM DISTRICT CENTRAL CO-OPERATIVE B'
        },
        {
          bankId: '1933',
          bankName: 'UTTARAKHAND GRAMIN BANK'
        },
        {
          bankId: '1936',
          bankName: 'DAKSHIN BIHAR GRAMIN BANK'
        },
        {
          bankId: '1937',
          bankName: 'THE HASSAN DISTRICT CENTRAL CO-OPERATIVE BANK LTD'
        },
        {
          bankId: '1938',
          bankName: 'Zila Sahkari Bank Ltd  Bulandshahr'
        },
        {
          bankId: '1939',
          bankName: 'THE DISTRICT CO-OPERATIVE BANK LTD AGRA'
        },
        {
          bankId: '1940',
          bankName: 'UJJIVAN SMALL FINANCE BANK LIMITED DHARMANAGAR'
        },
        {
          bankId: '1941',
          bankName: 'Fingrowth Cooperative Bank Ltd'
        },
        {
          bankId: '1942',
          bankName: 'NSDL Payments Bank Limited'
        }
      ];

      await dbService.createMany(model.bank, initialBankData);
    }
  } catch (error) {
    console.log('Failed to update Services due to:', error.message);
  }
}

async function services() {
  try {
    let existingDoc = await dbService.findOne(model.services, { id: 1 });
    if (!existingDoc) {
      const initialStateData = [        
       
          {
            isActive: true,
            serviceName: 'AEPS 1'
          },
          {
            isActive: true,
            serviceName: 'AEPS 2'
          },
          {
            isActive: true,
            serviceName: 'DMT 1'
          },
          {
            isActive: true,
            serviceName: 'DMT 2'
          },
          {
            isActive: true,
            serviceName: 'BBPS'
          },
          {
            isActive: true,
            serviceName: 'Credit Card 1'
          },
          {
            isActive: true,
            serviceName: 'Credit Card 2'
          },
          {
            isActive: true,
            serviceName: 'CMS 1'
          },
          {
            isActive: true,
            serviceName: 'CMS 2'
          },
          {
            isActive: true,
            serviceName: 'MATM'
          },
          {
            isActive: true,
            serviceName: 'IndoNepal'
          },
          {
            isActive: true,
            serviceName: 'AEPS Cash Withdrawal'
          },
         {
            isActive: true,
            serviceName: 'Issuance'
          }
        
      ];

      await dbService.createMany(model.services, initialStateData);
    }
    console.log('service Inserted');
  } catch (error) {
    console.log('Failed to update Services due to:', error.message);
  }
}

async function cardType() {
  try {
    let existingDoc = await dbService.findOne(model.cardType, { id: 1 });
    if (!existingDoc) {
      const initialStateData = [
        { name: 'MASTERCARD', isActive: true },
        { name: 'VISA', isActive: true },
        { name: 'RUPAY', isActive: true },
        { name: 'OTHER', isActive: true }
      ];

      await dbService.createMany(model.cardType, initialStateData);
    }
    console.log('Card type Inserted');x
  } catch (error) {
    console.log('Failed to update card type due to:', error.message);
  }
}

async function paymentInsturment() {
  try {
    let existingDoc = await dbService.findOne(model.paymentInstrument, {
      id: 1
    });
    if (!existingDoc) {
      const initialStateData = [
        {
          name: 'DEBIT CARD',
          isActive: true,
          isCardType: false
        },
        {
          name: 'NET BANKING',
          isActive: true,
          isCardType: false
        },
        {
          name: 'UPI',
          isActive: true,
          isCardType: false
        },
        {
          name: 'CREDIT CARDS',
          isActive: true,
          isCardType: true
        },
        {
          name: 'CORPORATE CARDS',
          isActive: true,
          isCardType: true
        },
        {
          name: 'PREPAID CARDS',
          isActive: true,
          isCardType: true
        },
        {
          name: 'AMEX CARDS',
          isActive: true,
          isCardType: false
        },
        {
          name: 'DINER CARDS',
          isActive: true,
          isCardType: false
        },
        {
          name: 'WALLETS',
          isActive: true,
          isCardType: false
        },
        {
          name: 'OTHERS',
          isActive: true,
          isCardType: false
        }
      ];

      await dbService.createMany(model.paymentInstrument, initialStateData);
    }
    console.log('Payment insturment Inserted');
  } catch (error) {
    console.log('Failed to update payment insturment due to:', error.message);
  }
}

async function seedPgCommercials() {
  try {
    const slabs = await dbService.findAll(model.slab, {}, { select: ['id'] });
    const slabIds = slabs.map((slab) => slab.id);

    const operators = await dbService.findAll(
      model.operator,
      { operatorType: 'PayIn' },
      { select: ['id', 'operatorName', 'operatorType'] }
    );

    const paymentInstruments = await dbService.findAll(
      model.paymentInstrument,
      {},
      { select: ['id', 'name', 'isCardType'] }
    );
    const cardTypes = await dbService.findAll(
      model.cardType,
      {},
      { select: ['id', 'name'] }
    );

    const roleTypes = [5,4,3,2,1];
    const roleNames = {
      5: 'RE',
      4: 'DI',
      3: 'MD',
      2: 'WU',
      1: 'AD'
    };

    let dataToInsertPgCommercials = [];

    for (const slabId of slabIds) {
      for (const operator of operators) {
        for (const roleType of roleTypes) {
          for (const paymentInstrument of paymentInstruments) {
            if (paymentInstrument.isCardType) {
              for (const cardType of cardTypes) {
                dataToInsertPgCommercials.push({
                  slabId,
                  operatorId: operator.id,
                  operatorName: operator.operatorName,
                  operatorType: operator.operatorType,
                  roleType,
                  roleName: roleNames[roleType],
                  commAmt: 0,
                  commType: 'com',
                  amtType: 'fix',
                  paymentInstrumentId: paymentInstrument.id,
                  paymentInstrumentName: paymentInstrument.name,
                  cardTypeId: cardType.id,
                  cardTypeName: cardType.name
                });
              }
            } else {
              dataToInsertPgCommercials.push({
                slabId,
                operatorId: operator.id,
                operatorName: operator.operatorName,
                operatorType: operator.operatorType,
                roleType,
                roleName: roleNames[roleType],
                commAmt: 0,
                commType: 'com',
                amtType: 'fix',
                paymentInstrumentId: paymentInstrument.id,
                paymentInstrumentName: paymentInstrument.name,
                cardTypeId: null,
                cardTypeName: null
              });
            }
          }
        }
      }
    }

    if (dataToInsertPgCommercials.length > 0) {
      await model.pgCommercials.bulkCreate(dataToInsertPgCommercials, {
        ignoreDuplicates: true
      });
      console.log(
        `Inserted ${dataToInsertPgCommercials.length} new records into pgCommercials.`
      );
    } else {
      console.log('No new records needed in pgCommercials.');
    }
  } catch (error) {
    console.error('Error seeding pgCommercials:', error);
  }
}

async function seedRangeCharges() {
  try {
    const slabs = await dbService.findAll(model.slab, {}, { select: ['id'] });
    const slabIds = slabs.map((slab) => slab.id);

    const operators = await dbService.findAll(
      model.operator,
      {},
      { select: ['id', 'operatorName', 'operatorType'] }
    );

    const roleTypes = [5,4,3,2];
    const roleNames = {
      5: 'RE',
      4: 'DI',
      3: 'MD',
      2: 'AD'
    };

    let dataToInsertRangeCharges = [];
    for (const slabId of slabIds) {
      for (const operator of operators) {
        const ranges = await dbService.findAll(
          model.range,
          { operatorType: operator.operatorType },
          { select: ['id', 'min', 'max'] }
        );

        for (const range of ranges) {
          for (const roleType of roleTypes) {
            dataToInsertRangeCharges.push({
              slabId,
              operatorId: operator.id,
              operatorName: operator.operatorName,
              operatorType: operator.operatorType,
              rangeId: range.id,
              min: range.min,
              max: range.max,
              roleType,
              roleName: roleNames[roleType],
              commAmt: 0,
              commType: 'com',
              amtType: 'fix'
            });
          }
        }
      }
    }
    if (dataToInsertRangeCharges.length > 0) {
      await model.rangeCharges.bulkCreate(dataToInsertRangeCharges, {
        ignoreDuplicates: true
      });
      console.log(
        `Inserted ${dataToInsertRangeCharges.length} new records into rangeCharges.`
      );
    } else {
      console.log('No new records needed in rangeCharges.');
    }
  } catch (error) {
    console.error('Error seeding rangeCharges:', error);
  }
}

async function seedRangeComm() {
  try {
    const slabs = await dbService.findAll(model.slab, {}, { select: ['id'] });
    const slabIds = slabs.map((slab) => slab.id);

    const operators = await dbService.findAll(
      model.operator,
      {},
      { select: ['id', 'operatorName', 'operatorType'] }
    );

    const roleTypes = [5,4,3,2,1];
    const roleNames = {
      5: 'RE',
      4: 'DI',
      3: 'MD',
      2: 'WU',
      1: 'AD'
    };

    let dataToInsertRangeComm = [];
    for (const slabId of slabIds) {
      for (const operator of operators) {
        const ranges = await dbService.findAll(
          model.range,
          { operatorType: operator.operatorType },
          { select: ['id', 'min', 'max'] }
        );

        for (const range of ranges) {
          for (const roleType of roleTypes) {
            dataToInsertRangeComm.push({
              slabId,
              operatorId: operator.id,
              operatorName: operator.operatorName,
              operatorType: operator.operatorType,
              rangeId: range.id,
              min: range.min,
              max: range.max,
              roleType,
              roleName: roleNames[roleType],
              commAmt: 0,
              commType: 'com',
              amtType: 'fix'
            });
          }
        }
      }
    }

    if (dataToInsertRangeComm.length > 0) {
      await model.rangeCommission.bulkCreate(dataToInsertRangeComm, {
        ignoreDuplicates: true
      });
      console.log(
        `Inserted ${dataToInsertRangeComm.length} new records into rangeComm.`
      );
    } else {
      console.log('No new records needed in rangeComm.');
    }
  } catch (error) {
    console.error('Error seeding rangeComm:', error);
  }
}



async function seedCompany() {
  try {
    // Check if company already exists
    const existingCompany = await dbService.findOne(model.company, { 
      companyPan: 'NGEPK6607L' 
    });

    if (!existingCompany) {
      const companyData = {
        companyName: 'GmaxePay',
        companyPan: 'NGEPK6607L',
        customDomain: 'app.gmaxepay.in',
        remark: 'Company registration remarks',
        singupPageDesign: 1,
        navigationBar: 'HORIZONTAL',
        BussinessEntity: 'Company',
        isActive: true,
        isDeleted: false
      };

      const company = await dbService.createOne(model.company, companyData);
      console.log('Company seeded successfully with ID:', company.id);
      return company;
    } else {
      console.log('Company already exists with ID:', existingCompany.id);
      return existingCompany;
    }
  } catch (error) {
    console.error('Error seeding company:', error);
    return null;
  }
}

async function seedUsers(companyId) {
  try {
    // Check if user already exists
    const existingUser = await dbService.findOne(model.user, { 
      email: 'gmaxepay@gmail.com' 
    });

    let user;
    if (!existingUser) {
      const userData = {
        name: 'Gmaxepay Admin',
        email: 'gmaxepay@gmail.com',
        mobileNo: '9071138349',
        password: '12345678',
        userRole: 1, // Super Admin
        kycStatus: 1, // Approved
        userType: 1, // Admin type
        companyId: companyId,
        isActive: true,
        isDeleted: false,
        mobileVerify: true,
        emailVerify: true,
        aadharVerify: true,
        panVerify: true,
        imageVerify: true,
        isLoginOtp: false,
        signupStep: 4,
        tokenVersion: 0,
        loggedIn: false
      };

      user = await dbService.createOne(model.user, userData);
      console.log('User seeded successfully with ID:', user.id);
    } else {
      console.log('User already exists with ID:', existingUser.id);
      user = existingUser;
    }

    // Create wallet for the user
    if (user && user.id) {
      const existingWallet = await dbService.findOne(model.wallet, { 
        refId: user.id 
      });

      if (!existingWallet) {
        const walletData = {
          refId: user.id,
          companyId: companyId,
          roleType: 1,
          mainWallet: 0,
          apesWallet: 0,
          isActive: true,
          isDelete: false
        };

        await dbService.createOne(model.wallet, walletData);
        console.log('Wallet seeded successfully for user ID:', user.id);
      } else {
        console.log('Wallet already exists for user ID:', user.id);
      }
    }

  } catch (error) {
    console.error('Error seeding user or wallet:', error);
  }
}

async function serviceCharges() {
  try {
    console.log('Seeding service charges...');
    
    // Get all active services
    const services = await dbService.findAll(model.services, { isActive: true });
    
    if (!services || services.length === 0) {
      console.log('No services found to create charges for');
      return;
    }

    // Role types: 1=SUPER_ADMIN, 2=ADMIN, 3=MASTER_DISTRIBUTOR, 4=DISTRIBUTOR, 5=RETAILER
    const roleCharges = {
      1: 0,    // SUPER_ADMIN - no charge
      2: 100,  // ADMIN - ₹100 per service
      3: 80,   // MASTER_DISTRIBUTOR - ₹80 per service
      4: 60,   // DISTRIBUTOR - ₹60 per service
      5: 40    // RETAILER - ₹40 per service
    };

    const serviceChargeData = [];

    for (const service of services) {
      for (const [roleType, chargeAmount] of Object.entries(roleCharges)) {
        // Check if charge already exists
        const existingCharge = await dbService.findOne(model.serviceCharge, {
          serviceId: service.id,
          roleType: parseInt(roleType)
        });

        if (!existingCharge) {
          serviceChargeData.push({
            serviceId: service.id,
            roleType: parseInt(roleType),
            chargeAmount: chargeAmount,
            isActive: true,
            addedBy: 1 // Assuming user ID 1 is the system user
          });
        }
      }
    }

    if (serviceChargeData.length > 0) {
      await dbService.createMany(model.serviceCharge, serviceChargeData);
      console.log(`Created ${serviceChargeData.length} service charges`);
    } else {
      console.log('All service charges already exist');
    }

  } catch (error) {
    console.error('Error seeding service charges:', error);
  }
}

async function seedData() {
  
  //  await roles();
   await permissions();
   await insertPermissions();
   await rolePermission();
   await KycDocumentSettings();
   await servicePush();
   await OperatorType();
   await state();
   await gstState();
   await bank();
    await services();
   
   await cardType();
   await paymentInsturment();
   await seedPgCommercials();
   await seedRangeComm();
   await seedRangeCharges();
   
   // Create company first, then user and wallet
   const company = await seedCompany();
   if (company && company.id) {
     await seedUsers(company.id);
   }
   await createBasicPackage();
}
module.exports = seedData;
