'use strict';

/**
 * demo-reset.service.js
 * Service khusus untuk pembersihan otomatis (reset kembali ke 0) database akun Demo Version.
 * 
 * Aturan Pengecualian (TIDAK BOLEH DIHAPUS):
 * - `users`: Menyimpan kredensial login demo (admin / admin123).
 * - `marketing_period`: Menjaga stabilitas periode kerja CRM agar tidak error.
 * - `master_kota`, `master_kecamatan`, `master_kelas`: Data referensi wilayah & kelas untuk pilihan dropdown form.
 * 
 * Hard Safety Guard:
 * - Menolak keras tenant non-demo seperti `derma-indonesia`.
 */

const { mainPool, getDynamicPool } = require('../../config/database');

const PRESERVED_TABLES = new Set([
  'users',
  'marketing_period',
  'master_kota',
  'master_kecamatan',
  'master_kelas'
]);

// Riwayat eksekusi terakhir di-cache in-memory
let lastResetExecution = null;

/**
 * Validasi ketat apakah tenant benar-benar akun demo
 */
function validateDemoTenant(tenantId) {
  const normalized = String(tenantId || '').trim().toLowerCase();

  // Guard mutlak: Dilarang keras mereset tenant produksi!
  if (
    normalized === 'derma-indonesia' ||
    normalized.includes('derma') ||
    normalized === 'u294320793_crmderma'
  ) {
    throw new Error(`CRITICAL SECURITY ALERT: Percobaan reset data dicegah pada tenant produksi: ${tenantId}`);
  }

  // Hanya izinkan tenant demo yang valid
  if (!normalized.includes('demo')) {
    throw new Error(`Akses ditolak: Tenant '${tenantId}' bukan merupakan akun Demo Version.`);
  }

  return true;
}

/**
 * Dapatkan pool koneksi database tenant demo
 */
async function getDemoDbPool(tenantId = 'crm-demo') {
  validateDemoTenant(tenantId);

  const [rows] = await mainPool.query(
    'SELECT * FROM tenant_databases WHERE tenant_id = ? LIMIT 1',
    [tenantId]
  );

  if (rows.length === 0) {
    throw new Error(`Konfigurasi database untuk tenant demo '${tenantId}' tidak ditemukan.`);
  }

  const config = rows[0];

  // Pastikan nama database di config juga mengandung demo
  if (!config.db_name.toLowerCase().includes('demo')) {
    throw new Error(`CRITICAL: Database '${config.db_name}' bukan merupakan database demo!`);
  }

  return getDynamicPool({
    host: config.db_host,
    port: config.db_port || 3306,
    user: config.db_user,
    password: config.db_password,
    database: config.db_name
  });
}

/**
 * Mengecek status jumlah baris tabel database demo saat ini
 */
async function getDemoStatus(tenantId = 'crm-demo') {
  validateDemoTenant(tenantId);
  const demoPool = await getDemoDbPool(tenantId);

  // Ambil daftar semua tabel
  const [tablesRows] = await demoPool.query('SHOW TABLES');
  if (tablesRows.length === 0) {
    return { status: 'empty', tables: [], lastReset: lastResetExecution };
  }

  const tableKey = Object.keys(tablesRows[0])[0];
  const tables = [];

  for (const row of tablesRows) {
    const tableName = row[tableKey];
    const isPreserved = PRESERVED_TABLES.has(tableName);
    
    try {
      const [[countRow]] = await demoPool.query(`SELECT COUNT(*) AS total FROM \`${tableName}\``);
      tables.push({
        table: tableName,
        rows: countRow.total,
        preserved: isPreserved
      });
    } catch (err) {
      tables.push({
        table: tableName,
        rows: -1,
        preserved: isPreserved,
        error: err.message
      });
    }
  }

  // Ambil data kuota di Central DB
  const [[tenantQuota]] = await mainPool.query(
    'SELECT used_siswa, used_sekolah, limit_siswa, limit_sekolah FROM tenants WHERE tenant_id = ?',
    [tenantId]
  );

  return {
    tenantId,
    timestamp: new Date().toISOString(),
    quota: tenantQuota || null,
    preservedTables: Array.from(PRESERVED_TABLES),
    tables,
    lastReset: lastResetExecution
  };
}

/**
 * Menjalankan reset data database demo (kosongkan semua tabel operasional)
 * @param {string} tenantId - ID tenant demo (default 'crm-demo')
 * @param {string} triggeredBy - Pemicu aksi ('cron' | 'manual-api' | 'superadmin')
 */
async function resetDemoData(tenantId = 'crm-demo', triggeredBy = 'cron') {
  validateDemoTenant(tenantId);

  const startTime = Date.now();
  const wibTimeStr = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'full',
    timeStyle: 'long'
  }).format(new Date());

  console.log(`\n===============================================================`);
  console.log(`[DEMO RESET] 🧹 Memulai Reset Database Demo [${tenantId}]`);
  console.log(`[DEMO RESET] Pemicu: ${triggeredBy}`);
  console.log(`[DEMO RESET] Waktu: ${wibTimeStr} (${new Date().toISOString()})`);
  console.log(`===============================================================`);

  const demoPool = await getDemoDbPool(tenantId);
  const conn = await demoPool.getConnection();

  const resetDetails = [];
  const preservedDetails = [];

  try {
    // 1. Ambil semua tabel dalam database
    const [tablesRows] = await conn.query('SHOW TABLES');
    if (tablesRows.length === 0) {
      console.log('[DEMO RESET] ⚠️ Tidak ada tabel ditemukan di database demo.');
      return { success: true, message: 'Database demo kosong' };
    }

    const tableKey = Object.keys(tablesRows[0])[0];
    const allTableNames = tablesRows.map(r => r[tableKey]);

    // 2. Nonaktifkan foreign key checks sementara agar TRUNCATE tidak terhalang relasi
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    for (const tableName of allTableNames) {
      if (PRESERVED_TABLES.has(tableName)) {
        // Ambil jumlah baris data yang dipertahankan
        const [[countRow]] = await conn.query(`SELECT COUNT(*) AS total FROM \`${tableName}\``);
        preservedDetails.push({ table: tableName, rows: countRow.total });
        console.log(`[DEMO RESET] 🛡️ DIKECUALIKAN: \`${tableName}\` (${countRow.total} baris dipertahankan)`);
        continue;
      }

      // Ambil count sebelum reset
      let rowsBefore = 0;
      try {
        const [[bRow]] = await conn.query(`SELECT COUNT(*) AS total FROM \`${tableName}\``);
        rowsBefore = bRow.total;
      } catch (_) {}

      // Bersihkan data tabel
      let method = 'TRUNCATE';
      try {
        await conn.query(`TRUNCATE TABLE \`${tableName}\``);
      } catch (truncErr) {
        // Fallback jika TRUNCATE tidak diizinkan di user hostinger
        method = 'DELETE';
        await conn.query(`DELETE FROM \`${tableName}\``);
        try {
          await conn.query(`ALTER TABLE \`${tableName}\` AUTO_INCREMENT = 1`);
        } catch (_) {}
      }

      resetDetails.push({
        table: tableName,
        rowsBefore,
        rowsAfter: 0,
        method
      });

      console.log(`[DEMO RESET] 🧹 RESET: \`${tableName}\` (${rowsBefore} baris -> 0 baris via ${method})`);
    }

    // 3. Kembalikan foreign key checks
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    // 4. Reset counter pemakaian kuota di Central DB (u294320793_nexamain.tenants)
    await mainPool.query(
      'UPDATE tenants SET used_siswa = 0, used_sekolah = 0 WHERE tenant_id = ?',
      [tenantId]
    );
    console.log(`[DEMO RESET] 🔄 Quota counter used_siswa & used_sekolah diset kembali ke 0 di nexamain.tenants`);

    const executionDurationMs = Date.now() - startTime;
    const result = {
      success: true,
      tenantId,
      triggeredBy,
      executedAtWib: wibTimeStr,
      executedAtIso: new Date().toISOString(),
      durationMs: executionDurationMs,
      totalTablesReset: resetDetails.length,
      totalTablesPreserved: preservedDetails.length,
      preservedDetails,
      resetDetails
    };

    lastResetExecution = result;

    console.log(`[DEMO RESET] ✅ Berhasil membersihkan ${resetDetails.length} tabel dalam ${executionDurationMs}ms.`);
    console.log(`===============================================================\n`);

    return result;

  } catch (error) {
    // Pastikan foreign key checks kembali aktif bila terjadi error
    try { await conn.query('SET FOREIGN_KEY_CHECKS = 1'); } catch (_) {}
    console.error(`[DEMO RESET] ❌ Gagal melakukan reset database demo:`, error.message);
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = {
  PRESERVED_TABLES,
  validateDemoTenant,
  getDemoStatus,
  resetDemoData
};
