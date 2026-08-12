'use strict';

const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * MySQL Connection Pool
 *
 * Menggunakan mysql2 dengan connection pooling agar aman untuk server
 * yang berjalan terus-menerus (tidak seperti GAS yang stateless).
 *
 * Hostinger biasanya membatasi max_connections per user.
 * Nilai connectionLimit disesuaikan agar tidak melebihi batas.
 */
const pool = mysql.createPool({
  host:            process.env.DB_HOST,
  port:            parseInt(process.env.DB_PORT || '3306'),
  user:            process.env.DB_USER,
  password:        process.env.DB_PASSWORD,
  database:        process.env.DB_NAME,
  connectionLimit: 10,           // max simultaneous connections
  waitForConnections: true,
  queueLimit:      0,
  timezone:        '+07:00',     // WIB
  charset:         'utf8mb4',
});

/**
 * Uji koneksi saat startup.
 * Lempar error agar server tidak berjalan tanpa database.
 */
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL connected to:', process.env.DB_HOST);
    conn.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
    process.exit(1);
  }
}

module.exports = { pool, testConnection };
