'use strict';

/**
 * crm.sekolah.controller.js
 * Controller RESTful untuk Modul Sekolah — nexa-crm-web integration
 */

const svc = require('./crm.sekolah.service');

// ── GET /api/v1/sekolah ──────────────────────────────────────────────────────
async function getList(req, res) {
  try {
    const data = await svc.listSekolah(req.user, req.query);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[sekolah] getList Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ── GET /api/v1/sekolah/stats ────────────────────────────────────────────────
async function getStats(req, res) {
  try {
    const data = await svc.statSekolah(req.user, req.query);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[sekolah] getStats Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ── GET /api/v1/sekolah/utils/kecamatan-list ────────────────────────────────
async function getKecamatanList(req, res) {
  try {
    const data = await svc.getKecamatanList();
    res.json({ status: 'ok', data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ── GET /api/v1/sekolah/utils/cro-list ──────────────────────────────────────
async function getCROList(req, res) {
  try {
    const data = await svc.getCROList();
    res.json({ status: 'ok', data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ── GET /api/v1/sekolah/:id ──────────────────────────────────────────────────
async function getDetail(req, res) {
  try {
    const data = await svc.detailSekolah(req.params.id, req.user, req.query);
    if (!data) return res.status(404).json({ status: 'error', message: 'Sekolah tidak ditemukan.' });
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[sekolah] getDetail Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ── POST /api/v1/sekolah ─────────────────────────────────────────────────────
async function createSekolah(req, res) {
  try {
    const data = await svc.tambahSekolah(req.body, req.user);
    res.status(201).json({ status: 'ok', data });
  } catch (err) {
    console.error('[sekolah] createSekolah Error:', err);
    const code = err.message.includes('sudah terdaftar') ? 409 : (err.message.includes('Kuota input') ? 403 : 400);
    res.status(code).json({ status: 'error', message: err.message });
  }
}

// ── PUT /api/v1/sekolah/:id ──────────────────────────────────────────────────
async function updateSekolah(req, res) {
  try {
    const data = await svc.editSekolah(req.params.id, req.body, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[sekolah] updateSekolah Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

// ── DELETE /api/v1/sekolah/:id ───────────────────────────────────────────────
async function deleteSekolah(req, res) {
  try {
    const { alasan } = req.body;
    await svc.hapusSekolah(req.params.id, alasan, req.user);
    res.json({ status: 'ok', message: 'Sekolah berhasil dihapus.' });
  } catch (err) {
    console.error('[sekolah] deleteSekolah Error:', err);

    // Return structured error agar frontend bisa beda handling
    const blockedMap = {
      'BLOCKED_HAS_ACTIVITY':  { code: 403, reason: 'has_activity' },
      'BLOCKED_LEAD_CAPTURED': { code: 403, reason: 'lead_captured' },
      'BLOCKED_ACTIVE_TASK':   { code: 403, reason: 'active_task' },
    };
    const blocked = blockedMap[err.message];
    if (blocked) {
      return res.status(blocked.code).json({ status: 'error', reason: blocked.reason, message: err.message });
    }
    res.status(err.message.includes('hanya') ? 403 : 500).json({ status: 'error', message: err.message });
  }
}

// ── PATCH /api/v1/sekolah/:id/reassign ──────────────────────────────────────
async function reassignCRO(req, res) {
  try {
    const { croBaru, alasan } = req.body;
    const data = await svc.reassignCRO(req.params.id, croBaru, alasan, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[sekolah] reassignCRO Error:', err);
    res.status(err.message.includes('hanya') ? 403 : 400).json({ status: 'error', message: err.message });
  }
}

// ── POST /api/v1/sekolah/:id/aktivitas ──────────────────────────────────────
async function addAktivitas(req, res) {
  try {
    const data = await svc.inputAktivitas(req.params.id, req.body, req.user);
    res.status(201).json({ status: 'ok', data });
  } catch (err) {
    console.error('[sekolah] addAktivitas Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

// ── POST /api/v1/sekolah/:id/aktivitas-ekstra ───────────────────────────────
async function createAktivitasEkstra(req, res) {
  try {
    const data = await svc.buatAktivitasEkstra(req.params.id, req.body, req.user);
    res.status(201).json({ status: 'ok', data });
  } catch (err) {
    console.error('[sekolah] createAktivitasEkstra Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

// ── PATCH /api/v1/aktivitas-ekstra/:aeId/selesai ────────────────────────────
async function selesaikanEkstra(req, res) {
  try {
    const data = await svc.selesaikanAktivitasEkstra(req.params.aeId, req.body, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[sekolah] selesaikanEkstra Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

// ── PATCH /api/v1/aktivitas-ekstra/:aeId/batalkan ───────────────────────────
async function batalkanEkstra(req, res) {
  try {
    const data = await svc.batalkanAktivitasEkstra(req.params.aeId, req.body, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[sekolah] batalkanEkstra Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  getList,
  getStats,
  getKecamatanList,
  getCROList,
  getDetail,
  createSekolah,
  updateSekolah,
  deleteSekolah,
  reassignCRO,
  addAktivitas,
  createAktivitasEkstra,
  selesaikanEkstra,
  batalkanEkstra,
};
