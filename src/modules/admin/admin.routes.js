'use strict';

const { Router } = require('express');
const ctrl = require('./admin.controller');

const router = Router();

// Semua route /api/admin/* dilindungi oleh NEXA_ADMIN_KEY
router.use(ctrl.requireAdminKey);

router.get('/ping', ctrl.ping);
router.get('/overview', ctrl.overview);
router.get('/tenant', ctrl.tenant);
router.post('/tenant', ctrl.addTenant);
router.post('/tenant/addon', ctrl.addonCro);
router.put('/tenant/tier', ctrl.updateTier);
router.put('/tenant/whatsapp', ctrl.updateWhatsapp);

// ── WhatsApp Provisioning Requests (Superadmin) ─────────────────
router.get('/whatsapp-requests',                      ctrl.getWhatsappRequests);
router.post('/whatsapp-requests/:tenantId/trigger-otp', ctrl.triggerWhatsappOtp);
router.post('/whatsapp-requests/:tenantId/verify-otp',  ctrl.verifyWhatsappOtp);
router.put('/whatsapp-requests/:tenantId/approve',    ctrl.approveWhatsappRequest);
router.put('/whatsapp-requests/:tenantId/reject',     ctrl.rejectWhatsappRequest);

router.get('/usage', ctrl.usage);
router.get('/users', ctrl.users);
router.get('/health', ctrl.health);
router.get('/activity', ctrl.activity);

// Pustaka Template NexaMOS (27 Template Master Library) & Deployer
router.get('/templates/library',                            ctrl.getTemplateLibrary);
router.get('/templates/preview-context/:tenantId',          ctrl.getTenantPreviewContext);
router.post('/templates/library/deploy-all',                ctrl.deployLibraryAll);
router.post('/templates/library/deploy/:tenantId',          ctrl.deployLibraryToTenant);

// Template Monitor — read-only cross-tenant (nexamos-admin)
// PENTING: route spesifik harus SEBELUM /templates/:tenantId
router.get('/templates/stats',                              ctrl.templateStats);
router.get('/templates/:tenantId',                          ctrl.templatesByTenant);

// ── Invoices & Subscriptions Management (Superadmin) ─────────
router.get('/billing/invoices',                      ctrl.billingInvoices);
router.post('/billing/invoices/:invoiceId/mark-paid', ctrl.markInvoicePaid);

// ── DB Pool Management (SaaS Engine) ─────────────────────────
const saasCtrl = require('../saas/saas.controller');
router.get('/db-pool',        saasCtrl.getPoolOverview);
router.post('/db-pool',       saasCtrl.addPool);
router.delete('/db-pool/:id', saasCtrl.deletePool);

// ── Closed Beta Applications Management (Superadmin) ─────────
router.get('/beta-applications',              saasCtrl.getBetaApplications);
router.post('/beta-applications/:id/approve', saasCtrl.approveBetaApplication);
router.put('/beta-applications/:id/status',   saasCtrl.updateBetaApplicationStatus);

// ── Demo Version Management & Reset (Superadmin) ──────────────
router.get('/demo/status', ctrl.getDemoStatus);
router.post('/demo/reset', ctrl.resetDemo);

module.exports = router;

