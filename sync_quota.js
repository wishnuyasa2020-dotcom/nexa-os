const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  try {
    const mainPool = await mysql.createConnection({
      host: process.env.MAIN_DB_HOST,
      user: process.env.MAIN_DB_USER,
      password: process.env.MAIN_DB_PASSWORD,
      database: process.env.MAIN_DB_NAME
    });

    const [tenants] = await mainPool.query('SELECT tenant_id, db_name, db_host, db_user, db_password FROM tenant_databases');
    
    for (const t of tenants) {
      console.log(`Syncing quota for ${t.tenant_id} on DB ${t.db_name}...`);
      
      let tenantConn;
      try {
        tenantConn = await mysql.createConnection({
          host: t.db_host || process.env.MAIN_DB_HOST,
          user: t.db_user || process.env.MAIN_DB_USER,
          password: t.db_password || process.env.MAIN_DB_PASSWORD,
          database: t.db_name
        });
        
        const [rSiswa] = await tenantConn.query('SELECT COUNT(*) as total FROM master_siswa');
        const usedSiswa = rSiswa[0].total;
        
        const [rSekolah] = await tenantConn.query('SELECT COUNT(*) as total FROM master_sekolah');
        const usedSekolah = rSekolah[0].total;
        
        await mainPool.query(
          'UPDATE tenants SET used_siswa = ?, used_sekolah = ? WHERE tenant_id = ?',
          [usedSiswa, usedSekolah, t.tenant_id]
        );
        
        console.log(` - ${t.tenant_id}: used_siswa=${usedSiswa}, used_sekolah=${usedSekolah}`);
      } catch (err) {
        console.error(` - Error syncing ${t.tenant_id}:`, err.message);
      } finally {
        if (tenantConn) await tenantConn.end();
      }
    }
    await mainPool.end();
    console.log('All quotas synced successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to sync quota:', err);
    process.exit(1);
  }
}

run();
