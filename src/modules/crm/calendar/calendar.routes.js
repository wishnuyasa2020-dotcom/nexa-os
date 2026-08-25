'use strict';

const { Router } = require('express');
const ctrl = require('./calendar.controller');
const { requireAuth } = require('../../../middleware/requireAuth');

const router = Router();

// GET /api/v1/calendar/auth-url
router.get('/auth-url', requireAuth, ctrl.getAuthUrl);

// GET /api/v1/calendar/callback
// Callback dari Google, jadi nggak pakai requireAuth karena di-redirect langsung dari browser
router.get('/callback', ctrl.oauthCallback);

// GET /api/v1/calendar/status
router.get('/status', requireAuth, ctrl.getConnectionStatus);

// POST /api/v1/calendar/disconnect
router.post('/disconnect', requireAuth, ctrl.disconnect);

module.exports = router;
