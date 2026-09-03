const { mainPool, getDynamicPool } = require('./src/config/database');

async function test() {
  const [tenant] = await mainPool.query('SELECT * FROM tenant_databases WHERE tenant_id = ?', ['derma-indonesia']);
  const pool = getDynamicPool({
    host: tenant[0].db_host,
    user: tenant[0].db_user,
    password: tenant[0].db_password,
    database: tenant[0].db_name
  });

  const [rows] = await pool.query('SHOW COLUMNS FROM conversations');
  console.log('conversations columns:', rows.map(r => r.Field));

  process.exit();
}

test().catch(err => {
  console.error('ERROR:', err.message);
  process.exit();
});
