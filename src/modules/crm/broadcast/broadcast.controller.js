'use strict';

/**
 * broadcast.controller.js
 * HTTP handler untuk Modul Broadcast.
 * Menerima request, validasi ringan, delegasi ke broadcast.service.
 */

const broadcastService = require('./broadcast.service');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/broadcast/audience
// Query: ?search=&statusPipeline=&page=1&limit=50
// ─────────────────────────────────────────────────────────────────────────────
async function getAudience(req, res) {
  try {
    const data = await broadcastService.getAudience(req.user, req.query);
    res.json({ status: 'ok', ...data });
  } catch (err) {
    console.error('[broadcast] getAudience Error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/broadcast/history
// Query: ?page=1&limit=20
// ─────────────────────────────────────────────────────────────────────────────
async function getBroadcastHistory(req, res) {
  try {
    const data = await broadcastService.getBroadcastHistory(req.user, req.query);
    res.json({ status: 'ok', ...data });
  } catch (err) {
    console.error('[broadcast] getBroadcastHistory Error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/broadcast/templates/meta
// ─────────────────────────────────────────────────────────────────────────────
async function getMetaTemplates(req, res) {
  try {
    const data = await broadcastService.getMetaTemplates();
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[broadcast] getMetaTemplates Error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/broadcast/templates/crm
// ─────────────────────────────────────────────────────────────────────────────
async function getCrmTemplates(req, res) {
  try {
    const data = await broadcastService.getCrmTemplates();
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[broadcast] getCrmTemplates Error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/broadcast/send
// Body: { targetIds[], metaTemplateId, crmTemplateId, namaCampaign? }
// Response: 202 Accepted
// ─────────────────────────────────────────────────────────────────────────────
async function sendBroadcast(req, res) {
  try {
    const result = await broadcastService.createBroadcastJob(req.user, req.body);
    res.status(202).json({ status: 'ok', data: result });
  } catch (err) {
    console.error('[broadcast] sendBroadcast Error:', err.message);
    const status = err.message.includes('harus') ? 400 : 500;
    res.status(status).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/broadcast/audience/schools
// ─────────────────────────────────────────────────────────────────────────────
async function getSchoolList(req, res) {
  try {
    const data = await broadcastService.getSchoolList(req.user, req.query);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[broadcast] getSchoolList Error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKWARD-COMPAT handlers — untuk POST routes lama yang ada di crm.routes.js
// ─────────────────────────────────────────────────────────────────────────────
async function getBroadcastSekolahList(req, res) {
  try {
    const data = await broadcastService.getBroadcastSekolahListLegacy(req.user, req.body);
    res.json({ status: 'ok', ...data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getBroadcastHistoryLegacy(req, res) {
  // Delegasikan ke implementasi baru dengan query params dari body
  try {
    const data = await broadcastService.getBroadcastHistory(req.user, {
      page : req.body.page  || 1,
      limit: req.body.limit || 20,
    });
    res.json({ status: 'ok', ...data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getBroadcastTargetPreview(req, res) {
  try {
    const data = await broadcastService.getBroadcastTargetPreview(req.user, req.body);
    res.json({ status: 'ok', ...data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function createBroadcast(req, res) {
  // Legacy POST /broadcast/create → delegasi ke sendBroadcast
  try {
    const result = await broadcastService.createBroadcastJob(req.user, {
      targetIds      : req.body.targetIds || [],
      metaTemplateId : req.body.metaTemplateId || req.body.templateId || null,
      crmTemplateId  : req.body.crmTemplateId || null,
      namaCampaign   : req.body.namaCampaign || null,
    });
    res.status(202).json({ status: 'ok', data: result });
  } catch (err) {
    const status = err.message.includes('harus') ? 400 : 500;
    res.status(status).json({ status: 'error', message: err.message });
  }
}

async function getBroadcastProgress(req, res) {
  try {
    const data = await broadcastService.getBroadcastProgress(req.user, req.body);
    res.json({ status: 'ok', ...data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function checkTemplateHistory(req, res) {
  try {
    const data = await broadcastService.checkTemplateHistory(req.user, req.body);
    res.json({ status: 'ok', ...data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  // V1 RESTful
  getAudience,
  getSchoolList,
  getBroadcastHistory,
  getMetaTemplates,
  getCrmTemplates,
  sendBroadcast,
  // Legacy POST backward-compat
  getBroadcastSekolahList,
  getBroadcastHistoryLegacy,
  getBroadcastTargetPreview,
  createBroadcast,
  getBroadcastProgress,
  checkTemplateHistory,
};
