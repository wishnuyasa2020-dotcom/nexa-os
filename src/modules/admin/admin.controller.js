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
  res.json({
    status: 'ok',
    data: { pong: true, message: 'Nexa OS Express API is alive.', ts: new Date().toISOString() }
  });
}

/**
 * GET /api/admin/overview
 */
async function overview(req, res) {
  try {
    const data = await adminService.getOverview();
    res.json({ status: 'ok', data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

/**
 * GET /api/admin/tenant
 */
async function tenant(req, res) {
  try {
    const data = await adminService.getTenant();
    res.json({ status: 'ok', data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

/**
 * GET /api/admin/usage
 */
async function usage(req, res) {
  try {
    const data = await adminService.getUsageStats();
    res.json({ status: 'ok', data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

/**
 * GET /api/admin/users
 */
async function users(req, res) {
  try {
    const data = await adminService.getUserList();
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

/**
 * POST /api/admin/tenant
 */
async function addTenant(req, res) {
  try {
    const { brand, tier, maxCro, dbHost, dbName, dbUser, dbPass, adminEmail } = req.body;
    if (!brand || !dbHost || !dbName || !dbUser || !dbPass || !adminEmail) {
      return res.status(400).json({ status: 'error', message: 'Semua field wajib diisi' });
    }
    const data = await adminService.provisionNewTenant(req.body);
    res.json({ status: 'ok', data, message: 'Tenant berhasil diprovisioning' });
  } catch (err) {
    console.error('addTenant Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

/**
 * POST /api/admin/tenant/addon
 */
async function addonCro(req, res) {
  try {
    const { tenantId, tambahanCro } = req.body;
    if (!tenantId || !tambahanCro || tambahanCro <= 0) {
      return res.status(400).json({ status: 'error', message: 'Input tidak valid' });
    }
    const data = await adminService.addCroQuota(req.body);
    res.json({ status: 'ok', data, message: 'Kuota berhasil ditambah' });
  } catch (err) {
    console.error('addonCro Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

/**
 * PUT /api/admin/tenant/tier
 */
async function updateTier(req, res) {
  try {
    const { tenantId, tier } = req.body;
    if (!tenantId || !tier) {
      return res.status(400).json({ status: 'error', message: 'Input tidak valid' });
    }
    const data = await adminService.updateTenantTier(req.body);
    res.json({ status: 'ok', data, message: 'Paket berhasil diubah' });
  } catch (err) {
    console.error('updateTier Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { requireAdminKey, ping, overview, tenant, addTenant, addonCro, updateTier, usage, users, health, activity };
