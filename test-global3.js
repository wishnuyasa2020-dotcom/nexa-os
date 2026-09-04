const { mainPool } = require('./src/config/database');
(async () => {
  try {
    const [rows] = await mainPool.query("DESCRIBE tenant_databases");
    console.log(rows);
  } finally {
    mainPool.end();
  }
})();
