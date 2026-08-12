'use strict';

const crmService = require('./crm.service');

/**
 * GET /api/crm/initial-data
 * Header: Authorization: Bearer <token>
 */
async function getInitialData(req, res) {
  try {
    const data = await crmService.getInitialData(req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { getInitialData };
