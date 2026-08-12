'use strict';

const { Router } = require('express');
const ctrl = require('./admin.controller');

const router = Router();

// Semua route /api/admin/* dilindungi oleh NEXA_ADMIN_KEY
router.use(ctrl.requireAdminKey);

router.get('/ping',     ctrl.ping);
router.get('/overview', ctrl.overview);
router.get('/tenants',  ctrl.tenants);
router.get('/health',   ctrl.health);
router.get('/activity', ctrl.activity);

module.exports = router;
