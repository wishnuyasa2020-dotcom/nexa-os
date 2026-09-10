'use strict';

/**
 * nurturing.controller.js
 * HTTP handlers untuk Modul Automated Nurturing & Snooze Campaign.
 * Menerima request, validasi ringan, delegasi ke nurturing.service.
 */

const svc = require('./nurturing.service');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/nurturing/stats
// ─────────────────────────────────────────────────────────────────────────────
async function getStats(req, res) {
  try {
    const data = await svc.getStats(req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[nurturing] getStats Error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/nurturing/leads
// Query: ?page=1&limit=20&search=
// ─────────────────────────────────────────────────────────────────────────────
async function getLeads(req, res) {
  try {
    const data = await svc.getLeads(req.user, req.query);
    res.json({ status: 'ok', ...data });
  } catch (err) {
    console.error('[nurturing] getLeads Error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/nurturing/snooze/stats
// ─────────────────────────────────────────────────────────────────────────────
async function getSnoozeStats(req, res) {
  try {
    const data = await svc.getSnoozeStats(req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[nurturing] getSnoozeStats Error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/nurturing/snooze/leads
// Query: ?page=1&limit=20&search=
// ─────────────────────────────────────────────────────────────────────────────
async function getSnoozeLeads(req, res) {
  try {
    const data = await svc.getSnoozeLeads(req.user, req.query);
    res.json({ status: 'ok', ...data });
  } catch (err) {
    console.error('[nurturing] getSnoozeLeads Error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/nurturing/force-trigger
// Memaksa jalannya cron job saat ini juga (untuk testing / manual run)
// ─────────────────────────────────────────────────────────────────────────────
async function forceTrigger(req, res) {
  try {
    console.log(`[nurturing] Force trigger oleh: ${req.user.nama}`);
    const [nurturing, snooze] = await Promise.all([
      svc.runNurturingCron(),
      svc.runSnoozeCron(),
    ]);
    res.json({
      status: 'ok',
      message: 'Cron job berhasil dijalankan.',
      result: { nurturing, snooze },
    });
  } catch (err) {
    console.error('[nurturing] forceTrigger Error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/nurturing/takeover/:id
// Menghentikan bot dan mengambil alih percakapan secara manual
// ─────────────────────────────────────────────────────────────────────────────
async function takeoverLead(req, res) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ status: 'error', message: 'ID siswa diperlukan.' });

    const result = await svc.takeoverLead(id, req.user);
    res.json({ status: 'ok', ...result });
  } catch (err) {
    console.error('[nurturing] takeoverLead Error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/nurturing/snooze/request & /api/v1/nurturing/snooze/add
// Body: { idSiswa / id_siswa, interval_days, alasan }
// ─────────────────────────────────────────────────────────────────────────────
async function requestSnooze(req, res) {
  try {
    const idSiswa = req.body.idSiswa || req.body.id_siswa;
    const interval_days = req.body.interval_days || req.body.intervalDays;
    const alasan = req.body.alasan;

    if (!idSiswa) return res.status(400).json({ status: 'error', message: 'ID siswa (idSiswa / id_siswa) diperlukan.' });

    const result = await svc.addManualSnooze(idSiswa, { interval_days, alasan }, req.user);
    res.status(201).json({ status: 'ok', ...result });
  } catch (err) {
    console.error('[nurturing] requestSnooze Error:', err.message);
    const status = err.status || 500;
    res.status(status).json({ status: 'error', message: err.message });
  }
}

async function addSnooze(req, res) {
  return requestSnooze(req, res);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/nurturing/start/:id
// Mendaftarkan siswa ke kampanye probing (Event: NurturingStarted)
// ─────────────────────────────────────────────────────────────────────────────
async function startNurturing(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    if (!id) return res.status(400).json({ status: 'error', message: 'ID siswa diperlukan.' });

    const result = await svc.startNurturing(id, req.user, reason);
    res.status(201).json({ status: 'ok', ...result });
  } catch (err) {
    console.error('[nurturing] startNurturing Error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/nurturing/snooze/wakeup & DELETE /api/v1/nurturing/snooze/:id
// Hentikan snooze lebih awal (Bangunkan Paksa)
// ─────────────────────────────────────────────────────────────────────────────
async function wakeupSnooze(req, res) {
  try {
    const idSiswa = req.body?.idSiswa || req.body?.id_siswa || req.params?.id;
    if (!idSiswa) return res.status(400).json({ status: 'error', message: 'ID siswa diperlukan.' });

    const result = await svc.stopSnooze(idSiswa, req.user);
    res.json({ status: 'ok', ...result });
  } catch (err) {
    console.error('[nurturing] wakeupSnooze Error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function stopSnooze(req, res) {
  return wakeupSnooze(req, res);
}

module.exports = {
  getStats,
  getLeads,
  getSnoozeStats,
  getSnoozeLeads,
  forceTrigger,
  takeoverLead,
  startNurturing,
  requestSnooze,
  wakeupSnooze,
  addSnooze,
  stopSnooze,
};
