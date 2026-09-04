const { mainPool } = require('./src/config/database');
(async () => {
  try {
    const [rows] = await mainPool.query("SELECT * FROM master_tenants WHERE tenant_id = 'global'");
    console.log(rows);
  } finally {
    mainPool.end();
  }
})();
