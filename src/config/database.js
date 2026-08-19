'use strict';

const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * MySQL Connection Pool
 *
 * Menggunakan mysql2 dengan connection pooling agar aman untuk server
 * yang berjalan terus-menerus (tidak seperti GAS yang stateless).
 */

// 1. Pool untuk Main Registry DB (Central DB)
const mainPool = mysql.createPool({
  host:            process.env.MAIN_DB_HOST,
  port:            parseInt(process.env.MAIN_DB_PORT || '3306'),
  user:            process.env.MAIN_DB_USER,
  password:        process.env.MAIN_DB_PASSWORD,
  database:        process.env.MAIN_DB_NAME,
  connectionLimit: 5,
  waitForConnections: true,
  queueLimit:      0,
  timezone:        '+07:00',
  charset:         'utf8mb4',
});

// 2. Pool untuk Tenant Default (crmdemo)
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

// Fungsi untuk mendapatkan pool dinamis berdasarkan kredensial (Fase 3 Lanjutan)
function getDynamicPool(config) {
  return mysql.createPool({
    host: config.host,
    port: config.port || 3306,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: 5,
    waitForConnections: true,
    timezone: '+07:00',
    charset: 'utf8mb4'
  });
}

/**
 * Uji koneksi saat startup.
 * Lempar error agar server tidak berjalan tanpa database.
 */
async function testConnection() {
  try {
    const conn1 = await mainPool.getConnection();
    console.log('✅ Main DB connected to:', process.env.MAIN_DB_NAME);
    conn1.release();

    const conn2 = await pool.getConnection();
    console.log('✅ Default Tenant DB connected to:', process.env.DB_NAME);
    conn2.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
    process.exit(1);
  }
}

module.exports = { mainPool, pool, getDynamicPool, testConnection };
