'use strict';

/**
 * saas.controller.js
 * Controller untuk endpoint publik pendaftaran SaaS & endpoint manajemen DB Pool Super Admin
 */

const saasService = require('./saas.service');

/**
 * POST /api/v1/saas/register
 * Endpoint Publik: Pendaftaran Klien Baru Mandiri (Self-Service Onboarding Free Tier)
 */
async function register(req, res) {
  try {
    const { brand_name, admin_name, admin_email, admin_password, whatsapp_number } = req.body;

    if (!brand_name || !admin_email || !admin_password) {
      return res.status(400).json({
        status: 'error',
        message: 'Nama Brand, Email Admin, dan Password wajib diisi.'
      });
    }

    const data = await saasService.registerTenantSelfService({
      brand_name,
      admin_name,
      admin_email,
      admin_password,
      whatsapp_number,
    });

    return res.status(201).json({
      status: 'ok',
      message: 'Pendaftaran berhasil! Akun dan sistem CRM Anda siap digunakan.',
      data,
    });
  } catch (err) {
    console.error('[SaaS Controller] register error:', err);
    const statusCode = err.statusCode || (err.message.includes('wajib') || err.message.includes('terdaftar') ? 400 : 500);
    return res.status(statusCode).json({
      status: 'error',
      message: err.message || 'Terjadi kesalahan pada sistem saat registrasi.',
    });
  }
}

/**
 * GET /api/v1/saas/pool-status
 * Endpoint Publik: Mengecek apakah pendaftaran sedang dibuka (ada DB available di pool)
 */
async function getPoolStatus(req, res) {
  try {
    const stats = await saasService.getPoolStats();
    return res.json({
      status: 'ok',
      data: {
        isAvailable: stats.is_ready_for_signup,
        availableSlots: stats.available,
        totalCapacity: stats.total,
      }
    });
  } catch (err) {
    console.error('[SaaS Controller] getPoolStatus error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

/**
 * GET /api/admin/db-pool
 * Endpoint Super Admin: Daftar seluruh database pool + ringkasan
 */
async function getPoolOverview(req, res) {
  try {
    const [stats, list] = await Promise.all([
      saasService.getPoolStats(),
      saasService.listPools(),
    ]);

    return res.json({
      status: 'ok',
      data: {
        stats,
        pools: list,
      }
    });
  } catch (err) {
    console.error('[SaaS Controller] getPoolOverview error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

/**
 * POST /api/admin/db-pool
 * Endpoint Super Admin: Mendaftarkan database kosong baru ke pool
 */
async function addPool(req, res) {
  try {
    const { dbHost, dbPort, dbName, dbUser, dbPassword, notes } = req.body;
    if (!dbHost || !dbName || !dbUser || !dbPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'Host, DB Name, DB User, dan DB Password wajib diisi.'
      });
    }

    const result = await saasService.addDatabaseToPool({
      dbHost,
      dbPort,
      dbName,
      dbUser,
      dbPassword,
      notes,
    });

    return res.status(201).json({
      status: 'ok',
      message: `Database ${dbName} berhasil didaftarkan ke pool.`,
      data: result,
    });
  } catch (err) {
    console.error('[SaaS Controller] addPool error:', err);
    return res.status(400).json({ status: 'error', message: err.message });
  }
}

/**
 * DELETE /api/admin/db-pool/:id
 * Endpoint Super Admin: Menghapus database dari pool (hanya jika AVAILABLE)
 */
async function deletePool(req, res) {
  try {
    const { id } = req.params;
    const result = await saasService.removeDatabaseFromPool(id);
    return res.json({
      status: 'ok',
      message: 'Database berhasil dihapus dari pool.',
      data: result,
    });
  } catch (err) {
    console.error('[SaaS Controller] deletePool error:', err);
    return res.status(400).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  register,
  getPoolStatus,
  getPoolOverview,
  addPool,
  deletePool,
};
