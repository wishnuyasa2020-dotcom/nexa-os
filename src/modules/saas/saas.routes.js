'use strict';

/**
 * saas.routes.js
 * Rute Publik SaaS — Endpoint pendaftaran instan klien & cek kuota pool
 */

const { Router } = require('express');
const saasCtrl = require('./saas.controller');

const router = Router();

// ── In-Memory Rate Limiting (Anti-Spam Pendaftaran) ──────────────────────────
const _saasRateLimits = new Map();
const WINDOW_MS = 60 * 1000;       // 1 menit
const MAX_REQUESTS = 10;            // maks 10 pendaftaran per menit per IP

function saasRateLimiter(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const clientData = _saasRateLimits.get(ip) || { count: 0, resetTime: now + WINDOW_MS };

  if (now > clientData.resetTime) {
    clientData.count = 1;
    clientData.resetTime = now + WINDOW_MS;
  } else {
    clientData.count += 1;
  }

  _saasRateLimits.set(ip, clientData);

  if (clientData.count > MAX_REQUESTS) {
    return res.status(429).json({
      status: 'error',
      message: 'Terlalu banyak permintaan pendaftaran. Silakan coba kembali dalam 1 menit.'
    });
  }

  next();
}

// ── Endpoints Publik ─────────────────────────────────────────────────────────

// Cek ketersediaan kuota pendaftaran (apakah ada DB available)
router.get('/pool-status', saasCtrl.getPoolStatus);

// Pendaftaran Mandiri Free Tier
router.post('/register', saasRateLimiter, saasCtrl.register);

// ── Closed Beta Endpoints (Selective Onboarding) ────────────────────────────
router.get('/beta-status', saasCtrl.getBetaStatus);
router.post('/apply-beta', saasRateLimiter, saasCtrl.applyBeta);

module.exports = router;

