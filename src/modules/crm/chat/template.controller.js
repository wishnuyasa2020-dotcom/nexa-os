'use strict';

/**
 * template.controller.js
 * HTTP handler untuk Modul Template Manager
 */

const templateService = require('./template.service');

// GET /api/v1/templates
async function getTemplates(req, res) {
  try {
    const result = await templateService.getTemplates(req.query);
    res.json({ status: 'ok', ...result });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// GET /api/v1/templates/:id
async function getTemplate(req, res) {
  try {
    const data = await templateService.getTemplateById(req.params.id);
    res.json({ status: 'ok', data });
  } catch (err) {
    const is404 = err.message.includes('tidak ditemukan');
    res.status(is404 ? 404 : 500).json({ status: 'error', message: err.message });
  }
}

// POST /api/v1/templates
async function createTemplate(req, res) {
  try {
    const result = await templateService.createTemplate(req.body);
    res.status(201).json({ status: 'ok', ...result });
  } catch (err) {
    const is400 = err.message.includes('wajib') || err.message.includes('tidak valid');
    res.status(is400 ? 400 : 500).json({ status: 'error', message: err.message });
  }
}

// PUT /api/v1/templates/:id
async function updateTemplate(req, res) {
  try {
    const result = await templateService.updateTemplate(req.params.id, req.body);
    res.json({ status: 'ok', ...result });
  } catch (err) {
    const is404 = err.message.includes('tidak ditemukan');
    res.status(is404 ? 404 : 500).json({ status: 'error', message: err.message });
  }
}

// PATCH /api/v1/templates/:id/parameters
async function updateParameters(req, res) {
  try {
    const result = await templateService.updateParameters(req.params.id, req.body.parameters || req.body);
    res.json({ status: 'ok', ...result });
  } catch (err) {
    const is400 = err.message.includes('tidak valid');
    const is404 = err.message.includes('tidak ditemukan');
    res.status(is404 ? 404 : is400 ? 400 : 500).json({ status: 'error', message: err.message });
  }
}

// DELETE /api/v1/templates/:id  (soft delete)
async function deleteTemplate(req, res) {
  try {
    const result = await templateService.deleteTemplate(req.params.id);
    res.json({ status: 'ok', ...result });
  } catch (err) {
    const is404 = err.message.includes('tidak ditemukan');
    res.status(is404 ? 404 : 500).json({ status: 'error', message: err.message });
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

module.exports = {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  updateParameters,
  deleteTemplate,
  syncMetaStatus,
};
