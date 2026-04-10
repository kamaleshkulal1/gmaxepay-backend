const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const bbpsOperatorController = require('../../../controller/admin/v1/bbpsOperatorController');
const { upload, multer } = require('../../../middleware/multerConfig');

router.post('/categories', authentication, bbpsOperatorController.createOperatorCategory);
router.get('/categories', authentication, bbpsOperatorController.getOperatorCategories);
router.post('/categories/all', authentication, bbpsOperatorController.getOperatorAllCategories);
router.get('/categories/:id', authentication, bbpsOperatorController.getOperatorCategoryById);
router.put('/categories/:id', authentication, bbpsOperatorController.updateOperatorCategory);
router.delete('/categories/:id', authentication, bbpsOperatorController.deleteOperatorCategory);

router.post('/operators', authentication, bbpsOperatorController.createOperator);
router.post('/operators/list', authentication, bbpsOperatorController.getOperators);
router.get('/operators/:id', authentication, bbpsOperatorController.getOperatorById);
router.put('/operators/:id', authentication, bbpsOperatorController.updateOperator);
router.delete('/operators/:id', authentication, bbpsOperatorController.deleteOperator);
router.post('/operators/:billerId/upload-image', authentication, upload.fields([{ name: 'billerImage', maxCount: 5 }]), multer, bbpsOperatorController.uploadOperatorImage);

router.put('/users/:id/agent-id', authentication, bbpsOperatorController.updateAgentId);

router.post('/payment-info', authentication, bbpsOperatorController.createPaymentInfo);
router.post('/payment-info/all', authentication, bbpsOperatorController.getAllPaymentInfo);
router.get('/payment-info/:id', authentication, bbpsOperatorController.getPaymentInfoById);
router.put('/payment-info/:id', authentication, bbpsOperatorController.updatePaymentInfo);
router.delete('/payment-info/:id', authentication, bbpsOperatorController.deletePaymentInfo);

module.exports = router;

