// test_audience_query.js
'use strict';
require('dotenv').config();
const { pool } = require('./src/config/database');

(async () => {
  const conn = await pool.getConnection();
  try {
    const [mp] = await conn.query(
      "SELECT nama_period FROM marketing_period WHERE status = 'aktif' ORDER BY created_date DESC LIMIT 1"
    );
    const period = mp[0]?.nama_period || '-';
    console.log('Active period:', period);

    const [rows] = await conn.query(`
      SELECT
        ms.id_siswa AS id,
        ms.nama_lengkap AS nama,
        IFNULL(sek.nama_sekolah, '-') AS sekolah,
        IFNULL(ms.wa, '') AS phone,
        IFNULL(sp.status_terkini, '') AS statusPipeline,
        CASE
          WHEN sw.sw_status = 'open' THEN 1
          WHEN sw.last_incoming_ts IS NOT NULL
           AND TIMESTAMPDIFF(HOUR, sw.last_incoming_ts, NOW()) <= 24
          THEN 1
          ELSE 0
        END AS isSwOpen
      FROM siswa_periode sp
      LEFT JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa
      LEFT JOIN master_sekolah sek ON ms.id_sekolah = sek.id_sekolah
      LEFT JOIN wa_service_window sw ON sw.id_siswa = ms.id_siswa
      WHERE sp.marketing_period = ?
      ORDER BY ms.nama_lengkap ASC
      LIMIT 5
    `, [period]);

    console.log('Query OK — rows returned:', rows.length);
    rows.forEach(r => {
      console.log(` - ${r.nama} | ${r.phone} | Pipeline: ${r.statusPipeline} | SW: ${r.isSwOpen ? 'OPEN ✅' : 'CLOSED 🔒'}`);
    });
  } finally {
    conn.release();
    pool.end();
  }
})().catch(e => {
  console.error('❌ Query FAILED:', e.message);
  process.exit(1);
});
