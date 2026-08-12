'use strict';

const { pool } = require('../../config/database');

/**
 * Nexa Control Centre — Admin Service
 *
 * Port dari NexaControlAPI.gs ke Express.
 * Query sama persis dengan GAS agar hasilnya identik.
 */

async function getOverview(marketingPeriod) {
  const [
    [tenantRows],
    [userRows],
    [croRows],
    [siswaRows],
    [sekolahRows],
    [chatRows],
    [broadcastRows],
    [hvRows],
  ] = await Promise.all([
    pool.query('SELECT COUNT(*) AS total FROM tenants WHERE status = ?', ['active']),
    pool.query('SELECT COUNT(*) AS total FROM users WHERE status = ?', ['active']),
    pool.query("SELECT COUNT(*) AS total FROM users WHERE role = 'CRO' AND status = ?", ['active']),
    pool.query('SELECT COUNT(*) AS total FROM siswa WHERE marketing_period = ?', [marketingPeriod]),
    pool.query('SELECT COUNT(*) AS total FROM sekolah'),
    pool.query(
      'SELECT COUNT(*) AS total FROM conversations WHERE status = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)',
      ['active']
    ),
    pool.query(
      'SELECT COUNT(*) AS total FROM broadcast_log WHERE marketing_period = ?',
      [marketingPeriod]
    ),
    pool.query(
      'SELECT COUNT(*) AS total FROM home_visit WHERE marketing_period = ?',
      [marketingPeriod]
    ),
  ]);

  return {
    tenantCount:    tenantRows[0]?.total || 0,
    totalUsers:     userRows[0]?.total   || 0,
    croCount:       croRows[0]?.total    || 0,
    totalSiswa:     siswaRows[0]?.total  || 0,
    totalSekolah:   sekolahRows[0]?.total || 0,
    activeChats:    chatRows[0]?.total   || 0,
    broadcastCount: broadcastRows[0]?.total || 0,
    homeVisitCount: hvRows[0]?.total     || 0,
  };
}

async function getTenants() {
  const [rows] = await pool.query(
    'SELECT id, name, status, plan, created_at FROM tenants ORDER BY created_at DESC'
  );
  return rows;
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

  // Pesan WhatsApp masuk (24 jam terakhir)
  const [msgRows] = await pool.query(
    "SELECT body, datetime, from_number FROM messages WHERE direction = 'inbound' ORDER BY datetime DESC LIMIT 5"
  );
  msgRows.forEach(r => {
    activities.push({
      type:  'message',
      icon:  '💬',
      title: 'Pesan Masuk: ' + (r.from_number || '-'),
      desc:  (r.body || '').substring(0, 60),
      badge: 'WA',
      user:  'WhatsApp',
      ts:    r.datetime,
    });
  });

  // Home visit (24 jam terakhir) — tanpa kolom created_by
  const [hvRows] = await pool.query(
    'SELECT id_siswa_nama, tanggal_hv, hasil_hv FROM home_visit WHERE `timestamp` >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY `timestamp` DESC LIMIT 5'
  );
  hvRows.forEach(r => {
    activities.push({
      type:  'homevisit',
      icon:  '🏠',
      title: 'Home Visit: ' + (r.id_siswa_nama ? r.id_siswa_nama.split('|').pop().trim() : '-'),
      desc:  'Hasil: ' + (r.hasil_hv || '-'),
      badge: 'HV',
      user:  'CRO',
      ts:    r.tanggal_hv,
    });
  });

  // Sort descending
  activities.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
  return activities.slice(0, 10);
}

module.exports = { getOverview, getTenants, getSystemHealth, getActivity };
