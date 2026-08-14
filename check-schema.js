const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkSchema() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    const [rows] = await pool.query("DESCRIBE sekolah_periode");
    console.log("sekolah_periode schema:", rows.map(r => r.Field));
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

checkSchema();
