const { mainPool, getDynamicPool } = require('./src/config/database');

async function test() {
  const [tenant] = await mainPool.query('SELECT * FROM tenant_databases WHERE tenant_id = ?', ['derma-indonesia']);
  const pool = getDynamicPool({
    host: tenant[0].db_host,
    user: tenant[0].db_user,
    password: tenant[0].db_password,
    database: tenant[0].db_name
  });

  const [rows] = await pool.query('SHOW COLUMNS FROM siswa_periode');
  console.log('siswa_periode columns:', rows.map(r => r.Field));

  const [rows2] = await pool.query('SHOW COLUMNS FROM master_siswa');
  console.log('master_siswa columns:', rows2.map(r => r.Field));

  process.exit();
}

test().catch(err => {
  console.error('ERROR:', err.message);
  process.exit();
});
