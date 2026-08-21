require('dotenv').config();
const mysql = require('mysql2/promise');

async function fixSekolahQuota() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.MAIN_DB_HOST,
      port: process.env.MAIN_DB_PORT || 3306,
      user: process.env.MAIN_DB_USER,
      password: process.env.MAIN_DB_PASSWORD,
      database: process.env.MAIN_DB_NAME,
    });

    const tenantConn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    const [rows] = await tenantConn.query("SELECT COUNT(*) as total FROM master_sekolah");
    const total = rows[0].total;

    console.log(`Ditemukan ${total} sekolah di database tenant.`);

    await connection.query("UPDATE tenants SET used_sekolah = ? WHERE tenant_id = 'crm-demo'", [total]);
    console.log(`Berhasil sinkronisasi used_sekolah menjadi ${total} di Main Registry untuk tenant crm-demo.`);

    await connection.end();
    await tenantConn.end();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

fixSekolahQuota();
