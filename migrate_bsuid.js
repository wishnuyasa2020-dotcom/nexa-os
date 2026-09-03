require('dotenv').config();
const mysql = require('mysql2/promise');
const { mainPool } = require('./src/config/database');

async function run() {
  try {
    const [tenants] = await mainPool.query('SELECT * FROM tenant_databases');
    console.log(`Found ${tenants.length} tenants.`);

    for (const t of tenants) {
      console.log(`Migrating tenant: ${t.tenant_id} on DB ${t.db_name}...`);
      let conn;
      try {
        conn = await mysql.createConnection({
          host: t.db_host,
          port: t.db_port || 3306,
          user: t.db_user,
          password: t.db_password,
          database: t.db_name
        });

        // Add bsuid
        try {
          await conn.query('ALTER TABLE master_siswa ADD COLUMN bsuid VARCHAR(128) UNIQUE DEFAULT NULL');
          console.log(` - Added bsuid to ${t.tenant_id}`);
        } catch (err) {
          if (err.code === 'ER_DUP_FIELDNAME') {
            console.log(` - bsuid already exists on ${t.tenant_id}`);
          } else {
            console.error(` - Failed to add bsuid on ${t.tenant_id}: ${err.message}`);
          }
        }

        // Make wa nullable
        try {
          await conn.query('ALTER TABLE master_siswa MODIFY COLUMN wa VARCHAR(20) NULL');
          console.log(` - Modified wa to nullable on ${t.tenant_id}`);
        } catch (err) {
          console.error(` - Failed to modify wa on ${t.tenant_id}: ${err.message}`);
        }

      } catch (err) {
        console.error(`Failed to connect to tenant ${t.tenant_id}: ${err.message}`);
      } finally {
        if (conn) await conn.end();
      }
    }
    console.log('Migration complete.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

run();
