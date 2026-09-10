'use strict';
const mysql = require('mysql2/promise');
require('dotenv').config({ path: __dirname + '/.env' });

async function run() {
  const pool = mysql.createPool({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT || 3306,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const conn = await pool.getConnection();
  try {
    // STEP 1: Create table
    console.log('Step 1: CREATE TABLE student_current_state...');
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COMMENT='Read-Model Projection snapshot status siswa per CRO'
    `);
    console.log('  OK: Tabel siap.');

    // STEP 2: Populate dari siswa_periode
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

    // STEP 3: Verifikasi
    console.log('Step 3: Verifikasi isi tabel...');
    const [rows] = await conn.query(
      'SELECT pipeline_state, cro_assignee, COUNT(*) as total FROM student_current_state GROUP BY pipeline_state, cro_assignee ORDER BY total DESC'
    );
    if (rows.length === 0) {
      console.log('  (tabel kosong — siswa_periode mungkin masih kosong)');
    } else {
      rows.forEach(r => console.log(`  - CRO: ${r.cro_assignee || '(unassigned)'} | State: ${r.pipeline_state || '(null)'} | ${r.total} siswa`));
    }

    console.log('\nMIGRASI SELESAI!');
  } catch(err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
