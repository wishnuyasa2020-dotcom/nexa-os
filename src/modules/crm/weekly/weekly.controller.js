'use strict';
/**
 * weekly.controller.js
 * HTTP handler untuk modul Weekly Planning.
 */

const weeklyService = require('./weekly.service');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/weekly/backlog?search=&period=
// ─────────────────────────────────────────────────────────────────────────────
async function getBacklog(req, res) {
  try {
    const data = await weeklyService.getBacklog(req.user, req.query);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[weekly] getBacklog Error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/weekly/board?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// ─────────────────────────────────────────────────────────────────────────────
async function getBoardItems(req, res) {
  try {
    const data = await weeklyService.getBoardItems(req.user, req.query);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[weekly] getBoardItems Error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/weekly/schedule
// body: { taskId, tanggal }
// ─────────────────────────────────────────────────────────────────────────────
async function scheduleTask(req, res) {
  try {
    const data = await weeklyService.scheduleTask(req.user, req.body);
    res.status(201).json({ status: 'ok', data });
  } catch (err) {
    console.error('[weekly] scheduleTask Error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/weekly/agenda/:agendaId/reschedule
// body: { newTanggal }
// ─────────────────────────────────────────────────────────────────────────────
async function rescheduleTask(req, res) {
  try {
    const data = await weeklyService.rescheduleTask(req.user, req.params.agendaId, req.body);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[weekly] rescheduleTask Error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/weekly/agenda/:agendaId
// Kembalikan ke backlog (due_date = NULL)
// ─────────────────────────────────────────────────────────────────────────────
async function unscheduleTask(req, res) {
  try {
    const data = await weeklyService.unscheduleTask(req.user, req.params.agendaId);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[weekly] unscheduleTask Error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  getBacklog,
  getBoardItems,
  scheduleTask,
  rescheduleTask,
  unscheduleTask,
};
