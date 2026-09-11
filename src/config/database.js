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
  timezone:        'Z',
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
  timezone:        'Z',     // Server MySQL ternyata di UTC
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
    timezone: 'Z',
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
    
    // Auto Migrate reaction column for all tenants
    try {
      const [rows] = await mainPool.query('SELECT * FROM tenant_databases');
      for (const config of rows) {
        const tPool = getDynamicPool({
          host: config.db_host,
          port: 3306,
          user: config.db_user,
          password: config.db_password,
          database: config.db_name
        });
        try {
          // Attempt to add column, ignore if exists
          await tPool.query('ALTER TABLE chat_messages ADD COLUMN reaction VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;');
          console.log(`✅ Auto-Migrate: Added reaction column to ${config.db_name}`);
          // Auto-Migrate: sekolah_periode.pipeline_state
          try {
            const [spCols] = await tPool.query("SHOW COLUMNS FROM sekolah_periode LIKE 'pipeline_state'");
            if (spCols.length === 0) {
              await tPool.query("ALTER TABLE sekolah_periode ADD COLUMN pipeline_state VARCHAR(50) NULL DEFAULT 'Identified' AFTER status_terkini;");
              try { await tPool.query("ALTER TABLE sekolah_periode ADD INDEX idx_sp_pipeline_state (pipeline_state);"); } catch(eIdx) {}
              await tPool.query(`
                UPDATE sekolah_periode
                SET pipeline_state = CASE
                  WHEN status_terkini IN ('Belum Visit', 'Tunggu Visit Ulang') THEN 'Identified'
                  WHEN status_terkini IN ('Tunggu Keputusan', 'Tunggu Jadwal Sosialisasi', 'Diminta Meeting') THEN 'Engaged'
                  WHEN status_terkini = 'Sosialisasi Terjadwal' THEN 'Sosialisasi Terjadwal'
                  WHEN status_terkini = 'Sudah Sosialisasi' THEN 'Sudah Sosialisasi'
                  WHEN status_terkini IN ('Identity Captured', 'Data Siswa Terinput') THEN 'Identity Captured'
                  WHEN status_terkini IN ('Tidak Bisa Sosialisasi', 'Nonaktif / Tutup / Merger', 'Ditolak Final') THEN 'Disqualified'
                  ELSE IFNULL(pipeline_state, 'Identified')
                END
                WHERE pipeline_state IS NULL OR pipeline_state = '' OR pipeline_state = 'Identified';
              `);
              console.log(`✅ Auto-Migrate: Added pipeline_state to ${config.db_name}`);
            }
          } catch (eSp) {
            // Abaikan jika tabel tidak ada
          }
        } catch (e) {
          if (e.code === 'ER_DUP_FIELDNAME') {
             try {
                await tPool.query('ALTER TABLE chat_messages MODIFY reaction VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;');
             } catch(e2) {}
          }
        }
      }
    } catch(err) {
       console.log('Migrate warning:', err.message);
    }

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
