const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkSchema() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const tables = [
    'aktivitas_ekstra',
    'aktivitas_sekolah',
    'sekolah_periode',
    'master_sekolah',
    'audit_log',
  ];

  for (const t of tables) {
    try {
      const [rows] = await pool.query(`DESCRIBE \`${t}\``);
      console.log(`\n== ${t} ==`);
      rows.forEach(r => console.log(`  ${r.Field.padEnd(40)} ${r.Type.padEnd(25)} ${r.Null} ${r.Default ?? ''}`));
    } catch (err) {
      console.log(`\n== ${t} == ERROR: ${err.message}`);
    }
  }

  await pool.end();
}

checkSchema().catch(console.error);
