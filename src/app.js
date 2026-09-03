'use strict';

const express = require('express');
const cors    = require('cors');

const adminRoutes       = require('./modules/admin/admin.routes');
const authRoutes        = require('./modules/crm/auth/auth.routes');
const crmRoutes         = require('./modules/crm/crm.routes');
const publicRoutes      = require('./modules/crm/crm.public.routes');
const webhookRoutes     = require('./modules/crm/crm.webhook.routes');    // legacy single-tenant
const tenantWebhook     = require('./modules/crm/webhook.router');         // NEW: BYOW per-tenant
const { initNurturingCron }    = require('./modules/crm/nurturing/nurturing.cron');
const { initBroadcastWorker }  = require('./modules/crm/broadcast/broadcast.worker');

const app = express();

// ── Init Background Jobs (Cron) ─────────────────────────────────────────────
initNurturingCron();   // Nurturing & Snooze — setiap hari 21:00 WIB
initBroadcastWorker(); // Broadcast Queue Worker — setiap 1 menit



// ── Middleware ──────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Request logger (development) ────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ── Health Check ────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    status:  'ok',
    service: 'Nexa OS Backend',
    version: '1.1.0',
    env:     process.env.NODE_ENV || 'development',
    ts:      new Date().toISOString(),
    endpoints: {
      admin:    '/api/admin/*',
      auth:     '/api/v1/auth/*',
      crm:      '/api/v1/*',
      templates:'/api/v1/templates (CRUD + sync + parameters)',
      webhook:  '/webhook/:tenantSlug (BYOW per-tenant)',
      webhook_legacy: '/api/webhook/whatsapp (backward-compat)',
    }
  });
});

// ── API Routes ──────────────────────────────────────────────────

// Admin (tidak berubah)
app.use('/api/admin', adminRoutes);

// Auth: tersedia di dua prefix (v1 baru + crm lama)
app.use('/api/v1/auth', authRoutes);
app.use('/api/crm/auth', authRoutes);         // ← backward-compat

// CRM routes: tersedia di dua prefix (v1 baru + crm lama)
app.use('/api/v1', crmRoutes);
app.use('/api/crm', crmRoutes);               // ← backward-compat

// Public routes (No JWT required)
app.use('/api/public', publicRoutes);

// Webhook routes — Legacy single-tenant (backward-compat)
app.use('/api/webhook', webhookRoutes);

// Webhook routes — BYOW per-tenant (new architecture)
// URL format: /webhook/:tenantSlug
// Contoh: https://api.nexa.id/webhook/crm-demo
app.use('/webhook', tenantWebhook);

// ── 404 Handler ─────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ status: 'error', message: 'Endpoint not found.' });
});

// ── Global Error Handler ────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ status: 'error', message: err.message });
});

module.exports = app;
