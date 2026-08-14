'use strict';

const { Router } = require('express');
const ctrl        = require('./crm.controller');
const { requireAuth } = require('../../middleware/requireAuth');

const router = Router();

// Semua API CRM (kecuali auth) membutuhkan token JWT
router.use(requireAuth);

router.get('/initial-data', ctrl.getInitialData);
router.post('/sekolah/list', ctrl.getAllSekolah);
router.post('/sekolah/add', ctrl.addSekolah);
router.post('/sekolah/update', ctrl.updateSekolah);
router.post('/sekolah/update-aktivitas-terakhir', ctrl.updateLastAktivitasSekolah);
router.post('/sekolah/add-aktivitas', ctrl.addAktivitasSekolah);
router.post('/siswa/list', ctrl.getAllSiswa);
router.post('/siswa/detail', ctrl.getSiswaById);
router.post('/siswa/add', ctrl.addSiswa);
router.post('/siswa/update', ctrl.updateSiswa);
router.post('/siswa/add-batch', ctrl.addSiswaBatch);
router.post('/siswa/update-aktivitas-terakhir', ctrl.updateLastAktivitasSiswa);
router.post('/siswa/add-aktivitas', ctrl.addAktivitasSiswa);
router.post('/siswa/by-phone', ctrl.getSiswaByPhone);

// Dashboard routes
router.post('/dashboard/summary', ctrl.getDashboardSummary);
router.post('/dashboard/tasks', ctrl.getDashboardTasks);
router.post('/dashboard/funnels', ctrl.getDashboardFunnels);
router.post('/dashboard/aktivitas', ctrl.getDashboardAktivitas);
router.post('/dashboard/kecamatan', ctrl.getDashboardKecamatan);

// Dropdown & Modal Utils
router.get('/utils/sekolah-dropdown', ctrl.getSekolahDropdown);
router.get('/utils/periods', ctrl.getAllMarketingPeriods);
router.get('/utils/active-period', ctrl.getActiveMarketingPeriod);
router.get('/utils/carry-forward', ctrl.getCarryForwardStatus);
router.post('/siswa/detail', ctrl.getSiswaById);
router.post('/sekolah/detail', ctrl.getSekolahById);

// Task List
router.post('/tasklist/get', ctrl.getTaskList);

// Weekly Planning
router.post('/weekly/data', ctrl.getWeeklyPlanningData);
router.post('/weekly/create', ctrl.createAgenda);
router.post('/weekly/update', ctrl.updateAgenda);
router.post('/weekly/delete', ctrl.deleteAgenda);

// Home Visit
router.post('/homevisit/list', ctrl.getAllHomeVisit);
router.post('/homevisit/detail', ctrl.getHomeVisitById);
router.post('/homevisit/create', ctrl.createHomeVisit);
router.post('/homevisit/add-aktivitas', ctrl.addAktivitasHomeVisit);

// Broadcast
router.post('/broadcast/sekolah', ctrl.getBroadcastSekolahList);
router.post('/broadcast/history', ctrl.getBroadcastHistory);
router.post('/broadcast/preview', ctrl.getBroadcastTargetPreview);
router.post('/broadcast/create', ctrl.createBroadcast);
router.post('/broadcast/progress', ctrl.getBroadcastProgress);
router.post('/broadcast/check-history', ctrl.checkTemplateHistory);

// Nurturing
router.post('/nurturing/dashboard', ctrl.getNurturingDashboardData);
router.post('/nurturing/snooze', ctrl.getSnoozeDashboardData);

module.exports = router;
