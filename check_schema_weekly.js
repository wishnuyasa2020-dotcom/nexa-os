// check_schema_weekly.js
const mysql = require('mysql2/promise');
const path = require('path');

// Load env manual
const fs = require('fs');
const envFile = fs.readFileSync('.env', 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) envVars[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
});

(async () => {
  const pool = await mysql.createPool({
    host:     envVars.DB_HOST     || 'localhost',
    port:     envVars.DB_PORT     || 3306,
    user:     envVars.DB_USER     || envVars.DB_USERNAME,
    password: envVars.DB_PASS     || envVars.DB_PASSWORD,
    database: envVars.DB_NAME     || envVars.DB_DATABASE,
  });

  const conn = await pool.getConnection();

  // List all tables
  const [tables] = await conn.query('SHOW TABLES');
  const tableNames = tables.map(t => Object.values(t)[0]);
  console.log('\n=== ALL TABLES ===');
  tableNames.forEach(t => console.log(' -', t));

  // Cari tabel yang kemungkinan berhubungan dengan aktivitas / jadwal / tasks
  const relevant = tableNames.filter(t =>
    /aktivitas|jadwal|task|schedule|plan|visit|activity/i.test(t)
  );
  console.log('\n=== RELEVANT TABLES ===');
  if (relevant.length === 0) {
    console.log('  (tidak ada tabel aktivitas/jadwal ditemukan)');
  } else {
    for (const t of relevant) {
      const [cols] = await conn.query(`DESCRIBE ${t}`);
      console.log(`\n  TABLE: ${t}`);
      cols.forEach(c => console.log(`   ${c.Field} [${c.Type}] ${c.Null === 'NO' ? 'NOT NULL' : ''} ${c.Key ? c.Key : ''}`));
    }
  }

  conn.release();
  await pool.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
