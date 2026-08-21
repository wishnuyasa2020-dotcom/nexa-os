'use strict';

/**
 * migration_nurturing_run.js
 * Jalankan: node migration_nurturing_run.js
 * Membuat tabel siswa_nurturing_state & nurturing_activity_log di DB tenant aktif.
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function run() {
  const connection = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT || '3306', 10),
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  console.log(`[Migration] Terhubung ke ${process.env.DB_NAME}@${process.env.DB_HOST}`);

  const sqlPath = path.join(__dirname, 'migration_nurturing.sql');
  const sql     = fs.readFileSync(sqlPath, 'utf8');

  try {
    const [results] = await connection.query(sql);
    console.log('[Migration] Hasil:', results);
    console.log('[Migration] ✅ Tabel nurturing berhasil dibuat.');
  } catch (err) {
    if (err.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log('[Migration] ⚠️  Tabel sudah ada, skip.');
    } else {
      console.error('[Migration] ❌ Error:', err.message);
      process.exit(1);
    }
  } finally {
    await connection.end();
  }
}

run();
