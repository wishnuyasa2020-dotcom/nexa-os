'use strict';

const { Router } = require('express');
const ctrl = require('./crm.controller');
const sekolahCtrl = require('./crm.sekolah.controller');
const siswaCtrl = require('./crm.siswa.controller');
const broadcastCtrl = require('./broadcast/broadcast.controller');
const weeklyCtrl = require('./weekly/weekly.controller');
const nurturingCtrl = require('./nurturing/nurturing.controller');
const chatCtrl = require('./chat/chat.controller');
const templateCtrl = require('./chat/template.controller');
const webpushCtrl = require('./chat/webpush.controller');
const userCtrl = require('./crm.user.controller');
const settingsCtrl = require('./crm.settings.controller');
const calendarRoutes = require('./calendar/calendar.routes');
const { requireAuth } = require('../../middleware/requireAuth');

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR SYNC — V1 RESTful (Didaftarkan sebelum requireAuth global)
// ─────────────────────────────────────────────────────────────────────────────
router.use('/calendar', calendarRoutes);

// Semua API CRM (kecuali auth & calendar callback) membutuhkan token JWT
router.use(requireAuth);

// ─────────────────────────────────────────────────────────────────────────────
// INITIAL DATA
// ─────────────────────────────────────────────────────────────────────────────
router.get('/initial-data', ctrl.getInitialData);

// ─────────────────────────────────────────────────────────────────────────────
// USERS — RESTful V1 (Manajemen Tim)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users', userCtrl.getList);
router.get('/users/:id', userCtrl.getDetail);
router.post('/users', userCtrl.create);
router.put('/users/:id', userCtrl.update);
router.patch('/users/:id/reset-password', userCtrl.resetPassword);
router.delete('/users/:id', userCtrl.remove);

// ─────────────────────────────────────────────────────────────────────────────
// SEKOLAH — RESTful V1 (nexa-crm-web)
// ─────────────────────────────────────────────────────────────────────────────
// GET    /api/v1/sekolah                         — List + filter
// GET    /api/v1/sekolah/stats                   — Ringkasan per status
// GET    /api/v1/sekolah/utils/kecamatan-list    — Kecamatan unik
// GET    /api/v1/sekolah/utils/cro-list          — Daftar CRO aktif
// GET    /api/v1/sekolah/:id                     — Detail sekolah
// POST   /api/v1/sekolah                         — Tambah sekolah
// PUT    /api/v1/sekolah/:id                     — Edit sekolah
// DELETE /api/v1/sekolah/:id                     — Hapus sekolah
// PATCH  /api/v1/sekolah/:id/reassign            — Ganti CRO
// POST   /api/v1/sekolah/:id/aktivitas           — Input aktivitas
// POST   /api/v1/sekolah/:id/aktivitas-ekstra    — Buat aktivitas ekstra
// PATCH  /api/v1/aktivitas-ekstra/:aeId/selesai  — Tandai selesai
// PATCH  /api/v1/aktivitas-ekstra/:aeId/batalkan — Tandai batal
// ─────────────────────────────────────────────────────────────────────────────
router.get('/sekolah/stats', sekolahCtrl.getStats);
router.get('/sekolah/utils/kecamatan-list', sekolahCtrl.getKecamatanList);
router.get('/sekolah/utils/cro-list', sekolahCtrl.getCROList);
router.get('/sekolah', sekolahCtrl.getList);
router.get('/sekolah/:id', sekolahCtrl.getDetail);
router.post('/sekolah', sekolahCtrl.createSekolah);
router.put('/sekolah/:id', sekolahCtrl.updateSekolah);
router.delete('/sekolah/:id', sekolahCtrl.deleteSekolah);
router.patch('/sekolah/:id/reassign', sekolahCtrl.reassignCRO);
router.post('/sekolah/:id/aktivitas', sekolahCtrl.addAktivitas);
router.post('/sekolah/:id/aktivitas-ekstra', sekolahCtrl.createAktivitasEkstra);
router.patch('/aktivitas-ekstra/:aeId/selesai', sekolahCtrl.selesaikanEkstra);
router.patch('/aktivitas-ekstra/:aeId/batalkan', sekolahCtrl.batalkanEkstra);

// ─────────────────────────────────────────────────────────────────────────────
// SISWA — RESTful V1 (nexa-crm-web)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/siswa', siswaCtrl.getList);
router.get('/siswa/:id', siswaCtrl.getDetail);
router.post('/siswa', siswaCtrl.createSiswa);
router.put('/siswa/:id', siswaCtrl.updateSiswa);
router.delete('/siswa/:id', siswaCtrl.deleteSiswa);
router.post('/siswa/:id/aktivitas', siswaCtrl.addAktivitas);
router.patch('/siswa/:id/aktivitas/:logId/koreksi', siswaCtrl.koreksiAktivitas);
router.post('/siswa/batch', siswaCtrl.importBatch);


// ─────────────────────────────────────────────────────────────────────────────
// SEKOLAH — Legacy POST (backward-compat GAS / frontend lama)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/sekolah/list', ctrl.getAllSekolah);
router.post('/sekolah/add', ctrl.addSekolah);
router.post('/sekolah/update', ctrl.updateSekolah);
router.post('/sekolah/update-aktivitas-terakhir', ctrl.updateLastAktivitasSekolah);
router.post('/sekolah/add-aktivitas', ctrl.addAktivitasSekolah);
router.post('/sekolah/detail', ctrl.getSekolahById);

// ─────────────────────────────────────────────────────────────────────────────
// SISWA
// ─────────────────────────────────────────────────────────────────────────────
router.post('/siswa/list', ctrl.getAllSiswa);
router.post('/siswa/detail', ctrl.getSiswaById);
router.post('/siswa/add', ctrl.addSiswa);
router.post('/siswa/update', ctrl.updateSiswa);
router.post('/siswa/add-batch', ctrl.addSiswaBatch);
router.post('/siswa/update-aktivitas-terakhir', ctrl.updateLastAktivitasSiswa);
router.post('/siswa/add-aktivitas', ctrl.addAktivitasSiswa);
router.post('/siswa/by-phone', ctrl.getSiswaByPhone);

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD — V1 RESTful (GET + query params) ← ENDPOINT UTAMA
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/dashboard/stats?period=2025/2026&month=All
router.get('/dashboard/stats', ctrl.getDashboardStats);

// GET /api/v1/dashboard/charts?period=2025/2026&month=All
router.get('/dashboard/charts', ctrl.getDashboardCharts);

// GET /api/v1/dashboard/leaderboard?period=2025/2026
router.get('/dashboard/leaderboard', ctrl.getDashboardLeaderboard);

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD — Legacy aliases (POST) untuk backward-compat GAS / frontend lama
// ─────────────────────────────────────────────────────────────────────────────
router.post('/dashboard/summary', ctrl.getDashboardSummary);
router.post('/dashboard/tasks', ctrl.getDashboardTasks);
router.post('/dashboard/funnels', ctrl.getDashboardFunnels);
router.post('/dashboard/aktivitas', ctrl.getDashboardAktivitas);
router.post('/dashboard/kecamatan', ctrl.getDashboardKecamatan);

// ─────────────────────────────────────────────────────────────────────────────
// TASKS — V1 RESTful (GET + query params) ← ENDPOINT UTAMA
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/tasks?filter=today|overdue|tomorrow|upcoming&period=2025/2026&limit=20&page=1
router.get('/tasks', ctrl.getTasksV1);

// POST /api/v1/tasks/:id/reschedule  — Body: { tipe, newDate, alasan }
router.post('/tasks/:id/reschedule', ctrl.rescheduleTaskV1);

// ─────────────────────────────────────────────────────────────────────────────
// TASKLIST — Legacy alias (POST) untuk backward-compat
// ─────────────────────────────────────────────────────────────────────────────
router.post('/tasklist/get', ctrl.getTaskList);

// ─────────────────────────────────────────────────────────────────────────────
// DROPDOWN & UTILS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/utils/sekolah-dropdown', ctrl.getSekolahDropdown);
router.get('/utils/periods', ctrl.getAllMarketingPeriods);
router.get('/utils/active-period', ctrl.getActiveMarketingPeriod);
router.get('/utils/carry-forward', ctrl.getCarryForwardStatus);

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY PLANNING
// ─────────────────────────────────────────────────────────────────────────────
router.post('/weekly/data', ctrl.getWeeklyPlanningData);
router.post('/weekly/create', ctrl.createAgenda);
router.post('/weekly/update', ctrl.updateAgenda);
router.post('/weekly/delete', ctrl.deleteAgenda);

// ─────────────────────────────────────────────────────────────────────────────
// HOME VISIT
// ─────────────────────────────────────────────────────────────────────────────
router.post('/homevisit/list', ctrl.getAllHomeVisit);
router.post('/homevisit/detail', ctrl.getHomeVisitById);
router.post('/homevisit/create', ctrl.createHomeVisit);
router.post('/homevisit/add-aktivitas', ctrl.addAktivitasHomeVisit);

// ─────────────────────────────────────────────────────────────────────────────
// BROADCAST — V1 RESTful (GET + query params) ← ENDPOINT UTAMA
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/broadcast/audience?search=&statusPipeline=&page=1&limit=50
router.get('/broadcast/audience', broadcastCtrl.getAudience);

// GET /api/v1/broadcast/audience/schools — daftar sekolah unik untuk autocomplete
router.get('/broadcast/audience/schools', broadcastCtrl.getSchoolList);

// GET /api/v1/broadcast/history?page=1&limit=20
router.get('/broadcast/history', broadcastCtrl.getBroadcastHistory);

// GET /api/v1/broadcast/templates/meta
router.get('/broadcast/templates/meta', broadcastCtrl.getMetaTemplates);

// GET /api/v1/broadcast/templates/crm
router.get('/broadcast/templates/crm', broadcastCtrl.getCrmTemplates);

// POST /api/v1/broadcast/send  → 202 Accepted
router.post('/broadcast/send', broadcastCtrl.sendBroadcast);

// ─────────────────────────────────────────────────────────────────────────────
// BROADCAST — Legacy POST (backward-compat GAS & frontend lama)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/broadcast/sekolah', broadcastCtrl.getBroadcastSekolahList);
router.post('/broadcast/history', broadcastCtrl.getBroadcastHistoryLegacy);
router.post('/broadcast/preview', broadcastCtrl.getBroadcastTargetPreview);
router.post('/broadcast/create', broadcastCtrl.createBroadcast);
router.post('/broadcast/progress', broadcastCtrl.getBroadcastProgress);
router.post('/broadcast/check-history', broadcastCtrl.checkTemplateHistory);

// ─────────────────────────────────────────────────────────────────────────────
// NURTURING — V1 RESTful
// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/v1/nurturing/stats              — Summary cards Nurturing Dashboard
router.get('/nurturing/stats', nurturingCtrl.getStats);

// GET  /api/v1/nurturing/leads              — Daftar leads dalam campaign probing
router.get('/nurturing/leads', nurturingCtrl.getLeads);

// GET  /api/v1/nurturing/snooze/stats       — Summary cards Snooze Dashboard
router.get('/nurturing/snooze/stats', nurturingCtrl.getSnoozeStats);

// GET  /api/v1/nurturing/snooze/leads       — Daftar leads yang sedang di-snooze
router.get('/nurturing/snooze/leads', nurturingCtrl.getSnoozeLeads);

// POST /api/v1/nurturing/force-trigger      — Jalankan cron manual (testing)
router.post('/nurturing/force-trigger', nurturingCtrl.forceTrigger);

// POST /api/v1/nurturing/takeover/:id       — Hentikan bot, CRO ambil alih
router.post('/nurturing/takeover/:id', nurturingCtrl.takeoverLead);

// POST /api/v1/nurturing/snooze/add         — Tambah siswa ke snooze manual
router.post('/nurturing/snooze/add', nurturingCtrl.addSnooze);

// DELETE /api/v1/nurturing/snooze/:id       — Hentikan snooze lebih awal
router.delete('/nurturing/snooze/:id', nurturingCtrl.stopSnooze);

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY PLANNING
// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/v1/weekly/backlog                      ?search=&period=
router.get('/weekly/backlog', weeklyCtrl.getBacklog);

// GET  /api/v1/weekly/board                         ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/weekly/board', weeklyCtrl.getBoardItems);

// POST /api/v1/weekly/schedule                      body: { taskId, tanggal }
// Drag backlog → kolom hari (insert weekly_planning + update source due_date)
router.post('/weekly/schedule', weeklyCtrl.scheduleTask);

// PATCH /api/v1/weekly/agenda/:agendaId/reschedule  body: { newTanggal }
// Drag hari → hari lain
router.patch('/weekly/agenda/:agendaId/reschedule', weeklyCtrl.rescheduleTask);

// DELETE /api/v1/weekly/agenda/:agendaId
// Drag hari → backlog (delete weekly_planning + reset source due_date = NULL)
router.delete('/weekly/agenda/:agendaId', weeklyCtrl.unscheduleTask);

// ─────────────────────────────────────────────────────────────────────────────
// CHAT (INBOX) — V1 RESTful
// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/v1/chats                              — Daftar percakapan (+ polling)
// GET  /api/v1/chats/:convId/messages             — Riwayat pesan (+ cursor paging)
// POST /api/v1/chats/:convId/send                 — Kirim pesan (Smart Routing)
// PATCH /api/v1/chats/:convId/read               — Tandai semua pesan sudah dibaca
// ─────────────────────────────────────────────────────────────────────────────
router.get('/chats', chatCtrl.getConversationList);
router.post('/chats/initiate', chatCtrl.initiateConversation);
router.get('/chats/:convId/messages', chatCtrl.getMessages);
router.post('/chats/:convId/send', chatCtrl.sendMessage);
router.patch('/chats/:convId/read', chatCtrl.markAsRead);

// ─────────────────────────────────────────────────────────────────────────────
// WEB PUSH SUBSCRIPTION
// ─────────────────────────────────────────────────────────────────────────────
router.post('/web-push/subscribe', requireAuth, webpushCtrl.subscribe);

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE MANAGER — V1 RESTful
// ─────────────────────────────────────────────────────────────────────────────
// GET    /api/v1/templates                        — List semua template
// GET    /api/v1/templates/:id                    — Detail satu template
// POST   /api/v1/templates                        — Buat template baru
// PUT    /api/v1/templates/:id                    — Update info dasar
// PATCH  /api/v1/templates/:id/parameters         — Update JSON parameters schema
// DELETE /api/v1/templates/:id                    — Soft delete
// POST   /api/v1/templates/sync                   — Sync dari Meta
// ─────────────────────────────────────────────────────────────────────────────
router.get('/templates', templateCtrl.getTemplates);
router.post('/templates/sync', templateCtrl.syncMetaStatus);
router.post('/templates', templateCtrl.createTemplate);
router.get('/templates/:id', templateCtrl.getTemplate);
router.put('/templates/:id', templateCtrl.updateTemplate);
router.patch('/templates/:id/parameters', templateCtrl.updateParameters);
router.delete('/templates/:id', templateCtrl.deleteTemplate);

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS (CLASS, KOTA & KECAMATAN MAPPING)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/settings/kelas-mapping', settingsCtrl.getKelasMapping);
router.post('/settings/kelas-mapping', settingsCtrl.addKelasMapping);
router.put('/settings/kelas-mapping/:id', settingsCtrl.updateKelasMapping);
router.delete('/settings/kelas-mapping/:id', settingsCtrl.deleteKelasMapping);

router.get('/settings/kota', settingsCtrl.getKotaList);
router.post('/settings/kota', settingsCtrl.addKota);
router.put('/settings/kota/:id', settingsCtrl.updateKota);
router.delete('/settings/kota/:id', settingsCtrl.deleteKota);

router.get('/settings/kecamatan', settingsCtrl.getKecamatanList);
router.post('/settings/kecamatan', settingsCtrl.addKecamatan);
router.put('/settings/kecamatan/:id', settingsCtrl.updateKecamatan);
router.delete('/settings/kecamatan/:id', settingsCtrl.deleteKecamatan);

module.exports = router;
