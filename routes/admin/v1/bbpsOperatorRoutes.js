const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const bbpsOperatorController = require('../../../controller/admin/v1/bbpsOperatorController');
const { upload, multer } = require('../../../middleware/multerConfig');

// Operator Category Routes
router.post('/categories', authentication, bbpsOperatorController.createOperatorCategory);
router.get('/categories', authentication, bbpsOperatorController.getOperatorCategories);
router.post('/categories/all', authentication, bbpsOperatorController.getOperatorAllCategories);
router.get('/categories/:id', authentication, bbpsOperatorController.getOperatorCategoryById);
router.put('/categories/:id', authentication, bbpsOperatorController.updateOperatorCategory);
router.delete('/categories/:id', authentication, bbpsOperatorController.deleteOperatorCategory);

// Operator Routes
router.post('/operators', authentication, bbpsOperatorController.createOperator);
router.post('/operators/list', authentication, bbpsOperatorController.getOperators);
router.get('/operators/:id', authentication, bbpsOperatorController.getOperatorById);
router.put('/operators/:id', authentication, bbpsOperatorController.updateOperator);
router.delete('/operators/:id', authentication, bbpsOperatorController.deleteOperator);
router.post('/operators/:billerId/upload-image', authentication, upload.fields([{ name: 'billerImage', maxCount: 5 }]), multer, bbpsOperatorController.uploadOperatorImage);

// Agent ID Routes
router.put('/users/:id/agent-id', authentication, bbpsOperatorController.updateAgentId);

// Payment Info Routes
router.post('/payment-info', authentication, bbpsOperatorController.createPaymentInfo);
router.get('/payment-info', authentication, bbpsOperatorController.getAllPaymentInfo);
router.get('/payment-info/:id', authentication, bbpsOperatorController.getPaymentInfoById);
router.put('/payment-info/:id', authentication, bbpsOperatorController.updatePaymentInfo);
router.delete('/payment-info/:id', authentication, bbpsOperatorController.deletePaymentInfo);

module.exports = router;

