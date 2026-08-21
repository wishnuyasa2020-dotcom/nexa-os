'use strict';

/**
 * template.controller.js
 * HTTP handler untuk Modul Template Manager
 */

const templateService = require('./template.service');

// GET /api/v1/templates
async function getTemplates(req, res) {
  try {
    const data = await templateService.getTemplates(req.query);
    res.json({ status: 'ok', data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// POST /api/v1/templates
async function createTemplate(req, res) {
  try {
    const result = await templateService.createTemplate(req.body);
    res.status(201).json({ status: 'ok', ...result });
  } catch (err) {
    const is400 = err.message.includes('wajib');
    res.status(is400 ? 400 : 500).json({ status: 'error', message: err.message });
  }
}

// PUT /api/v1/templates/:id
async function updateTemplate(req, res) {
  try {
    const result = await templateService.updateTemplate(req.params.id, req.body);
    res.json({ status: 'ok', ...result });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// POST /api/v1/templates/sync
async function syncMetaStatus(req, res) {
  try {
    const result = await templateService.syncMetaStatus();
    res.json({ status: 'ok', ...result });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { getTemplates, createTemplate, updateTemplate, syncMetaStatus };
