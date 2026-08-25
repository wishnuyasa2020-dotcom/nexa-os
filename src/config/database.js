'use strict';

const mysql = require('mysql2/promise');
const { AsyncLocalStorage } = require('async_hooks');
require('dotenv').config();

const tenantStorage = new AsyncLocalStorage();
const tenantPoolsCache = new Map();

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
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
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
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
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
    charset: 'utf8mb4',
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
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

/**
 * Fungsi untuk mendapatkan pool tenant (dari cache atau buat baru)
 */
async function getTenantPoolFromId(tenantId) {
  if (!tenantId) return null;
  if (tenantPoolsCache.has(tenantId)) return tenantPoolsCache.get(tenantId);
  
  const [rows] = await mainPool.query('SELECT * FROM tenant_databases WHERE tenant_id = ?', [tenantId]);
  if (rows.length === 0) return null;
  
  const config = rows[0];
  const tPool = getDynamicPool({
    host: config.db_host,
    port: 3306,
    user: config.db_user,
    password: config.db_password,
    database: config.db_name
  });
  tenantPoolsCache.set(tenantId, tPool);
  return tPool;
}

// ── PROXY INTERCEPTION ──────────────────────────────────────────

const originalQuery = pool.query.bind(pool);
pool.query = async function(...args) {
  const tenantId = tenantStorage.getStore();
  if (tenantId) {
    const tPool = await getTenantPoolFromId(tenantId);
    if (tPool) return tPool.query(...args);
  }
  return originalQuery(...args);
};

const originalExecute = pool.execute.bind(pool);
pool.execute = async function(...args) {
  const tenantId = tenantStorage.getStore();
  if (tenantId) {
    const tPool = await getTenantPoolFromId(tenantId);
    if (tPool) return tPool.execute(...args);
  }
  return originalExecute(...args);
};

const originalGetConnection = pool.getConnection.bind(pool);
pool.getConnection = async function(...args) {
  const tenantId = tenantStorage.getStore();
  if (tenantId) {
    const tPool = await getTenantPoolFromId(tenantId);
    if (tPool) return tPool.getConnection(...args);
  }
  return originalGetConnection(...args);
};

module.exports = { mainPool, pool, getDynamicPool, testConnection, tenantStorage };
