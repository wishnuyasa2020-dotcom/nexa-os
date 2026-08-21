'use strict';

const express = require('express');
const cors    = require('cors');

const adminRoutes     = require('./modules/admin/admin.routes');
const authRoutes      = require('./modules/crm/auth/auth.routes');
const crmRoutes       = require('./modules/crm/crm.routes');
const publicRoutes    = require('./modules/crm/crm.public.routes');
const webhookRoutes   = require('./modules/crm/crm.webhook.routes');
const { initNurturingCron } = require('./modules/crm/nurturing/nurturing.cron');

const app = express();

// ── Init Background Jobs (Cron) ─────────────────────────────────────────────
initNurturingCron();


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
    version: '1.0.0',
    env:     process.env.NODE_ENV || 'development',
    ts:      new Date().toISOString(),
    endpoints: {
      admin:    '/api/admin/*',
      auth:     '/api/v1/auth/* (juga: /api/crm/auth/*)',
      crm:      '/api/v1/* (juga: /api/crm/*)',
      dashboard: 'GET /api/v1/dashboard/stats|charts|leaderboard',
      tasks:    'GET /api/v1/tasks, POST /api/v1/tasks/:id/reschedule',
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

// Webhook routes (Meta API)
app.use('/api/webhook', webhookRoutes);

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
