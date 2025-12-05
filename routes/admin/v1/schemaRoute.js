const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const companySchemaController = require('../../../controller/admin/v1/companySchemaController');

// Schema CRUD routes
router.post('/create', authentication, companySchemaController.createSchema);
router.get('/getAll', authentication, companySchemaController.getAllSchemas);
router.get('/getById/:id', authentication, companySchemaController.getSchemaById);
router.put('/updateId/:id', authentication, companySchemaController.updateSchema);
router.delete('/deleteById/:id', authentication, companySchemaController.deleteSchema);

// Schema assignment
router.post('/assign', authentication, companySchemaController.assignSchemaToUser);

// Slab assignment (Super Admin only)
router.post('/assign-to-company', authentication, companySchemaController.assignSlabToCompany);

// Commission management
router.post('/commissions', authentication, companySchemaController.createCompanyCommission);
router.get('/commissions/by-schema', authentication, companySchemaController.getCommissionsBySchema);
router.get('/commissions/user/:userId', authentication, companySchemaController.getUserCommissions);

module.exports = router;

