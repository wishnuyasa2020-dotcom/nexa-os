const mysql = require('mysql2/promise');
require('dotenv').config({path: './nexa-os/.env'});

async function run() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'nexamain'
  });
  const [r] = await c.query('SELECT limit_siswa, used_siswa, limit_sekolah, used_sekolah FROM tenants WHERE tenant_id="derma"');
  console.log('Quotas:', r[0]);

  const [t] = await c.query('SELECT db_name FROM tenant_databases WHERE tenant_id="derma"');
  const dbName = t[0].db_name;
  
  const c2 = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: dbName
  });
  const [r2] = await c2.query('SELECT COUNT(*) as total FROM master_siswa');
  console.log('Actual Master Siswa:', r2[0]);

  process.exit(0);
}

run();
