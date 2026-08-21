// test_weekly.js
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
});

(async () => {
  const pool = await mysql.createPool({
    host: env.DB_HOST || 'localhost',
    port: env.DB_PORT || 3306,
    user: env.DB_USER || env.DB_USERNAME,
    password: env.DB_PASS || env.DB_PASSWORD,
    database: env.DB_NAME || env.DB_DATABASE,
  });
  const conn = await pool.getConnection();

  // Test 1: Active period
  const [mp] = await conn.query("SELECT nama_period FROM marketing_period WHERE status='aktif' LIMIT 1");
  const period = mp[0]?.nama_period;
  console.log('✅ Active period:', period);

  // Test 2: Backlog dari aktivitas_sekolah
  const [asRows] = await conn.query(
    `SELECT CONCAT('as:', id) AS taskId, id_sekolah_nama AS judul, next_action, status_terkini
     FROM aktivitas_sekolah
     WHERE marketing_period = ? AND (due_date IS NULL OR IFNULL(status_jadwal,'') IN ('','belum dijadwalkan','reschedule'))
     LIMIT 3`,
    [period]
  );
  console.log('\n✅ aktivitas_sekolah backlog (sample):', asRows.length, 'rows');
  asRows.forEach(r => console.log('  -', r.taskId, '|', r.judul));

  // Test 3: Backlog dari aktivitas_siswa
  const [asiRows] = await conn.query(
    `SELECT CONCAT('asi:', id) AS taskId, id_siswa_nama AS judul FROM aktivitas_siswa
     WHERE marketing_period = ? AND (due_date IS NULL OR IFNULL(status_jadwal,'') IN ('','belum dijadwalkan','reschedule'))
     LIMIT 3`,
    [period]
  );
  console.log('\n✅ aktivitas_siswa backlog (sample):', asiRows.length, 'rows');
  asiRows.forEach(r => console.log('  -', r.taskId, '|', r.judul));

  // Test 4: aktivitas_ekstra backlog
  const [aeRows] = await conn.query(
    `SELECT CONCAT('ae:', id) AS taskId, aktivitas AS judul FROM aktivitas_ekstra
     WHERE marketing_period = ? AND (tanggal_rencana IS NULL OR IFNULL(status_aktivitas,'') IN ('','belum dijadwalkan'))
     LIMIT 3`,
    [period]
  );
  console.log('\n✅ aktivitas_ekstra backlog (sample):', aeRows.length, 'rows');
  aeRows.forEach(r => console.log('  -', r.taskId, '|', r.judul));

  // Test 5: weekly_planning board
  const today = new Date();
  const mon = new Date(today); mon.setDate(today.getDate() - (today.getDay() || 7) + 1);
  const sat = new Date(mon);   sat.setDate(mon.getDate() + 5);
  const fmt = d => d.toISOString().split('T')[0];
  const [wpRows] = await conn.query(
    `SELECT id_agenda, judul, tanggal, cro FROM weekly_planning
     WHERE marketing_period = ? AND tanggal BETWEEN ? AND ? LIMIT 5`,
    [period, fmt(mon), fmt(sat)]
  );
  console.log(`\n✅ weekly_planning board ${fmt(mon)}~${fmt(sat)}:`, wpRows.length, 'rows');
  wpRows.forEach(r => console.log('  -', r.id_agenda?.substring(0,8), '|', r.judul, '|', r.tanggal));

  console.log('\n✅ Semua query berhasil!');
  conn.release();
  await pool.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
