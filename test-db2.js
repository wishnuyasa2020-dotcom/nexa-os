const { mainPool, getDynamicPool } = require('./src/config/database');

async function test() {
  const [tenant] = await mainPool.query('SELECT * FROM tenant_databases WHERE tenant_id = ?', ['derma-indonesia']);
  const pool = getDynamicPool({
    host: tenant[0].db_host,
    user: tenant[0].db_user,
    password: tenant[0].db_password,
    database: tenant[0].db_name
  });

  const [rows] = await pool.query(`
    SELECT
      ms.id_siswa, ms.id_sekolah, sek.nama_sekolah as nama_sekolah, ms.nama_lengkap, 
      ms.wa, ms.bsuid, mk.nama_kelas as kelas, ms.minat_awal, ms.rencana_lulus, sp.prioritas,
      sp.status_terkini, sp.next_action, DATE_FORMAT(sp.due_date, '%Y-%m-%d') as due_date, sp.cro as pj_cro, sp.orangtua_tahu, sp.alasan_tidak_lanjut
    FROM master_siswa ms
    LEFT JOIN master_kelas mk ON ms.kelas_id = mk.id
    LEFT JOIN siswa_periode sp ON ms.id_siswa = sp.id_siswa AND sp.marketing_period = ?
    LEFT JOIN master_sekolah sek ON ms.id_sekolah = sek.id_sekolah
    WHERE ms.id_siswa = ?
  `, ['2025/2026', 'STD-000001']);
  
  console.log('Result:', rows);

  process.exit();
}

test().catch(err => {
  console.error('ERROR:', err.message);
  process.exit();
});
