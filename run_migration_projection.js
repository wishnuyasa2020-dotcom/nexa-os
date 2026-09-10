'use strict';
const mysql = require('mysql2/promise');
require('dotenv').config({ path: __dirname + '/.env' });

async function run() {
  const mainPool = mysql.createPool({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT || 3306,
    user:     process.env.MAIN_DB_USER || process.env.DB_USER,
    password: process.env.MAIN_DB_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.MAIN_DB_NAME || 'u294320793_nexamain',
  });

  try {
    const [tenants] = await mainPool.query('SELECT tenant_id, db_host, db_port, db_name, db_user, db_password FROM tenant_databases');
    console.log(`Ditemukan ${tenants.length} tenant untuk dimigrasi:`, tenants.map(t => t.tenant_id));

    for (const t of tenants) {
      console.log(`\n======================================================`);
      console.log(`Migrasi Tenant: ${t.tenant_id} (${t.db_name})`);
      console.log(`======================================================`);
      
      const tPool = mysql.createPool({
        host: t.db_host,
        port: t.db_port || 3306,
        user: t.db_user,
        password: t.db_password,
        database: t.db_name,
      });

      const conn = await tPool.getConnection();
      try {
        console.log('Step 1: CREATE TABLE IF NOT EXISTS student_current_state...');
        await conn.query(`
          CREATE TABLE IF NOT EXISTS student_current_state (
            id_siswa         VARCHAR(50)  NOT NULL,
            nama_siswa       VARCHAR(150) NULL,
            cro_assignee     VARCHAR(100) NULL,
            pipeline_state   VARCHAR(50)  NULL,
            status_label     VARCHAR(50)  NULL,
            marketing_period VARCHAR(20)  NULL,
            updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id_siswa),
            INDEX idx_cro_assignee  (cro_assignee),
            INDEX idx_pipeline_state (pipeline_state)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='Read-Model Projection snapshot status siswa per CRO'
        `);
        // Pastikan collation seragam dengan conversations & siswa_periode (utf8mb4_unicode_ci)
        await conn.query(`ALTER TABLE student_current_state CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        console.log('  OK: Tabel siap dan collation utf8mb4_unicode_ci tervalidasi.');

        console.log('Step 2: Populate dari siswa_periode...');
        const [result] = await conn.query(`
          INSERT INTO student_current_state
            (id_siswa, nama_siswa, cro_assignee, pipeline_state, status_label, marketing_period, updated_at)
          SELECT
            sp.id_siswa,
            ms.nama_lengkap,
            sp.cro,
            COALESCE(sp.commercial_state, 'Lead'),
            sp.status_terkini,
            sp.marketing_period,
            COALESCE(sp.last_updated, NOW())
          FROM siswa_periode sp
          JOIN master_siswa ms ON ms.id_siswa = sp.id_siswa
          WHERE sp.id_record = (
            SELECT id_record FROM siswa_periode sp2
            WHERE sp2.id_siswa = sp.id_siswa
            ORDER BY sp2.last_updated DESC, sp2.created_date DESC
            LIMIT 1
          )
          ON DUPLICATE KEY UPDATE
            cro_assignee     = VALUES(cro_assignee),
            pipeline_state   = VALUES(pipeline_state),
            status_label     = VALUES(status_label),
            marketing_period = VALUES(marketing_period),
            updated_at       = VALUES(updated_at)
        `);
        console.log(`  OK: ${result.affectedRows} baris di-populate.`);

        console.log('Step 3: Verifikasi isi tabel...');
        const [rows] = await conn.query(
          'SELECT pipeline_state, cro_assignee, COUNT(*) as total FROM student_current_state GROUP BY pipeline_state, cro_assignee ORDER BY total DESC'
        );
        rows.forEach(r => console.log(`  - CRO: ${r.cro_assignee || '(unassigned)'} | State: ${r.pipeline_state || '(null)'} | ${r.total} siswa`));
      } catch (tErr) {
        console.error(`  ERROR on tenant ${t.tenant_id}:`, tErr.message);
      } finally {
        conn.release();
        await tPool.end();
      }
    }
    console.log('\nSEMUA TENANT SELESAI DIMIGRASI!');
  } finally {
    await mainPool.end();
  }
}

run().catch(console.error);
