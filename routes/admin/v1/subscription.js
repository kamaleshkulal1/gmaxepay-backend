const express = require('express');
const router = express.Router();
const authentication = require('../../../middleware/authentication');
const subscriptionController = require('../../../controller/admin/v1/subscriptionController');

// Service Charge routes
router.post('/service-charges', authentication, subscriptionController.createServiceCharge);
router.get('/service-charges', authentication, subscriptionController.getAllServiceCharges);
router.put('/service-charges/:id', authentication, subscriptionController.updateServiceCharge);
router.delete('/service-charges/:id', authentication, subscriptionController.deleteServiceCharge);

// Subscription routes
router.post('/subscriptions/:userId', authentication, subscriptionController.createSubscription);
router.get('/subscriptions', authentication, subscriptionController.getAllSubscriptions);
router.get('/subscriptions/user/:userId', authentication, subscriptionController.getUserSubscriptions);
router.get('/subscriptions/history/:userId', authentication, subscriptionController.getSubscriptionHistory);
router.put('/subscriptions/:id/cancel', authentication, subscriptionController.cancelSubscription);
router.get('/subscriptions/company/services', authentication, subscriptionController.getCompanySubscribedServices);

module.exports = router;





