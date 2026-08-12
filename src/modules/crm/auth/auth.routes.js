'use strict';

const { Router } = require('express');
const ctrl        = require('./auth.controller');
const { requireAuth } = require('../../../middleware/requireAuth');

const router = Router();

// POST /api/crm/auth/login   ← public
router.post('/login', ctrl.login);

// GET  /api/crm/auth/me      ← butuh token
router.get('/me', requireAuth, ctrl.me);

module.exports = router;
