'use strict';

const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');
require('dotenv').config();

const MAIN_DB_CONFIG = {
  host:     process.env.MAIN_DB_HOST,
  user:     process.env.MAIN_DB_USER,
  password: process.env.MAIN_DB_PASSWORD,
  database: process.env.MAIN_DB_NAME,
  multipleStatements: true,
};

const SQL_FILE = path.join(__dirname, 'migration_web_push.sql');
const SQL = fs.readFileSync(SQL_FILE, 'utf8');

async function runMigrationOnTenant(dbConfig, tenantId) {
  const conn = await mysql.createConnection({
    host:               dbConfig.db_host,
    port:               dbConfig.db_port || 3306,
    user:               dbConfig.db_user,
    password:           dbConfig.db_password,
    database:           dbConfig.db_name,
    multipleStatements: true,
  });

  try {
    console.log(`\n[${tenantId}] 🚀 Menjalankan migration web_push...`);
    await conn.query(SQL);
    console.log(`[${tenantId}] ✅ Berhasil!`);
  } catch (err) {
    console.error(`[${tenantId}] ❌ Gagal: ${err.message}`);
    throw err;
  } finally {
    await conn.end();
  }
}

async function main() {
  const targetTenant = process.argv[2] || null;

  const mainConn = await mysql.createConnection(MAIN_DB_CONFIG);

  try {
    const [rows] = await mainConn.query(
      targetTenant
        ? 'SELECT * FROM tenant_databases WHERE tenant_id = ?'
        : 'SELECT * FROM tenant_databases',
      targetTenant ? [targetTenant] : []
    );

    if (rows.length === 0) {
      console.log('Tidak ada tenant yang ditemukan.');
      return;
    }

    console.log(`\n📋 Akan menjalankan migration web_push untuk ${rows.length} tenant:\n`);
    rows.forEach(r => console.log(`  - ${r.tenant_id} → ${r.db_name}`));
    console.log('');

    let success = 0;
    let failed  = 0;

    for (const row of rows) {
      try {
        await runMigrationOnTenant(row, row.tenant_id);
        success++;
      } catch {
        failed++;
      }
    }

    console.log(`\n═══════════════════════════════════════`);
    console.log(`  Selesai: ${success} berhasil, ${failed} gagal`);
    console.log(`═══════════════════════════════════════\n`);

  } finally {
    await mainConn.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
