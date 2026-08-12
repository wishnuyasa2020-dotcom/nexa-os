'use strict';

const { pool } = require('../../config/database');

/**
 * Nexa Control Centre — Admin Service
 *
 * Port dari NexaControlAPI.gs ke Express.
 * Query sama persis dengan GAS agar hasilnya identik.
 */

async function getOverview() {
  // Active period
  const [[periodRows]] = await pool.query(
    'SELECT nama_period FROM marketing_period WHERE status = ? ORDER BY created_date DESC LIMIT 1',
    ['aktif']
  );
  const activePeriod = periodRows?.nama_period || '-';

  const [
    [userRows],
    [croRows],
    [siswaRows],
    [sekolahRows],
    [siswaAktifRows],
    [chatMsgRows],
    [convRows],
    [bcastMonthRows],
    [bcastSuccessRows],
    [hvRows],
  ] = await Promise.all([
    pool.query('SELECT status, COUNT(*) AS cnt FROM users GROUP BY status'),
    pool.query("SELECT COUNT(*) AS cnt FROM users WHERE LOWER(role) = 'cro' AND LOWER(status) = 'aktif'"),
    pool.query('SELECT COUNT(*) AS cnt FROM master_siswa'),
    pool.query('SELECT COUNT(*) AS cnt FROM master_sekolah'),
    activePeriod !== '-'
      ? pool.query('SELECT COUNT(*) AS cnt FROM siswa_periode WHERE marketing_period = ?', [activePeriod])
      : Promise.resolve([[{ cnt: 0 }]]),
    pool.query('SELECT COUNT(*) AS cnt FROM chat_messages WHERE datetime >= DATE_SUB(NOW(), INTERVAL 24 HOUR)'),
    pool.query("SELECT COUNT(*) AS cnt FROM conversations WHERE status = 'active'"),
    pool.query("SELECT COUNT(*) AS cnt FROM broadcast WHERE created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')"),
    pool.query('SELECT COALESCE(SUM(total_success), 0) AS cnt FROM broadcast'),
    activePeriod !== '-'
      ? pool.query('SELECT COUNT(*) AS cnt FROM home_visit WHERE marketing_period = ?', [activePeriod])
      : Promise.resolve([[{ cnt: 0 }]]),
  ]);

  // totalUsers = semua status, activeUsers = yang status 'aktif'
  let totalUsers = 0, activeUsers = 0;
  userRows.forEach(r => {
    const c = parseInt(r.cnt) || 0;
    totalUsers += c;
    if ((r.status || '').toLowerCase() === 'aktif') activeUsers = c;
  });

  return {
    tenants:              1,
    totalUsers,
    activeUsers,
    activeCro:            parseInt(croRows[0]?.cnt)          || 0,
    totalSiswa:           parseInt(siswaRows[0]?.cnt)        || 0,
    totalSekolah:         parseInt(sekolahRows[0]?.cnt)      || 0,
    siswaAktifPeriode:    parseInt(siswaAktifRows[0]?.cnt)   || 0,
    messagesLast24h:      parseInt(chatMsgRows[0]?.cnt)      || 0,
    activeConversations:  parseInt(convRows[0]?.cnt)         || 0,
    broadcastsMonth:      parseInt(bcastMonthRows[0]?.cnt)   || 0,
    totalBroadcastSuccess: parseInt(bcastSuccessRows[0]?.cnt) || 0,
    homeVisitsAktif:      parseInt(hvRows[0]?.cnt)           || 0,
    activePeriod,
    generatedAt:          new Date().toISOString(),
  };
}

async function getTenant() {
  // Mock data karena tabel tenants belum ada di database Hostinger
  return {
    tenantId: 'derma-indonesia',
    brandName: 'Derma Indonesia',
    appName: 'Derma CRM',
    tier: 'PRO',
    status: 'ACTIVE',
    primaryColor: '#0066cc',
    activeCro: 1,
    totalCro: 1,
    maxCro: 10,
    activePeriod: '2025/2026',
    periodStart: '2025-01-01',
    periodEnd: '2026-12-31',
    siswaAktif: 181,
    sekolahAktif: 28,
    activeTemplates: 3,
    lastIncomingMsg: null,
    whatsappStatus: 'CONNECTED'
  };
}

async function getUsageStats() {
  return {
    activePeriod: '2025/2026',
    siswaByStatus: [],
    sekolahByStatus: [],
    broadcast: { campaigns: 0, success: 0, failed: 0, pending: 0 },
    homeVisits: 0,
    msgByDay: [],
    croActivity: []
  };
}

async function getUserList() {
  const [rows] = await pool.query(
    "SELECT id, username, nama, role, status FROM users ORDER BY FIELD(role,'Admin','Manager','CRO','Visitor'), nama ASC"
  );
  return rows.map(r => ({
    id: r.id,
    username: r.username,
    nama: r.nama,
    role: r.role,
    status: r.status
  }));
}

async function getSystemHealth() {
  try {
    const [[{ dbTime }]] = await pool.query('SELECT NOW() AS dbTime');
    return {
      database: { status: 'ok', serverTime: dbTime },
      uptime:   process.uptime(),
      memory:   process.memoryUsage(),
    };
  } catch (err) {
    return {
      database: { status: 'error', message: err.message },
    };
  }
}

async function getActivity() {
  const activities = [];

  // Recent broadcasts (24h)
  const [bcRows] = await pool.query(
    'SELECT id_broadcast, template_display_name, total_target, total_success, total_failed, status, created_by, created_at ' +
    'FROM broadcast WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY created_at DESC LIMIT 8'
  );
  bcRows.forEach(r => {
    activities.push({
      type:  'broadcast',
      icon:  '📢',
      title: 'Broadcast: ' + (r.template_display_name || '-'),
      desc:  'Target ' + r.total_target + ' • Terkirim ' + r.total_success + ' • Gagal ' + r.total_failed,
      badge: r.status,
      user:  r.created_by || 'System',
      ts:    r.created_at
    });
  });

  // Recent new siswa (24h)
  const [siswaRows] = await pool.query(
    'SELECT nama_lengkap, created_date FROM master_siswa WHERE created_date >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY created_date DESC LIMIT 5'
  );
  siswaRows.forEach(r => {
    activities.push({
      type:  'siswa_baru',
      icon:  '👤',
      title: 'Siswa Baru: ' + r.nama_lengkap,
      desc:  'Terdaftar via form sosialisasi',
      badge: 'Baru',
      user:  'System',
      ts:    r.created_date
    });
  });

  // Recent incoming chat (24h)
  const [chatRows] = await pool.query(
    "SELECT from_name, datetime FROM chat_messages WHERE direction = 'incoming' AND datetime >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY datetime DESC LIMIT 5"
  );
  chatRows.forEach(r => {
    activities.push({
      type:  'chat',
      icon:  '💬',
      title: 'Chat masuk: ' + (r.from_name || 'Unknown'),
      desc:  'Pesan WhatsApp masuk',
      badge: 'Chat',
      user:  'WhatsApp',
      ts:    r.datetime
    });
  });

  // Recent home visits (24h)
  const [hvRows] = await pool.query(
    'SELECT id_siswa_nama, tanggal_hv, hasil_hv FROM home_visit WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY timestamp DESC LIMIT 5'
  );
  hvRows.forEach(r => {
    activities.push({
      type:  'homevisit',
      icon:  '🏠',
      title: 'Home Visit: ' + (r.id_siswa_nama ? r.id_siswa_nama.split('|').pop().trim() : '-'),
      desc:  'Hasil: ' + (r.hasil_hv || '-'),
      badge: 'HV',
      user:  'CRO',
      ts:    r.tanggal_hv
    });
  });

  // Sort descending
  activities.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
  return activities.slice(0, 10);
}

module.exports = { getOverview, getTenant, getUsageStats, getUserList, getSystemHealth, getActivity };
