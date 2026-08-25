'use strict';

const { Router } = require('express');
const ctrl = require('./admin.controller');

const router = Router();

// Semua route /api/admin/* dilindungi oleh NEXA_ADMIN_KEY
router.use(ctrl.requireAdminKey);

router.get('/ping',     ctrl.ping);
router.get('/overview', ctrl.overview);
router.get('/tenant',   ctrl.tenant);
router.post('/tenant',  ctrl.addTenant);
router.post('/tenant/addon', ctrl.addonCro);
router.get('/usage',    ctrl.usage);
router.get('/users',    ctrl.users);
router.get('/health',   ctrl.health);
router.get('/activity', ctrl.activity);

module.exports = router;
