require('dotenv').config();
const mysql = require('mysql2/promise');

async function fixQuota() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.MAIN_DB_HOST,
      port: process.env.MAIN_DB_PORT || 3306,
      user: process.env.MAIN_DB_USER,
      password: process.env.MAIN_DB_PASSWORD,
      database: process.env.MAIN_DB_NAME,
    });

    // Tenant DB (crmdemo) connection to count actual students
    const tenantConn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    const [siswaRows] = await tenantConn.query("SELECT COUNT(*) as total FROM master_siswa");
    const totalSiswa = siswaRows[0].total;

    console.log(`Ditemukan ${totalSiswa} siswa di database tenant.`);

    await connection.query("UPDATE tenants SET used_siswa = ? WHERE tenant_id = 'crm-demo'", [totalSiswa]);
    console.log(`Berhasil sinkronisasi used_siswa menjadi ${totalSiswa} di Main Registry untuk tenant crm-demo.`);

    await connection.end();
    await tenantConn.end();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

fixQuota();
