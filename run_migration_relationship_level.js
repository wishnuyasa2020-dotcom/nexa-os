'use strict';
const mysql = require('mysql2/promise');
require('dotenv').config({ path: __dirname + '/.env' });

async function run() {
  const mainPool = mysql.createPool({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT || 3306,
    user:     process.env.MAIN_DB_USER || process.env.DB_USER,
    password: process.env.MAIN_DB_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.MAIN_DB_NAME || 'u294320793_nexamain',
  });

  try {
    const [tenants] = await mainPool.query('SELECT tenant_id, db_host, db_port, db_name, db_user, db_password FROM tenant_databases');
    console.log(`Ditemukan ${tenants.length} tenant untuk migrasi relationship_level:`, tenants.map(t => t.tenant_id));

    for (const t of tenants) {
      console.log(`\n======================================================`);
      console.log(`Migrasi relationship_level di Tenant: ${t.tenant_id} (${t.db_name})`);
      console.log(`======================================================`);
      
      const tPool = mysql.createPool({
        host: t.db_host,
        port: t.db_port || 3306,
        user: t.db_user,
        password: t.db_password,
        database: t.db_name,
      });

      const conn = await tPool.getConnection();
      try {
        // 1. master_siswa
        const [msCols] = await conn.query("SHOW COLUMNS FROM master_siswa LIKE 'relationship_level'");
        if (msCols.length === 0) {
          await conn.query("ALTER TABLE master_siswa ADD COLUMN relationship_level ENUM('STANDARD', 'LOYAL', 'ADVOCATE') NOT NULL DEFAULT 'STANDARD' AFTER opt_in_wa;");
          console.log('  OK: Added relationship_level to master_siswa');
        } else {
          console.log('  SKIP: relationship_level already exists in master_siswa');
        }

        // 2. siswa_periode
        const [spCols] = await conn.query("SHOW COLUMNS FROM siswa_periode LIKE 'relationship_level'");
        if (spCols.length === 0) {
          await conn.query("ALTER TABLE siswa_periode ADD COLUMN relationship_level ENUM('STANDARD', 'LOYAL', 'ADVOCATE') NOT NULL DEFAULT 'STANDARD' AFTER commercial_state;");
          console.log('  OK: Added relationship_level to siswa_periode');
        } else {
          console.log('  SKIP: relationship_level already exists in siswa_periode');
        }

        // 3. student_current_state
        const [scsCols] = await conn.query("SHOW COLUMNS FROM student_current_state LIKE 'relationship_level'");
        if (scsCols.length === 0) {
          await conn.query("ALTER TABLE student_current_state ADD COLUMN relationship_level VARCHAR(20) NOT NULL DEFAULT 'STANDARD' AFTER pipeline_state;");
          console.log('  OK: Added relationship_level to student_current_state');
        } else {
          console.log('  SKIP: relationship_level already exists in student_current_state');
        }

      } catch (err) {
        console.error(`  ERROR pada tenant ${t.tenant_id}:`, err.message);
      } finally {
        conn.release();
        await tPool.end();
      }
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
  } finally {
    await mainPool.end();
    console.log('\nMigrasi relationship_level selesai.');
  }
}

run();
