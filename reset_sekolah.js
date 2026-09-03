const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const mainPool = await mysql.createConnection({
    host: process.env.MAIN_DB_HOST,
    user: process.env.MAIN_DB_USER,
    password: process.env.MAIN_DB_PASSWORD,
    database: process.env.MAIN_DB_NAME
  });

  await mainPool.query("UPDATE tenants SET used_sekolah = 0 WHERE tenant_id='derma-indonesia'");
  console.log('Reset used_sekolah for derma-indonesia to 0');
  await mainPool.end();
  process.exit(0);
}

run();
