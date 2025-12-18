const express = require('express');
const router = express.Router();
const bankController = require('../../../controller/admin/v1/bankController');
const authentication = require('../../../middleware/authentication');
const { upload, multer } = require('../../../middleware/multerConfig');

router.post('/create-bank', authentication,  upload.single('bankLogo'),  multer, bankController.createBank );
router.put('/update-bank/:bankId',authentication, upload.single('bankLogo'), multer, bankController.updateBank);
router.post('/delete-bank/:bankId', authentication, bankController.deleteBank);
router.post('/get-bank/:bankId', authentication, bankController.getBankById);
router.post('/get-all-banks', authentication, bankController.getAllBanks);

module.exports = router;