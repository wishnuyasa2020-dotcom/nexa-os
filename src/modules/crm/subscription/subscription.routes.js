'use strict';

const { Router } = require('express');
const ctrl = require('./subscription.controller');

const router = Router();

// Endpoint Subscription & Billing (terlindungi JWT requireAuth di crm.routes.js)
router.get('/plans', ctrl.getPlans);
router.get('/overview', ctrl.getBillingOverview);
router.post('/create-transaction', ctrl.createTransaction);
router.get('/check-status/:invoiceId', ctrl.checkStatus);

module.exports = router;
