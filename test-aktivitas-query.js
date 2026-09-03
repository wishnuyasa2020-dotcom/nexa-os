const { mainPool, getDynamicPool } = require('./src/config/database');

async function test() {
  const [tenant] = await mainPool.query('SELECT * FROM tenant_databases WHERE tenant_id = ?', ['derma-indonesia']);
  const pool = getDynamicPool({
    host: tenant[0].db_host,
    user: tenant[0].db_user,
    password: tenant[0].db_password,
    database: tenant[0].db_name
  });

  try {
    const [rows] = await pool.query(
      "SELECT *, DATE_FORMAT(tanggal, '%Y-%m-%d') as tanggal FROM aktivitas_siswa WHERE id_siswa = ? ORDER BY tanggal DESC, created_at DESC",
      ['STD-000001']
    );
    console.log('Query success! Rows:', rows.length);
  } catch (err) {
    console.error('Query failed:', err.message);
  }
  process.exit();
}

test();
