const mysql = require('mysql2/promise');
const { mainPool } = require('./src/config/database');

async function run() {
  const tenantId = 'testing-tenant';
  console.log('Menghapus ' + tenantId + ' dari Main DB...');
  await mainPool.query('DELETE FROM tenant_databases WHERE tenant_id = ?', [tenantId]);
  await mainPool.query('DELETE FROM tenants WHERE tenant_id = ?', [tenantId]);
  
  console.log('Mengosongkan tabel di u294320793_tenant_001...');
  const dbBaru = await mysql.createConnection({
    host: 'srv1412.hstgr.io',
    port: 3306,
    user: 'u294320793_admin_001',
    password: 'Nexa001!',
    database: 'u294320793_tenant_001'
  });
  
  try {
    const [tables] = await dbBaru.query('SHOW TABLES');
    const tableKey = Object.keys(tables[0])[0];
    
    await dbBaru.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const row of tables) {
      const tableName = row[tableKey];
      console.log('Menghapus tabel:', tableName);
      await dbBaru.query(`DROP TABLE IF EXISTS \`${tableName}\``);
    }
    await dbBaru.query('SET FOREIGN_KEY_CHECKS = 1');
    
    console.log('✅ Reset berhasil! Silakan coba tambah tenant baru lagi.');
  } finally {
    await dbBaru.end();
    process.exit(0);
  }
}

run().catch(console.error);
