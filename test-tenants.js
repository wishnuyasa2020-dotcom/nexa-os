const { mainPool } = require('./src/config/database');
(async () => {
  try {
    const [rows] = await mainPool.query("SELECT tenant_id, db_name FROM tenant_databases");
    console.log(rows);
  } finally {
    mainPool.end();
  }
})();
