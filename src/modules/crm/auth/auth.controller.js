'use strict';

const authService = require('./auth.service');

/**
 * POST /api/crm/auth/login
 * Body: { username, password }
 */
async function login(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ status: 'error', message: 'Username dan password wajib diisi.' });
    }
    const result = await authService.login(username, password);
    if (!result.success) {
      return res.status(401).json({ status: 'error', message: result.message });
    }
    res.json({ status: 'ok', data: { token: result.token, user: result.user, activePeriod: result.activePeriod } });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

/**
 * GET /api/crm/auth/me
 * Header: Authorization: Bearer <token>
 */
async function me(req, res) {
  res.json({ status: 'ok', data: { user: req.user } });
}

module.exports = { login, me };
