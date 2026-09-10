// run_create_events_log.js
// Script untuk membuat tabel events_log di semua tenant database (Fase 1 Event-Sourcing)

'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { mainPool, getDynamicPool } = require('./src/config/database');

async function run() {
  console.log('🚀 Starting events_log migration across all tenant databases...');
  
  const sqlPath = path.join(__dirname, 'migrations', '2026-09-10_create_events_log.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    // 1. Fetch tenants from main registry
    const [tenants] = await mainPool.query('SELECT * FROM tenant_databases');
    console.log(`📋 Found ${tenants.length} tenants in main registry.`);

    for (const t of tenants) {
      console.log(`\n⏳ Migrating tenant [${t.tenant_id}] -> DB: ${t.db_name}...`);
      const tPool = getDynamicPool({
        host: t.db_host,
        port: t.db_port || 3306,
        user: t.db_user,
        password: t.db_password,
        database: t.db_name,
      });

      try {
        await tPool.query(sql);
        console.log(`✅ Tenant [${t.tenant_id}] (${t.db_name}): events_log created / verified.`);
        
        // Check schema verification
        const [cols] = await tPool.query('DESCRIBE events_log');
        console.log(`   Columns in ${t.db_name}.events_log:`, cols.map(c => c.Field).join(', '));
      } catch (err) {
        console.error(`❌ Failed on tenant [${t.tenant_id}] (${t.db_name}):`, err.message);
      } finally {
        await tPool.end();
      }
    }

    console.log('\n✨ All migrations finished successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration script fatal error:', err.message);
    process.exit(1);
  }
}

run();
