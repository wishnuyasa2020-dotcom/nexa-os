const { pool } = require('./src/config/database');
(async () => {
  try {
    const [rows] = await pool.query("SELECT * FROM master_tenants WHERE tenant_id = 'global'");
    console.log(rows);
  } finally {
    pool.end();
  }
})();
