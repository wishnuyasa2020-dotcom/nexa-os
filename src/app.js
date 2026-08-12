'use strict';

const express = require('express');
const cors    = require('cors');

const adminRoutes  = require('./modules/admin/admin.routes');
const authRoutes   = require('./modules/crm/auth/auth.routes');

const app = express();

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
    version: '1.0.0-alpha',
    env:     process.env.NODE_ENV || 'development',
    ts:      new Date().toISOString(),
  });
});

// ── API Routes ──────────────────────────────────────────────────
app.use('/api/admin', adminRoutes);
app.use('/api/crm/auth', authRoutes);

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
