'use strict';

const adminService = require('./admin.service');

/**
 * Middleware — autentikasi sederhana via header X-Admin-Key
 * atau query param ?adminKey=
 */
function requireAdminKey(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.adminKey;
  if (!key || key !== process.env.NEXA_ADMIN_KEY) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized: invalid admin key.' });
  }
  next();
}

/**
 * GET /api/admin/ping
 */
async function ping(req, res) {
  res.json({ status: 'ok', message: 'Nexa OS Express API is alive.', ts: new Date().toISOString() });
}

/**
 * GET /api/admin/overview?period=2025/2026
 */
async function overview(req, res) {
  try {
    const period = req.query.period || '2025/2026';
    const data = await adminService.getOverview(period);
    res.json({ status: 'ok', data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

/**
 * GET /api/admin/tenants
 */
async function tenants(req, res) {
  try {
    const data = await adminService.getTenants();
    res.json({ status: 'ok', data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

/**
 * GET /api/admin/health
 */
async function health(req, res) {
  try {
    const data = await adminService.getSystemHealth();
    res.json({ status: 'ok', data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

/**
 * GET /api/admin/activity
 */
async function activity(req, res) {
  try {
    const data = await adminService.getActivity();
    res.json({ status: 'ok', data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { requireAdminKey, ping, overview, tenants, health, activity };
