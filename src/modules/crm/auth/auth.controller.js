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

async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    const result = await authService.forgotPassword(email);
    if (!result.success) return res.status(400).json({ status: 'error', message: result.message });
    res.json({ status: 'ok', message: result.message });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;
    const result = await authService.resetPassword(token, newPassword);
    if (!result.success) return res.status(400).json({ status: 'error', message: result.message });
    res.json({ status: 'ok', message: result.message });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getProfile(req, res) {
  try {
    const data = await authService.getProfile(req.user.username);
    if (!data) return res.status(404).json({ status: 'error', message: 'User tidak ditemukan.' });
    res.json({ status: 'ok', data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function changePassword(req, res) {
  try {
    const { old_password, new_password, confirm_password } = req.body;
    if (!old_password || !new_password || !confirm_password) {
      return res.status(400).json({ status: 'error', message: 'Semua field password wajib diisi.' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ status: 'error', message: 'Password baru minimal 6 karakter.' });
    }
    if (new_password !== confirm_password) {
      return res.status(400).json({ status: 'error', message: 'Konfirmasi password tidak cocok.' });
    }

    const actor = req.user?.nama || req.user?.username;
    const result = await authService.changePassword(req.user.username, old_password, new_password, actor);
    if (!result.success) {
      return res.status(400).json({ status: 'error', message: result.message });
    }
    res.json({ status: 'ok', message: result.message });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { login, me, forgotPassword, resetPassword, getProfile, changePassword };
