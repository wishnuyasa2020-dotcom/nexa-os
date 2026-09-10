'use strict';

const cohortService = require('./cohort.service');

function _checkAdminOrManager(user) {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  return role === 'admin' || role === 'manager';
}

/**
 * GET /api/v1/cohorts
 * Mengambil daftar seluruh Cohort
 */
async function getAllCohorts(req, res) {
  try {
    const data = await cohortService.getAllCohorts();
    return res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[CohortController] Error getAllCohorts:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Gagal memuat daftar Cohort' });
  }
}

/**
 * GET /api/v1/cohorts/:id
 * Mengambil detail satu Cohort
 */
async function getCohortById(req, res) {
  try {
    const data = await cohortService.getCohortById(req.params.id);
    return res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[CohortController] Error getCohortById:', err);
    return res.status(404).json({ status: 'error', message: err.message || 'Cohort tidak ditemukan' });
  }
}

/**
 * POST /api/v1/cohorts
 * Membuat Cohort baru (Admin & Manager)
 */
async function createCohort(req, res) {
  if (!_checkAdminOrManager(req.user)) {
    return res.status(403).json({
      status: 'error',
      message: 'Akses Ditolak: Hanya Administrator dan Manager yang berhak membuat Cohort baru.',
    });
  }

  try {
    const actor = req.user?.nama || req.user?.username || 'Admin';
    const result = await cohortService.createCohort(req.body, actor);
    return res.status(201).json({ status: 'ok', message: 'Cohort berhasil dibuat', data: result });
  } catch (err) {
    console.error('[CohortController] Error createCohort:', err);
    return res.status(400).json({ status: 'error', message: err.message || 'Gagal membuat Cohort' });
  }
}

/**
 * POST /api/v1/cohorts/:id/set-active
 * Mengaktifkan Cohort (Admin & Manager)
 */
async function setActiveCohort(req, res) {
  if (!_checkAdminOrManager(req.user)) {
    return res.status(403).json({
      status: 'error',
      message: 'Akses Ditolak: Hanya Administrator dan Manager yang berhak mengubah status aktif Cohort.',
    });
  }

  try {
    const actor = req.user?.nama || req.user?.username || 'Admin';
    const result = await cohortService.setActiveCohort(req.params.id, actor);
    return res.json({ status: 'ok', message: result.message, data: result });
  } catch (err) {
    console.error('[CohortController] Error setActiveCohort:', err);
    return res.status(400).json({ status: 'error', message: err.message || 'Gagal mengaktifkan Cohort' });
  }
}

/**
 * POST /api/v1/cohorts/:id/archive
 * Mengarsipkan Cohort (Admin & Manager)
 */
async function archiveCohort(req, res) {
  if (!_checkAdminOrManager(req.user)) {
    return res.status(403).json({
      status: 'error',
      message: 'Akses Ditolak: Hanya Administrator dan Manager yang berhak mengarsipkan Cohort.',
    });
  }

  try {
    const actor = req.user?.nama || req.user?.username || 'Admin';
    const result = await cohortService.archiveCohort(req.params.id, actor);
    return res.json({ status: 'ok', message: result.message, data: result });
  } catch (err) {
    console.error('[CohortController] Error archiveCohort:', err);
    return res.status(400).json({ status: 'error', message: err.message || 'Gagal mengarsipkan Cohort' });
  }
}

/**
 * POST /api/v1/cohorts/:id/re-entry-simulation
 * Dry-run simulasi penyaringan siswa untuk Re-entry (Admin & Manager)
 */
async function simulateReEntry(req, res) {
  if (!_checkAdminOrManager(req.user)) {
    return res.status(403).json({
      status: 'error',
      message: 'Akses Ditolak: Hanya Administrator dan Manager yang berhak melakukan simulasi Re-entry.',
    });
  }

  try {
    const result = await cohortService.simulateReEntry(req.params.id, req.body);
    return res.json({ status: 'ok', data: result });
  } catch (err) {
    console.error('[CohortController] Error simulateReEntry:', err);
    return res.status(400).json({ status: 'error', message: err.message || 'Gagal menjalankan simulasi Re-entry' });
  }
}

/**
 * POST /api/v1/cohorts/:id/execute-re-entry
 * Eksekusi massal Re-entry (Admin & Manager)
 */
async function executeReEntry(req, res) {
  if (!_checkAdminOrManager(req.user)) {
    return res.status(403).json({
      status: 'error',
      message: 'Akses Ditolak: Hanya Administrator dan Manager yang berhak mengeksekusi Re-entry massal.',
    });
  }

  try {
    const actor = req.user?.nama || req.user?.username || 'Admin';
    const result = await cohortService.executeReEntry(req.params.id, req.body, actor);
    return res.json({ status: 'ok', message: result.message, data: result });
  } catch (err) {
    console.error('[CohortController] Error executeReEntry:', err);
    return res.status(400).json({ status: 'error', message: err.message || 'Gagal mengeksekusi Re-entry' });
  }
}

module.exports = {
  getAllCohorts,
  getCohortById,
  createCohort,
  setActiveCohort,
  archiveCohort,
  simulateReEntry,
  executeReEntry,
};
