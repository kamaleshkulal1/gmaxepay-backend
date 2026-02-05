const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const operatorController = require('../../../controller/admin/v1/operatorController');

router.post('/', authentication, operatorController.registerOperator);
router.post('/list', authentication, operatorController.findAllOperator);
router.get('/:id', authentication, operatorController.getOperator);
router.patch('/:id', authentication, operatorController.partialUpdateOperator);
router.delete('/:id', authentication, operatorController.deleteOperator);
router.get('/states', authentication, operatorController.findAllState);
router.get('/types', authentication, operatorController.findAllOperatorType);
router.get('/list', authentication, operatorController.operatorList);

module.exports = router;