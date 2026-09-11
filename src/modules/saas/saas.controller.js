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

/**
 * GET /api/v1/saas/beta-status
 * Endpoint Publik: Mengecek status ketersediaan kuota Closed Beta
 */
async function getBetaStatus(req, res) {
  try {
    const status = await saasService.getBetaStatus();
    return res.json({
      status: 'ok',
      data: status,
    });
  } catch (err) {
    console.error('[SaaS Controller] getBetaStatus error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

/**
 * POST /api/v1/saas/apply-beta
 * Endpoint Publik: Pendaftaran Kurasi Beta + Kuesioner SQL B2B
 */
async function applyBeta(req, res) {
  try {
    const {
      brand_name,
      institution_type,
      institution_address,
      team_size,
      admin_name,
      admin_email,
      admin_password,
      whatsapp_number,
    } = req.body;

    const data = await saasService.applyBetaApplication({
      brand_name,
      institution_type,
      institution_address,
      team_size,
      admin_name,
      admin_email,
      admin_password,
      whatsapp_number,
    });

    return res.status(201).json({
      status: 'ok',
      message: data.message,
      data,
    });
  } catch (err) {
    console.error('[SaaS Controller] applyBeta error:', err);
    const statusCode = err.statusCode || (err.message.includes('wajib') || err.message.includes('terdaftar') || err.message.includes('valid') ? 400 : 500);
    return res.status(statusCode).json({
      status: 'error',
      message: err.message || 'Terjadi kesalahan sistem saat mengajukan permohonan beta.',
    });
  }
}

/**
 * GET /api/admin/beta-applications
 * Endpoint Super Admin: Daftar seluruh permohonan beta
 */
async function getBetaApplications(req, res) {
  try {
    const { status } = req.query;
    const [list, betaStats] = await Promise.all([
      saasService.listBetaApplications({ status }),
      saasService.getBetaStatus(),
    ]);

    return res.json({
      status: 'ok',
      data: {
        stats: betaStats,
        applications: list,
      },
    });
  } catch (err) {
    console.error('[SaaS Controller] getBetaApplications error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

/**
 * POST /api/admin/beta-applications/:id/approve
 * Endpoint Super Admin: Menyetujui permohonan beta & auto-provisioning DB
 */
async function approveBetaApplication(req, res) {
  try {
    const { id } = req.params;
    const reviewerName = req.admin?.name || req.admin?.username || 'Super Admin';

    const result = await saasService.approveBetaApplication(id, reviewerName);

    return res.json({
      status: 'ok',
      message: `Permohonan untuk "${result.brandName}" berhasil disetujui! Database ${result.claimedDb} telah dialokasikan.`,
      data: result,
    });
  } catch (err) {
    console.error('[SaaS Controller] approveBetaApplication error:', err);
    const statusCode = err.statusCode || (err.message.includes('ditemukan') || err.message.includes('sudah') ? 400 : 500);
    return res.status(statusCode).json({ status: 'error', message: err.message });
  }
}

/**
 * PUT /api/admin/beta-applications/:id/status
 * Endpoint Super Admin: Update status permohonan beta (WAITLIST / REJECTED)
 */
async function updateBetaApplicationStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const reviewerName = req.admin?.name || req.admin?.username || 'Super Admin';

    const result = await saasService.updateBetaApplicationStatus(id, { status, notes, reviewerName });

    return res.json({
      status: 'ok',
      message: `Status permohonan berhasil diperbarui menjadi ${status}.`,
      data: result,
    });
  } catch (err) {
    console.error('[SaaS Controller] updateBetaApplicationStatus error:', err);
    return res.status(400).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  register,
  getPoolStatus,
  getPoolOverview,
  addPool,
  deletePool,
  getBetaStatus,
  applyBeta,
  getBetaApplications,
  approveBetaApplication,
  updateBetaApplicationStatus,
};

