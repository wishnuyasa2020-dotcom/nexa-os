'use strict';

/**
 * crm.siswa.controller.js
 * Controller RESTful untuk Modul Siswa — nexa-crm-web integration
 */

const svc = require('./crm.siswa.service');

// ── GET /api/v1/siswa ──────────────────────────────────────────────────────
async function getList(req, res) {
  try {
    const data = await svc.listSiswa(req.user, req.query);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[siswa] getList Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ── GET /api/v1/siswa/:id ──────────────────────────────────────────────────
async function getDetail(req, res) {
  try {
    const data = await svc.detailSiswa(req.params.id, req.user, req.query);
    if (!data) return res.status(404).json({ status: 'error', message: 'Siswa tidak ditemukan.' });
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[siswa] getDetail Error:', err);
    res.status(err.message.includes('Unauthorized') ? 403 : 500).json({ status: 'error', message: err.message });
  }
}

// ── POST /api/v1/siswa ─────────────────────────────────────────────────────
async function createSiswa(req, res) {
  try {
    const data = await svc.tambahSiswa(req.body, req.user);
    res.status(201).json({ status: 'ok', data });
  } catch (err) {
    console.error('[siswa] createSiswa Error:', err);
    const code = err.message.includes('sudah terdaftar') ? 409 : (err.message.includes('Kuota input') ? 403 : 400);
    res.status(code).json({ status: 'error', message: err.message });
  }
}

// ── PUT /api/v1/siswa/:id ──────────────────────────────────────────────────
async function updateSiswa(req, res) {
  try {
    const data = await svc.editSiswa(req.params.id, req.body, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[siswa] updateSiswa Error:', err);
    res.status(err.message.includes('Hanya Admin') ? 403 : 400).json({ status: 'error', message: err.message });
  }
}

// ── DELETE /api/v1/siswa/:id ───────────────────────────────────────────────
async function deleteSiswa(req, res) {
  try {
    await svc.hapusSiswa(req.params.id, req.user);
    res.json({ status: 'ok', message: 'Siswa berhasil dihapus secara permanen.' });
  } catch (err) {
    console.error('[siswa] deleteSiswa Error:', err);
    if (err.message === 'BLOCKED_HAS_ACTIVITY') {
      return res.status(403).json({ status: 'error', reason: 'has_activity', message: 'Siswa sudah memiliki riwayat aktivitas. Gunakan status Tidak Lanjut.' });
    }
    res.status(err.message.includes('Hanya Admin') ? 403 : 500).json({ status: 'error', message: err.message });
  }
}

// ── POST /api/v1/siswa/:id/aktivitas ──────────────────────────────────────
async function addAktivitas(req, res) {
  try {
    const data = await svc.inputAktivitas(req.params.id, req.body, req.user);
    res.status(201).json({ status: 'ok', data });
  } catch (err) {
    console.error('[siswa] addAktivitas Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

// ── POST /api/v1/siswa/batch ───────────────────────────────────────────────
async function importBatch(req, res) {
  try {
    const { dataBatch, croName } = req.body;
    const data = await svc.importBatch(dataBatch, croName, req.user);
    res.status(201).json({ status: 'ok', data });
  } catch (err) {
    console.error('[siswa] importBatch Error:', err);
    const code = err.message.includes('Kuota input') ? 403 : 400;
    res.status(code).json({ status: 'error', message: err.message });
  }
}


module.exports = {
  getList,
  getDetail,
  createSiswa,
  updateSiswa,
  deleteSiswa,
  addAktivitas,
  importBatch
};
