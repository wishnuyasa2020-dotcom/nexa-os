'use strict';

const { Router } = require('express');
const ctrl        = require('./crm.controller');
const { requireAuth } = require('../../middleware/requireAuth');

const router = Router();

// Semua API CRM (kecuali auth) membutuhkan token JWT
router.use(requireAuth);

router.get('/initial-data', ctrl.getInitialData);

module.exports = router;
