'use strict';

const { Router } = require('express');
const ctrl        = require('./auth.controller');
const { requireAuth } = require('../../../middleware/requireAuth');
const { verifyJWT } = require('./auth.service');
const crypto = require('crypto');

const router = Router();

// POST /api/crm/auth/login   ← public
router.post('/login', ctrl.login);

// GET  /api/crm/auth/me      ← butuh token
router.get('/me', requireAuth, ctrl.me);

// GET /api/crm/auth/debug-token  ← SEMENTARA, untuk debug token issues
router.get('/debug-token', (req, res) => {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.json({ error: 'No token' });

  const parts = token.split('.');
  const secret = process.env.JWT_SECRET_KEY;

  // Decode payload (no verification)
  let payload = null;
  try {
    const b64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    payload = JSON.parse(Buffer.from(padded, 'base64').toString());
  } catch(e) { payload = { error: e.message }; }

  // Recompute signature
  let sigMatch = false;
  let storedSig = parts[1] || '';
  let expectedSig = '';
  try {
    const b64p = parts[0].replace(/-/g, '+').replace(/_/g, '/');
    const paddedP = b64p + '='.repeat((4 - b64p.length % 4) % 4);
    const payloadStr = Buffer.from(paddedP, 'base64').toString();
    const sig = crypto.createHmac('sha256', secret).update(payloadStr).digest();
    expectedSig = Buffer.from(sig).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    sigMatch = storedSig === expectedSig;
  } catch(e) {}

  res.json({
    tokenLength: token.length,
    parts: parts.length,
    payload,
    sigMatch,
    storedSig: storedSig.substring(0, 15) + '...',
    expectedSig: expectedSig.substring(0, 15) + '...',
    expired: payload && payload.expires ? payload.expires < Date.now() : null,
    secretLength: secret ? secret.length : 0
  });
});

module.exports = router;

